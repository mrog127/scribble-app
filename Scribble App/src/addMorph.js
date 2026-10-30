import { buildDragCloneShell } from './dragClone.js'
// Add item opening and closing: the resting pill in the control bar morphs into
// the open Add item box, and (on Cancel) back.
//
// Opening: the box itself (.footer.add-open) takes its final layout at once.
// What moves is a stand-in for its skin — the same clear glass, just beneath
// it — growing from the pill's rect to the box's on a soft spring.
// The real box's skin is hidden meanwhile, and the box (contents only) is
// scaled and moved to sit inside the stand-in, so its contents grow with it as
// they fade in. A copy of the pill's icons fades out. The box's rect is read
// every frame, so the shape follows it as the keyboard comes up.
//
// Closing runs the same thing backwards: a stand-in skin shrinks from the box
// to the pill, carrying a copy of the box's contents that shrinks and fades,
// while a copy of the pill's icons fades back in.
//
// The shape moves like a window to and from the Mac's Dock (the "genie"): each
// row of it runs the same spring, the rows nearest the pill a little behind the
// rest, so the shape pours out of the pill (and back into it) with a pinched,
// curving waist. Contents are clipped to that shape.

// The motion: 0.5s end to end (each row's move, plus the genie's stagger),
// starting fast and slowing into place on an ease-out curve (quartic — no
// overshoot). LAG_SHARE is how much of the 0.5s is the stagger.
const TOTAL_MS = 500
const LAG_SHARE = 1 / 3
const DURATION = TOTAL_MS * (1 - LAG_SHARE)
const springAt = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t / DURATION)), 4)
const lerp = (a, b, p) => a + (b - a) * p
const clamp01 = (x) => Math.max(0, Math.min(1, x))
// Fades run on time, eased, not on the spring
const ease = (x) => 1 - Math.pow(1 - clamp01(x), 2)

let running = null

// The keyboard's height, remembered from the last time it came up, so the box
// can be laid out above it before the keyboard's own resize arrives
const KB_KEY = 'scribble-kb-h'
const touch = () => !!window.matchMedia?.('(pointer: coarse)').matches
export const KB_PREDICT = {
  WINDOW: 900,
  until: 0,
  arm() { if (touch()) this.until = Date.now() + this.WINDOW },
  active() { return Date.now() < this.until && this.height() > 150 },
  height() { try { return Number(localStorage.getItem(KB_KEY)) || 0 } catch { return 0 } },
  save(h) { try { localStorage.setItem(KB_KEY, String(Math.round(h))) } catch { /* private mode */ } },
}

// Set (or clear, with '') an element's clip, prefixed too.
// Safari can keep showing an old clip after clip-path is removed (the Easels
// menu stayed cut to a smaller, mid-animation shape). So a clip is never just
// removed: it's first changed to one that clips nothing — whatever Safari then
// holds on to is harmless — and only dropped some time later.
const NO_CLIP = 'inset(-100vmax round 0px)'
function setClip(el, v) {
  const val = v || NO_CLIP
  el.style.clipPath = val
  el.style.webkitClipPath = val
}
function dropClip(el) {
  setClip(el, '')
  setTimeout(() => {
    if (el.style.clipPath && el.style.clipPath.startsWith('inset(-100vmax')) {
      el.style.clipPath = ''
      el.style.webkitClipPath = ''
    }
  }, 400)
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// The keyboard's top edge as it comes up or goes down (a phone's keyboard
// takes about this long, easing out), so the shape can ride above it rather
// than slip under it. Returns null when there's no keyboard to mind.
const KB_MOVE = 300
function keyboardEdge(opening) {
  if (!touch()) return null
  const vv = window.visualViewport
  const full = window.innerHeight
  let top0, top1
  if (opening) {
    const h = KB_PREDICT.height()
    if (h <= 150) return null
    top0 = full; top1 = full - h
  } else {
    if (!vv || full - vv.height <= 150) return null
    top0 = vv.offsetTop + vv.height; top1 = full
  }
  const t0 = performance.now()
  const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3)
  return (now) => lerp(top0, top1, easeOut((now - t0) / KB_MOVE))
}
// Squeeze a genie shape's width about its middle by k (1 = untouched) — for a
// shape travelling between two things of the same width, so it visibly morphs
function squish(genie, k) {
  if (k === 1) return genie
  const cx = (genie.box.left + genie.box.right) / 2
  const sx = (x) => cx + (x - cx) * k
  const box = { ...genie.box, left: sx(genie.box.left), right: sx(genie.box.right), width: genie.box.width * k }
  return { box, pts: genie.pts.map(([x, y]) => [sx(x), y]), foot: { ...genie.foot, left: sx(genie.foot.left), right: sx(genie.foot.right) } }
}
// …to SQUISH of its width halfway through, and back out by the end
const SQUISH = 2 / 3
const squishAt = (f) => 1 - (1 - SQUISH) * Math.sin(Math.PI * clamp01(f))

// Lift a genie shape so it sits at least 8px above the keyboard's edge
function riseAbove(genie, edgeY) {
  if (edgeY == null) return genie
  const lift = genie.box.bottom - (edgeY - 8)
  if (lift <= 0) return genie
  const box = { ...genie.box, top: genie.box.top - lift, bottom: genie.box.bottom - lift }
  return {
    box,
    pts: genie.pts.map(([x, y]) => [x, y - lift]),
    foot: { ...genie.foot, bottom: genie.foot.bottom - lift },
  }
}

// The clear glass, drawn in the genie's shape. A clipped element can't blur
// what's behind it (clip-path cuts it off from its backdrop), so the glass
// carries its own: a blurred copy of the page, lined up with the page behind.
function glassOf(el) {
  for (const p of [null, '::after', '::before']) {
    const c = getComputedStyle(el, p)
    const bf = c.backdropFilter || c.webkitBackdropFilter
    if (bf && bf !== 'none') return { bf, img: getComputedStyle(el).backgroundImage }
  }
  return { bf: 'blur(10px) saturate(1.8)', img: getComputedStyle(el).backgroundImage }
}
// The glass's drop shadow (its outer box-shadow) and the gradient of its stroke
// (the ring its ::before draws), read off the real glass
function glassEdges(el) {
  const shadows = getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/).map(x => x.trim())
  const outer = shadows.find(x => x && x !== 'none' && !/inset/.test(x))
  let shadow = 'none'
  if (outer) {
    const color = (outer.match(/rgba?\([^)]*\)/) || ['rgba(0,0,0,0.2)'])[0]
    const lens = outer.replace(color, '').trim().split(/\s+/).slice(0, 3)
    shadow = `drop-shadow(${lens.join(' ')} ${color})`
  }
  const ring = getComputedStyle(el, '::before').backgroundImage
  const cols = ring && ring !== 'none' ? ring.match(/rgba?\([^)]*\)/g) : null
  return { shadow, stroke: cols && cols.length >= 2 ? [cols[0], cols[cols.length - 1]] : null }
}
let gradId = 0
function makeGlass(sample, z, opts = {}) {
  const { bf, img } = glassOf(sample)
  const edges = glassEdges(sample)
  const shadow = edges.shadow
  const stroke = opts.stroke || edges.stroke
  // The whole thing casts the glass's shadow (a filter on the wrapper, so the
  // shadow follows the shape)
  const wrap = document.createElement('div')
  wrap.className = 'add-morph-glass'
  wrap.setAttribute('aria-hidden', 'true')
  wrap.style.cssText = `position:absolute;margin:0;padding:0;pointer-events:none;z-index:${z};filter:${shadow};`
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;margin:0;padding:0;pointer-events:none;overflow:hidden;background-repeat:no-repeat;'
  // What the glass shows instead of the sharp page behind it: the screen's own
  // background, and over it (backdrop()) the page, blurred
  const phone = sample.closest('.phone') || document.getElementById('app')
  el.style.backgroundColor = phone ? getComputedStyle(phone).backgroundColor : 'transparent'
  // the glass's tint sits over the blurred page
  const tint = document.createElement('div')
  tint.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:1;background-image:${img};background-repeat:no-repeat;`
  el.appendChild(tint)
  wrap.appendChild(el)
  // The stroke: the glass's gradient ring, traced along the shape's outline
  let outline = null
  if (stroke) {
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('style', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:3;')
    const id = `add-morph-stroke-${++gradId}`
    const defs = document.createElementNS(NS, 'defs')
    const lg = document.createElementNS(NS, 'linearGradient')
    lg.setAttribute('id', id)
    lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0'); lg.setAttribute('x2', '1'); lg.setAttribute('y2', '1')
    // The ring's gradient blends in premultiplied colour (as CSS gradients do);
    // an SVG gradient blends colour and alpha apart, which turned the middle of
    // white → faint black into a solid grey line. So it's laid out in steps.
    const parse = (c) => { const [r, g, b, a = 1] = (c.match(/[\d.]+/g) || [0, 0, 0]).map(Number); return { r, g, b, a } }
    const c0 = parse(stroke[0]), c1 = parse(stroke[1])
    const STEPS = 12
    for (let i = 0; i <= STEPS; i++) {
      const u = i / STEPS
      const a = c0.a * (1 - u) + c1.a * u
      const ch = (k) => a ? Math.round((c0[k] * c0.a * (1 - u) + c1[k] * c1.a * u) / a) : 0
      const st = document.createElementNS(NS, 'stop')
      st.setAttribute('offset', String(u))
      st.setAttribute('stop-color', `rgb(${ch('r')}, ${ch('g')}, ${ch('b')})`)
      st.setAttribute('stop-opacity', String(a))
      lg.appendChild(st)
    }
    defs.appendChild(lg)
    svg.appendChild(defs)
    outline = document.createElementNS(NS, 'polygon')
    outline.setAttribute('fill', 'none')
    outline.setAttribute('stroke', `url(#${id})`)
    outline.setAttribute('stroke-width', '1.5')
    outline.setAttribute('stroke-linejoin', 'round')
    svg.appendChild(outline)
    wrap.appendChild(svg)
  }
  let layer = null, layerRect = null
  const draw = ({ box, pts }) => {
    place(wrap, box)
    setClip(el, clipFor(pts, box))
    if (outline) outline.setAttribute('points', pts.map(([x, y]) => `${(x - box.left).toFixed(2)},${(y - box.top).toFixed(2)}`).join(' '))
    // one gradient across the whole shape
    tint.style.backgroundSize = `${box.width}px ${box.height}px`
    if (layer) {
      layer.style.left = (layerRect.left - box.left) + 'px'
      layer.style.top = (layerRect.top - box.top) + 'px'
    }
  }
  // The page behind, blurred as the glass would blur it
  const backdrop = (page) => {
    if (!page || layer) return
    const c = copyPage(page, el, 0)
    layer = c.snap
    layerRect = c.rect
    layer.style.filter = bf
    el.insertBefore(layer, tint)
  }
  const backdropOpacity = (o) => { if (layer) layer.style.opacity = String(o) }
  // A second tint the glass turns into — the colours of whatever it becomes
  // (the new item toast)
  let dest = null
  const tintTo = (target) => {
    if (dest || !target) return
    const c = getComputedStyle(target)
    dest = document.createElement('div')
    dest.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:2;opacity:0;background-color:${c.backgroundColor};background-image:${c.backgroundImage};background-size:100% 100%;background-repeat:no-repeat;`
    el.appendChild(dest)
  }
  const tintOpacity = (o) => { if (dest) dest.style.opacity = String(o) }
  return { el: wrap, draw, backdrop, backdropOpacity, tintTo, tintOpacity }
}

// Viewport rect → position inside `el`'s containing block
function place(el, r, radius) {
  const op = el.offsetParent
  const b = op?.getBoundingClientRect() || { left: 0, top: 0 }
  el.style.left = (r.left - b.left - (op?.clientLeft || 0)) + 'px'
  el.style.top = (r.top - b.top - (op?.clientTop || 0)) + 'px'
  el.style.width = Math.max(0, r.width) + 'px'
  el.style.height = Math.max(0, r.height) + 'px'
  if (radius != null) el.style.borderRadius = Math.max(0, radius) + 'px'
}
const mix = (a, b, p) => ({ left: lerp(a.left, b.left, p), top: lerp(a.top, b.top, p), width: lerp(a.width, b.width, p), height: lerp(a.height, b.height, p) })
// The transform that lays a box of rect `box` over rect `onto`
const fit = (box, onto) => `translate(${onto.left - box.left}px, ${onto.top - box.top}px) scale(${box.width ? onto.width / box.width : 1}, ${box.height ? onto.height / box.height : 1})`

// A copy of the pill's icons, laid where they sit in the pill
function pillIcons(pillEl, pillRect) {
  const picks = pillEl.querySelector('.mbar-type-picks, .mbar-placeholder')
  if (!picks) return null
  const r = picks.getBoundingClientRect()
  const icons = picks.cloneNode(true)
  icons.style.cssText = `position:absolute;left:${r.left - pillRect.left}px;top:${r.top - pillRect.top}px;width:${r.width}px;height:${r.height}px;display:flex;align-items:center;margin:0;pointer-events:none;opacity:1;z-index:2;`
  return icons
}

// The page behind the bar. Opening collapses it at once (the box takes its
// room), so a copy of it, as it was, stands in its place and fades out.
const FADE_PAGE_BY = 2 / 3
const findPage = (phone) => [...phone.querySelectorAll('.page')].find(p => p.getBoundingClientRect().height > 0 && !/exiting/.test(p.className) && !p.classList.contains('add-morph-page'))
// A static copy of `page`, put in `parent` with its scroll positions kept
function copyPage(page, parent, z) {
  const scroll = [...page.querySelectorAll('*')].filter(n => n.scrollTop > 0).map(n => [n, n.scrollTop])
  const snap = page.cloneNode(true)
  snap.setAttribute('aria-hidden', 'true')
  snap.classList.add('add-morph-page')
  snap.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
  snap.removeAttribute('id')
  snap.style.cssText += `;position:absolute;margin:0;flex:none;pointer-events:none;z-index:${z};transition:none;opacity:1;overflow:hidden;`
  const r = page.getBoundingClientRect()
  snap.style.width = r.width + 'px'
  snap.style.height = r.height + 'px'
  parent.appendChild(snap)
  snap.scrollTop = page.scrollTop
  // Inner scrollers (the cards area) keep their scroll too
  const all = page.querySelectorAll('*'), copy = snap.querySelectorAll('*')
  const index = new Map([...all].map((n, i) => [n, i]))
  scroll.forEach(([n, top]) => { const c = copy[index.get(n)]; if (c) c.scrollTop = top })
  return { snap, rect: r }
}
function pageSnapshot(footer) {
  const page = findPage(footer.parentElement)
  if (!page) return null
  const { snap, rect } = copyPage(page, footer.parentElement, 1)
  place(snap, rect)
  return { snap, page }
}

// The genie: rows away from the pill lead, rows at the pill lag by up to LAG ms
const LAG = TOTAL_MS * LAG_SHARE
const TOTAL = DURATION + LAG
// The shape at time t, between rect `a` (radius ra) and rect `b` (radius rb).
// `pillAt` is 'a' when the shape grows out of the pill (a = pill) or 'b' when it
// shrinks into it. Returns its bounding box and its outline (viewport points).
export function genieShape(a, ra, b, rb, t, pillAt) {
  // v: 0 at the top row, 1 at the bottom (the pill's side)
  const lagOf = (v) => LAG * Math.pow(pillAt === 'a' ? v : 1 - v, 1.6)
  const pOf = (v) => springAt(Math.max(0, t - lagOf(v)))
  const top = lerp(a.top, b.top, pOf(0))
  const bottom = lerp(a.bottom, b.bottom, pOf(1))
  const h = Math.max(1, bottom - top)
  const edge = (v) => { const p = pOf(v); return [lerp(a.left, b.left, p), lerp(a.right, b.right, p)] }
  const r = Math.max(0, Math.min(lerp(ra, rb, clamp01(pOf(0.5))), h / 2, (edge(0)[1] - edge(0)[0]) / 2, (edge(1)[1] - edge(1)[0]) / 2))
  // Rows: dense through the rounded corners, even between
  const ys = new Set()
  const N = 8
  for (let i = 0; i <= N; i++) {
    const dy = r * (1 - Math.cos((i / N) * Math.PI / 2))
    ys.add(dy); ys.add(h - dy)
  }
  for (let i = 1; i < 20; i++) ys.add((i / 20) * h)
  const rows = [...ys].filter(y => y >= 0 && y <= h).sort((x, y) => x - y)
  const right = [], left = []
  for (const y of rows) {
    const [l, rr] = edge(y / h)
    const dy = Math.min(y, h - y)
    const inset = dy < r ? r - Math.sqrt(Math.max(0, r * r - (r - dy) * (r - dy))) : 0
    right.push([rr - inset, top + y])
    left.push([l + inset, top + y])
  }
  const pts = [...right, ...left.reverse()]
  const xs = pts.map(q => q[0])
  const box = { left: Math.min(...xs), top, width: Math.max(...xs) - Math.min(...xs), height: h }
  box.right = box.left + box.width; box.bottom = top + h
  const bottomRow = edge(1)
  return { box, pts, foot: { left: bottomRow[0], right: bottomRow[1], bottom } }
}
// The plain version: every edge leaves at once and lands at once (each moving
// as fast as its distance needs), over the whole TOTAL — no genie lag
export function rectShape(a, ra, b, rb, t, total = TOTAL, waist = 0) {
  const p = 1 - Math.pow(1 - clamp01(t / total), 4)
  const box = { left: lerp(a.left, b.left, p), top: lerp(a.top, b.top, p), right: lerp(a.right, b.right, p), bottom: lerp(a.bottom, b.bottom, p) }
  box.width = Math.max(1, box.right - box.left); box.height = Math.max(1, box.bottom - box.top)
  const r = Math.max(0, Math.min(lerp(ra, rb, p), box.width / 2, box.height / 2))
  const pts = []
  const N = 8
  const corner = (cx, cy, a0) => { for (let i = 0; i <= N; i++) { const a = a0 + (i / N) * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) } }
  // (the straight sides get points along them too, so a waist can bend them)
  const side = (x, y0, y1) => { for (let i = 1; i < 20; i++) pts.push([x, y0 + (y1 - y0) * (i / 20)]) }
  corner(box.right - r, box.top + r, -Math.PI / 2)
  side(box.right, box.top + r, box.bottom - r)
  corner(box.right - r, box.bottom - r, 0)
  corner(box.left + r, box.bottom - r, Math.PI / 2)
  side(box.left, box.bottom - r, box.top + r)
  corner(box.left + r, box.top + r, Math.PI)
  // Squeezed in at its top and bottom by `waist` of its width (a barrel),
  // full width through the middle
  if (waist > 0) {
    const cx = (box.left + box.right) / 2
    for (const q of pts) {
      const v = (q[1] - box.top) / box.height
      q[0] = cx + (q[0] - cx) * (1 - waist * (1 - Math.sin(Math.PI * clamp01(v))))
    }
  }
  return { box, pts, foot: { left: box.left, right: box.right, bottom: box.bottom } }
}
// The outline pulled in by px all round (about its middle) — the contents are
// cut a hair inside the glass, so their cut edge never lies on the glass's
const inset = (pts, box, px) => {
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2
  const kx = box.width > 2 * px ? 1 - (2 * px) / box.width : 1
  const ky = box.height > 2 * px ? 1 - (2 * px) / box.height : 1
  return pts.map(([x, y]) => [cx + (x - cx) * kx, cy + (y - cy) * ky])
}
// The outline as a clip-path, in the coordinates of an element laid on `box`
// at its own size `own` (scaled to fit the box)
const clipFor = (pts, box, own) => {
  const sx = own ? own.width / box.width : 1
  const sy = own ? own.height / box.height : 1
  return 'polygon(' + pts.map(([x, y]) => `${((x - box.left) * sx).toFixed(2)}px ${((y - box.top) * sy).toFixed(2)}px`).join(',') + ')'
}

// A button's corner radius in px ("50%" is a circle)
const cornerOf = (el, r) => {
  const v = getComputedStyle(el).borderTopLeftRadius
  return /%/.test(v) ? Math.min(r.width, r.height) * parseFloat(v) / 100 : (parseFloat(v) || r.height / 2)
}
// What a Cancel pours back into when Add item was opened from somewhere other
// than the bar's pill (a card's plus button)
let origin = null
// The button pressed last, and when — Add item opened from a card's plus is
// handed no element, so it looks here for where it came from
let lastPress = { el: null, at: 0, rect: null, radius: 0, face: null }
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => {
    const el = e.target instanceof Element ? e.target.closest('button, [role="button"]') : null
    // its shape and face are kept too: a menu row is gone by the time the
    // thing it opened is up
    const rect = el?.getBoundingClientRect() || null
    lastPress = { el, at: performance.now(), rect, radius: el && rect ? cornerOfPress(el, rect) : 0, face: null }
  }, true)
}
function cornerOfPress(el, r) {
  const v = getComputedStyle(el).borderTopLeftRadius
  return /%/.test(v) ? Math.min(r.width, r.height) * parseFloat(v) / 100 : (parseFloat(v) || 0)
}
// Where a panel opened just now came from: { el (if still there), rect, radius }
export function recentOrigin(within = 1200) {
  if (!lastPress.rect || performance.now() - lastPress.at > within) return null
  return { el: lastPress.el?.isConnected ? lastPress.el : null, rect: lastPress.rect, radius: lastPress.radius }
}
export const recentlyPressed = (within = 1000) =>
  (lastPress.el && lastPress.el.isConnected && performance.now() - lastPress.at < within) ? lastPress.el : null

// Open Add item out of `fromEl`: the bar's pill, or (with the bar's `footer`
// given) any button — a card's plus
// A copy of a button's face — its icon and label, not its chrome (a button's
// own fill and border depend on where it sits, so a copy out of place could
// come out in the wrong colours) — laid over the whole button
function buttonFace(btn, r) {
  const c = getComputedStyle(btn)
  const face = document.createElement('div')
  face.style.cssText = `position:absolute;left:0;top:0;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;opacity:1;z-index:2;display:flex;align-items:center;justify-content:${c.justifyContent === 'normal' ? 'center' : c.justifyContent};gap:${c.gap === 'normal' ? '0px' : c.gap};padding:${c.padding};box-sizing:border-box;color:${c.color};font:${c.font};letter-spacing:${c.letterSpacing};white-space:nowrap;overflow:hidden;`
  ;[...btn.childNodes].forEach(n => {
    const k = n.cloneNode(true)
    if (k.nodeType === 1) {
      k.removeAttribute('id')
      // keep each piece's own computed look
      const src = getComputedStyle(n)
      k.style.color = src.color
      k.style.font = src.font
    }
    face.appendChild(k)
  })
  return face
}

// A canvas card's face: a copy of the whole card (its contents in its own
// layout), with the page's classes and its colours around it so it looks as it
// does in place
function cardFace(card, r) {
  const scope = document.createElement('div')
  const srcPage = card.closest('.page, .note-detail-page')
  scope.className = srcPage ? [...srcPage.classList].filter(c => c === 'home-page' || c === 'category-page' || c === 'note-detail-page').join(' ') : ''
  scope.style.cssText = `position:absolute;left:0;top:0;width:${r.width}px;height:${r.height}px;margin:0;padding:0;border:none;background:none;box-shadow:none;pointer-events:none;z-index:2;overflow:hidden;transform:none;opacity:1;inset:auto;display:block;-webkit-mask-image:none;mask-image:none;`
  const cs = getComputedStyle(card)
  ;['--accent-base', '--accent-dark', '--accent-light', '--accent-base-rgb'].forEach(v => {
    const val = cs.getPropertyValue(v)
    if (val) scope.style.setProperty(v, val.trim())
  })
  const c = card.cloneNode(true)
  c.removeAttribute('id')
  c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
  c.style.cssText += ';position:relative;margin:0;width:100%;height:100%;box-shadow:none;transform:none;animation:none;transition:none;opacity:1;'
  scope.appendChild(c)
  return scope
}
// The add item pill's face is just its row of icons (its other children — the
// field, the press highlight — drew a stray box over them when copied)
function pillFace(pill, r) {
  const icons = pillIcons(pill, r)
  if (!icons) return null
  const wrap = document.createElement('div')
  wrap.style.cssText = `position:absolute;left:0;top:0;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;opacity:1;z-index:2;`
  wrap.appendChild(icons)
  return wrap
}
const faceOf = (el, r) => (el.matches?.('.card') ? cardFace(el, r)
  : (el.matches?.('.add-stack') && pillFace(el, r)) || buttonFace(el, r))

export function startAddMorph(fromEl, footerEl) {
  if (!fromEl) return
  const footer = footerEl || fromEl.closest('.footer')
  if (!footer || !footer.parentElement) return
  if (running) running.finish()
  KB_PREDICT.arm()
  origin = footer.contains(fromEl) ? null : fromEl
  if (reducedMotion()) return

  const pillEl = fromEl
  const from = pillEl.getBoundingClientRect()
  if (!from.width || !from.height) return
  const fromR = cornerOf(pillEl, from)

  // the glass is always the bar's own
  const glass = makeGlass(footer.querySelector('.add-stack') || pillEl, 2)
  const ghost = glass.el
  footer.after(ghost)
  const picks = pillEl.querySelector('.mbar-type-picks, .mbar-placeholder')
  let pr = picks?.getBoundingClientRect()
  let icons = pillIcons(pillEl, from)
  // A plain button: its own face fades out instead of the pill's icons
  if (!icons) {
    icons = faceOf(pillEl, from)
    pr = from
  }
  if (icons) ghost.appendChild(icons)
  // Out of a plus button: the glass starts in the button's colours
  if (origin) { glass.tintTo(pillEl); glass.tintOpacity(1) }

  const shot = pageSnapshot(footer)
  const snap = shot?.snap
  glass.backdrop(shot?.page)

  footer.setAttribute('data-morph', '')
  const kids = [...footer.children]
  kids.forEach(k => { k.style.opacity = '0' })

  const kbEdge = keyboardEdge(true)
  const t0 = performance.now()
  let raf = 0
  let opened = false
  let done = false

  // A frame that throws (or frames that stop coming) must never leave the
  // panel half-morphed — it finishes instead
  const frame = (now) => { try { step(now) } catch (err) { console.warn('morph', err); finish() } }
  const step = (now) => {
    if (done) return
    const t = now - t0
    const open = footer.classList.contains('add-open')
    if (open) opened = true
    // The box's own rect, without the transform laid on it last frame
    footer.style.transform = ''
    setClip(footer, '')
    const to = open ? footer.getBoundingClientRect() : from
    const toR = open ? (parseFloat(getComputedStyle(footer).borderTopLeftRadius) || 32) : fromR
    const genie = riseAbove(genieShape(from, fromR, to, toR, t, 'a'), kbEdge?.(now))
    const { box, pts, foot } = genie
    glass.draw(genie)
    // The box's contents ride inside the shape, at its size, clipped to it
    if (open) {
      footer.style.transformOrigin = '0 0'
      footer.style.transform = fit(to, box)
      setClip(footer, clipFor(inset(pts, box, 2), box, to))
    }
    // The pill's icons stay with the shape's foot, centred
    if (icons && pr) {
      icons.style.left = ((foot.left + foot.right) / 2 - box.left - pr.width / 2) + 'px'
      icons.style.top = (foot.bottom - box.top - (from.bottom - pr.top)) + 'px'
    }

    const f = t / TOTAL
    if (icons) icons.style.opacity = String(1 - ease(f / 0.3))
    glass.tintOpacity(1 - ease(f / 0.6))
    const inOp = ease((f - 0.15) / 0.5)
    kids.forEach(k => { k.style.opacity = String(inOp) })
    const pageOp = 1 - clamp01(f / FADE_PAGE_BY)
    if (snap) snap.style.opacity = String(pageOp)
    glass.backdropOpacity(pageOp)

    // Done once the spring has settled — or straight away if Add item didn't
    // open after all
    if (t >= TOTAL || (!opened && t > 300)) { finish(); return }
    raf = requestAnimationFrame(frame)
  }

  const finish = () => {
    if (done) return
    done = true
    cancelAnimationFrame(raf)
    ghost.remove()
    snap?.remove()
    footer.removeAttribute('data-morph')
    footer.style.transform = ''
    footer.style.transformOrigin = ''
    dropClip(footer)
    kids.forEach(k => { k.style.opacity = '' })
    running = null
  }
  running = { finish }
  setTimeout(() => finish(), TOTAL + 600)
  // Place it before the first paint, so it never shows at the box's own size
  frame(t0)
}

// ---- Add item closing ----
// The open box is copied (skin and contents, separately) and pours, on the same
// spring and genie as opening, into wherever it's going: back into the resting
// pill (Cancel), into the new item's row (sent to the page you're on), or into
// the new item toast (sent elsewhere). The page behind fades back in as it goes.
//
// `dest` says where: find() → the element to pour into, once it exists (null
// until then); reveal: whether the destination shows through a short fade at
// the end (row, toast) or simply takes over (the pill, which is the same glass).
const LAND_FADE = 120
function morphOut(footer, dest) {
  if (!footer || !footer.parentElement || !footer.classList.contains('add-open')) return null
  if (running) running.finish()
  if (reducedMotion()) return null
  origin = null

  footer.style.transform = ''
  const from = footer.getBoundingClientRect()
  const fromR = parseFloat(getComputedStyle(footer).borderTopLeftRadius) || 32

  // Above the bar: the skin, and over it a copy of the box's contents (the copy
  // keeps the box's classes, its own skin hidden)
  const glass = makeGlass(footer, 4)
  const skin = glass.el
  const content = footer.cloneNode(true)
  content.setAttribute('data-morph', '')
  content.setAttribute('aria-hidden', 'true')
  content.classList.add('add-morph-content')
  content.style.cssText += ';position:absolute;margin:0;flex:none;pointer-events:none;z-index:5;transition:none;opacity:1;transform-origin:0 0;box-sizing:border-box;'
  content.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
  content.querySelector('.add-toast')?.remove()
  // Text the user typed lives in properties, not attributes
  const srcFields = footer.querySelectorAll('textarea, input')
  content.querySelectorAll('textarea, input').forEach((n, i) => { if (srcFields[i]) n.value = srcFields[i].value })
  footer.after(skin, content)
  place(content, from)

  // the keyboard going down as the box closes
  const kbEdge = keyboardEdge(false)
  let t0 = 0
  const tStart = performance.now()
  let raf = 0
  let done = false
  let target = null
  let page = null
  let landedAt = 0

  // A frame that throws (or frames that stop coming) must never leave the
  // panel half-morphed — it finishes instead
  const frame = (now) => { try { step(now) } catch (err) { console.warn('morph', err); finish() } }
  const step = (now) => {
    if (done) return
    // The page behind, back at full size once the box has closed, fades in
    if (!page && !footer.classList.contains('add-open')) {
      page = findPage(footer.parentElement)
      if (page) { page.style.transition = 'none'; page.style.opacity = '0' }
    }
    if (!target && !footer.classList.contains('add-open')) {
      target = dest.find(page)
      if (target) {
        t0 = now
        dest.found?.(target, glass)
        // the backdrop is copied after the destination has been brought into
        // view, so it shows the page as it will be
        if (page) { glass.backdrop(page); glass.backdropOpacity(0) }
      }
    }
    // A destination revealed by a short fade fits the move and the fade
    // together into the same 0.5s
    const span = dest.reveal ? TOTAL - LAND_FADE : TOTAL
    const t = t0 ? (now - t0) * (TOTAL / span) : 0
    const to = target ? dest.rect(target) : from
    const toR = target ? dest.radius(target, to) : fromR
    let shape = genieShape(from, fromR, to, toR, t, 'b')
    if (dest.squish && target) shape = squish(shape, squishAt(t / TOTAL))
    const genie = riseAbove(shape, kbEdge?.(now))
    const { box, pts } = genie
    glass.draw(genie)
    content.style.transform = fit(from, box)
    setClip(content, clipFor(inset(pts, box, 2), box, from))
    const f = t / TOTAL
    dest.frame?.(target, genie, f)

    content.style.opacity = String(1 - ease(f / 0.45))
    glass.tintOpacity(ease((f - 0.2) / 0.6))
    if (page) {
      const pageOp = clamp01((f - (1 - FADE_PAGE_BY)) / FADE_PAGE_BY)
      page.style.opacity = String(pageOp)
      glass.backdropOpacity(pageOp)
    }

    // Nowhere to go after all: just finish
    if (!target && now - tStart > 800) { finish(); return }
    if (target && t >= TOTAL) {
      if (!dest.reveal) { finish(); return }
      // Landed: the destination shows, and the glass fades off it
      if (!landedAt) { landedAt = now; dest.show(target); content.style.opacity = '0' }
      // (held a moment first, for a destination that asks — the row)
      const k = (now - landedAt - (dest.hold || 0)) / LAND_FADE
      skin.style.opacity = String(1 - ease(k))
      if (k >= 1) { finish(); return }
    }
    raf = requestAnimationFrame(frame)
  }

  const finish = () => {
    if (done) return
    done = true
    cancelAnimationFrame(raf)
    skin.remove()
    content.remove()
    if (target) dest.show(target)
    dest.done?.()
    if (page) { page.style.opacity = ''; page.style.transition = '' }
    running = null
  }
  running = { finish }
  setTimeout(() => finish(), TOTAL + 2000)
  frame(tStart)
  return { finish }
}

const radiusOf = (el, r) => Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.height / 2, r.width / 2)

// Cancel: call just before Add item closes. The box pours back into the pill,
// whose icons fade in riding down with it.
export function startAddMorphClose(footer) {
  // Opened from a card's plus: back into that card, its face fading in
  const btn = origin
  origin = null
  if (btn && btn.isConnected && btn.getBoundingClientRect().width) {
    let face = null
    morphOut(footer, {
      find: () => (btn.isConnected ? btn : null),
      found: (b, glass) => {
        const r = b.getBoundingClientRect()
        face = faceOf(b, r)
        face.style.opacity = '0'
        glass.el.appendChild(face)
        // the glass takes on the button's own colours as it arrives
        glass.tintTo(b)
        b.style.opacity = '0'
      },
      rect: (b) => b.getBoundingClientRect(),
      radius: (b, r) => cornerOf(b, r),
      frame: (b, { box }, f) => {
        if (!face) return
        const r = b.getBoundingClientRect()
        face.style.left = (r.left - box.left) + 'px'
        face.style.top = (r.top - box.top) + 'px'
        face.style.opacity = String(ease((f - 0.3) / 0.55))
      },
      show: (b) => { b.style.opacity = '' },
      reveal: false,
    })
    return
  }
  let icons = null, pr = null
  morphOut(footer, {
    find: () => footer.querySelector('.add-stack'),
    found: (pill, glass) => {
      pill.style.opacity = '0'
      const r = pill.getBoundingClientRect()
      // (where the icons sit in the pill — the pill itself is still moving down
      // as the keyboard goes, so only the offset is kept)
      const ir = pill.querySelector('.mbar-type-picks, .mbar-placeholder')?.getBoundingClientRect()
      pr = ir ? { width: ir.width, fromBottom: r.bottom - ir.top } : null
      icons = pillIcons(pill, r)
      if (icons) { icons.style.opacity = '0'; glass.el.appendChild(icons) }
    },
    rect: (pill) => pill.getBoundingClientRect(),
    radius: (pill, r) => parseFloat(getComputedStyle(pill).borderTopLeftRadius) || r.height / 2,
    frame: (pill, { box, foot }, f) => {
      if (!icons || !pr) return
      // The pill is still settling (its width eases as the bar comes back), so
      // the icons take its current width and place every frame
      const pr2 = pill.getBoundingClientRect()
      const ir = pill.querySelector('.mbar-type-picks, .mbar-placeholder')?.getBoundingClientRect()
      const picks = pill.querySelector('.mbar-type-picks, .mbar-placeholder')
      if (ir) {
        pr = { width: ir.width, fromBottom: pr2.bottom - ir.top }
        icons.style.width = ir.width + 'px'
        icons.style.height = ir.height + 'px'
        // each icon exactly where the pill's own is (the copy, outside the bar,
        // doesn't get the bar's own layout for them)
        const real = picks ? [...picks.children] : []
        const copies = [...icons.children]
        real.forEach((el, i) => {
          const c = copies[i]
          if (!c) return
          const r = el.getBoundingClientRect()
          c.style.position = 'absolute'
          c.style.margin = '0'
          c.style.flex = 'none'
          c.style.left = (r.left - ir.left) + 'px'
          c.style.top = (r.top - ir.top) + 'px'
          c.style.width = r.width + 'px'
          c.style.height = r.height + 'px'
        })
      }
      icons.style.left = ((foot.left + foot.right) / 2 - box.left - pr.width / 2) + 'px'
      icons.style.top = (foot.bottom - box.top - pr.fromBottom) + 'px'
      // they fade in as the pill forms, riding down with it
      icons.style.opacity = String(ease((f - 0.3) / 0.55))
    },
    show: (pill) => { pill.style.opacity = '' },
    reveal: false,
  })
}

// Sent to the page you're on: call while Add item is still open. The box pours
// into the new row (getRow() finds it once it's there; seek() is called while
// looking — to open its canvas). The page is first scrolled to put the row as
// near its middle as it can go, then fades in around it.
export function startSendToRow(footer, getRow, seek) {
  let lastSeek = 0
  let copy = null
  let cur = null        // the row, as it is now
  let lastRect = null
  // The row is re-made once the save comes back (its temporary id swapped for
  // the real one), which leaves the element we found detached — measuring that
  // sent the shape flying off to the screen's corner. Follow the new one.
  const hide = (el) => { el.style.opacity = '0'; el.style.pointerEvents = 'none' }
  const live = () => {
    if (cur && !cur.isConnected) {
      const n = getRow()
      if (n && n.isConnected) { cur = n; hide(n) }
    }
    return cur
  }
  const rowRect = () => {
    const el = live()
    const r = el?.isConnected ? el.getBoundingClientRect() : null
    if (r && r.height) lastRect = r
    return lastRect
  }
  return morphOut(footer, {
    find: (page) => {
      if (!page) return null
      const now = performance.now()
      if (seek && now - lastSeek > 60) { lastSeek = now; seek() }
      const row = getRow()
      if (!row || !row.getBoundingClientRect().height) return null
      centreInScroller(row)
      return row
    },
    // The row's contents ride above the glass, exactly where they'll sit,
    // fading in so they're fully there as the shape lands
    found: (row) => {
      cur = row
      const inner = row.cloneNode(true)
      const { content } = buildDragCloneShell(row, inner)
      // just the row's contents: not the drag copy's own glass outline (it drew
      // a second, wider pill around the landing one)
      content.querySelectorAll('.drag-glass-stroke').forEach(n => n.remove())
      if (content.classList?.contains('drag-glass-stroke')) content.remove()
      const r = row.getBoundingClientRect()
      lastRect = r
      inner.style.marginLeft = '0'
      inner.style.width = r.width + 'px'
      inner.style.background = 'transparent'
      // (above the glass, not in it — the glass's shadow would fall on it)
      copy = document.createElement('div')
      copy.style.cssText = `position:absolute;margin:0;pointer-events:none;z-index:6;opacity:0;`
      copy.appendChild(content)
      footer.parentElement.appendChild(copy)
      // hidden, and unable to take a hover (the pointer's still there from
      // Send) while it shows through the fading glass
      hide(row)
    },
    // The shape it lands as: the row as it looks long-pressed — a fully rounded
    // pill, 8px in from the row at each side and 4px out above and below
    rect: () => {
      const r = rowRect()
      return { left: r.left + 8, right: r.right - 8, top: r.top - 4, bottom: r.bottom + 4, width: r.width - 16, height: r.height + 8 }
    },
    radius: (row, r) => r.height / 2,
    frame: (row, genie, f) => {
      if (!copy) return
      place(copy, rowRect())
      copy.style.opacity = String(ease((f - 0.3) / 0.7))
    },
    show: () => { const el = live(); if (el) el.style.opacity = '' },
    // a quarter second in the long-pressed form before the glass goes
    hold: 250,
    // the copy stays over the row until the glass has faded off it
    done: () => {
      copy?.remove(); copy = null
      // hover returns only once the pointer next moves
      const el = live()
      if (el) {
        const back = () => { el.style.pointerEvents = ''; window.removeEventListener('pointermove', back, true) }
        window.addEventListener('pointermove', back, true)
        setTimeout(back, 4000)
      }
    },
    reveal: true,
    squish: true,
  })
}

// Sent elsewhere: the box pours into the new item toast, taking on its colours.
export function startSendToToast(footer) {
  return morphOut(footer, {
    find: () => footer.querySelector('.add-toast'),
    found: (toast, glass) => {
      toast.style.animation = 'none'
      toast.style.opacity = '0'
      glass.tintTo(toast)
    },
    rect: (toast) => toast.getBoundingClientRect(),
    radius: (toast, r) => radiusOf(toast, r),
    show: (toast) => { toast.style.opacity = '' },
    reveal: true,
    squish: true,
  })
}

// Scroll the row's scroller (instantly) so the row sits as near the middle of
// it as the content allows
function centreInScroller(row) {
  let sc = row.parentElement
  while (sc && sc !== document.body) {
    const oy = getComputedStyle(sc).overflowY
    if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight) break
    sc = sc.parentElement
  }
  if (!sc || sc === document.body) return
  const s = sc.getBoundingClientRect()
  const r = row.getBoundingClientRect()
  sc.scrollTop += (r.top + r.height / 2) - (s.top + s.height / 2)
}

// ---- Panels: the Easels menu, Move to ----
// The same morph for a panel opening out of the button (or menu row) that
// opened it, and closing back into it. The panel itself is laid out in its
// final place at once; a stand-in for its glass grows from the origin's shape
// to the panel's, and the panel (its skin hidden) is scaled and clipped to ride
// inside it while its contents fade in. Closing copies the panel and runs it
// backwards.
const originRect = (o) => (o.el && o.el.isConnected ? o.el.getBoundingClientRect() : o.rect)
const originRadius = (o, r) => (o.el && o.el.isConnected ? cornerOf(o.el, r) : (o.radius || Math.min(r.height / 2, 16)))
const panels = new WeakMap()

export function morphPanelIn(panel, origin, { squeeze = 0 } = {}) {
  if (!panel || !origin || reducedMotion()) return
  panels.get(panel)?.finish()
  const parent = panel.parentElement
  if (!parent) return
  panel.style.transition = 'none'
  panel.style.opacity = '1'
  // (its glass — shadow, stroke, blur — is read before its own skin is hidden)
  const z = getComputedStyle(panel).zIndex
  const glass = makeGlass(panel, z === 'auto' ? 0 : z)
  panel.setAttribute('data-morph-panel', '')
  panel.before(glass.el)
  let face = null
  if (origin.el && origin.el.isConnected) {
    const r = origin.el.getBoundingClientRect()
    face = faceOf(origin.el, r)
    glass.el.appendChild(face)
  }
  const kids = [...panel.children]
  kids.forEach(k => { k.style.opacity = '0' })
  const t0 = performance.now()
  let raf = 0, done = false
  // A frame that throws (or frames that stop coming) must never leave the
  // panel half-morphed — it finishes instead
  const frame = (now) => { try { step(now) } catch (err) { console.warn('morph', err); finish() } }
  const step = (now) => {
    if (done) return
    const t = now - t0
    const from = originRect(origin)
    const fromR = originRadius(origin, from)
    // (re-applied every frame: a re-render of the panel can drop its inline
    // styles, and its own transform transition then lagged the shape behind)
    panel.style.transition = 'none'
    panel.style.opacity = '1'
    panel.style.transform = 'none'
    setClip(panel, '')
    const to = panel.getBoundingClientRect()
    const toR = cornerOf(panel, to)
    let genie = genieShape(from, fromR, to, toR, t, 'a')
    // (narrowed about its middle by `squeeze` halfway through, then back out)
    if (squeeze) genie = squish(genie, 1 - squeeze * Math.sin(Math.PI * clamp01(t / TOTAL)))
    const { box, pts } = genie
    glass.draw(genie)
    panel.style.transformOrigin = '0 0'
    panel.style.transform = fit(to, box)
    setClip(panel, clipFor(inset(pts, box, 2), box, to))
    const f = t / TOTAL
    if (face) {
      face.style.left = (from.left - box.left) + 'px'
      face.style.top = (from.top - box.top) + 'px'
      face.style.opacity = String(1 - ease(f / 0.3))
    }
    // contents come in early, so they're seen growing with the shape
    kids.forEach(k => { k.style.opacity = String(ease(f / 0.35)) })
    if (t >= TOTAL) { finish(); return }
    raf = requestAnimationFrame(frame)
  }
  const finish = () => {
    if (done) return
    done = true
    cancelAnimationFrame(raf)
    glass.el.remove()
    panel.removeAttribute('data-morph-panel')
    panel.style.transform = ''
    panel.style.transformOrigin = ''
    dropClip(panel)
    panel.style.opacity = ''
    kids.forEach(k => { k.style.opacity = '' })
    // its own transitions come back once it's settled
    setTimeout(() => { panel.style.transition = '' }, 60)
    panels.delete(panel)
  }
  panels.set(panel, { finish })
  setTimeout(() => finish(), TOTAL + 600)
  frame(t0)
}

// Close `panel` back into its origin. Call just before it closes; the real one
// is hidden at once (`keepClass` is the class that holds it open, kept on the
// copy). `host` is where the copy lives (it must outlast the panel).
export function morphPanelOut(panel, origin, { keepClass = 'open', host, squeeze = 0 } = {}) {
  if (!panel || !origin || reducedMotion()) return false
  panels.get(panel)?.finish()
  const from = panel.getBoundingClientRect()
  if (!from.width) return false
  const fromR = cornerOf(panel, from)
  const home = host || panel.parentElement
  // moved out to a host, it has to sit over everything the panel sat over
  const z = host ? 100001 : getComputedStyle(panel).zIndex
  const glass = makeGlass(panel, z === 'auto' ? 0 : z)
  const copy = panel.cloneNode(true)
  if (keepClass) copy.classList.add(keepClass)
  copy.setAttribute('data-morph-panel', '')
  copy.setAttribute('aria-hidden', 'true')
  copy.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
  copy.style.cssText += `;position:absolute;margin:0;transition:none;opacity:1;pointer-events:none;transform-origin:0 0;inset:auto;z-index:${z === 'auto' ? 1 : z};`
  home.appendChild(glass.el)
  home.appendChild(copy)
  place(copy, from)
  // the real panel goes at once (it closes on its own underneath)
  panel.style.transition = 'none'
  panel.style.opacity = '0'
  const restore = () => { panel.style.opacity = ''; requestAnimationFrame(() => { panel.style.transition = '' }) }
  let face = null
  if (origin.el && origin.el.isConnected) {
    const r = origin.el.getBoundingClientRect()
    face = faceOf(origin.el, r)
    face.style.opacity = '0'
    glass.el.appendChild(face)
  }
  const t0 = performance.now()
  let raf = 0, done = false
  // A frame that throws (or frames that stop coming) must never leave the
  // panel half-morphed — it finishes instead
  const frame = (now) => { try { step(now) } catch (err) { console.warn('morph', err); finish() } }
  const step = (now) => {
    if (done) return
    const t = now - t0
    const to = originRect(origin)
    const toR = originRadius(origin, to)
    let genie = genieShape(from, fromR, to, toR, t, 'b')
    if (squeeze) genie = squish(genie, 1 - squeeze * Math.sin(Math.PI * clamp01(t / TOTAL)))
    const { box, pts } = genie
    glass.draw(genie)
    copy.style.transform = fit(from, box)
    setClip(copy, clipFor(inset(pts, box, 2), box, from))
    const f = t / TOTAL
    // and stay until late, so they're seen shrinking with it
    copy.style.opacity = String(1 - ease((f - 0.35) / 0.5))
    if (face) {
      face.style.left = (to.left - box.left) + 'px'
      face.style.top = (to.top - box.top) + 'px'
      face.style.opacity = String(ease((f - 0.3) / 0.55))
    }
    if (t >= TOTAL) { finish(); return }
    raf = requestAnimationFrame(frame)
  }
  const finish = () => {
    if (done) return
    done = true
    cancelAnimationFrame(raf)
    glass.el.remove()
    copy.remove()
    // the real panel is shut by now; let it show again next time it opens
    setTimeout(restore, 50)
  }
  setTimeout(() => finish(), TOTAL + 600)
  frame(t0)
  return true
}

// ---- Pages: a list item / note / link page opened from its row (mobile) ----
// The row, as it looks long-pressed (a liquid-glass pill), grows into the
// full-screen page. The row's contents stretch with the shape and fade out;
// the page's contents ride inside it and fade in; and over the last third the
// glass gives way to the page's own solid background, since the page isn't
// glass. Closing runs it backwards into the row.
const rowPill = (row) => {
  const r = row.getBoundingClientRect()
  return { left: r.left + 8, right: r.right - 8, top: r.top - 4, bottom: r.bottom + 4, width: r.width - 16, height: r.height + 8 }
}
// The row's contents, on their own (no card, no glass), laid at the row
function rowFace(row) {
  const inner = row.cloneNode(true)
  const { content } = buildDragCloneShell(row, inner)
  content.querySelectorAll('.drag-glass-stroke').forEach(n => n.remove())
  const r = row.getBoundingClientRect()
  inner.style.marginLeft = '0'
  inner.style.width = r.width + 'px'
  inner.style.background = 'transparent'
  const face = document.createElement('div')
  face.style.cssText = `position:absolute;left:0;top:0;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;z-index:2;transform-origin:0 0;overflow:visible;`
  face.appendChild(content)
  return { face, rect: r }
}
// The glass the morph wears: the control bar's liquid glass, with the page
// behind blurred into it, and the page's own background ready to take over
function pageGlass(page, z) {
  const phone = page.closest('.phone') || document.getElementById('app')
  const sample = phone?.querySelector('.footer') || page
  // the clear liquid glass's gradient stroke (white fading to a faint dark), as
  // on the open add-item box and the menus
  const glass = makeGlass(sample, z, { stroke: ['rgba(255, 255, 255, 0.3)', 'rgba(0, 0, 0, 0.16)'] })
  glass.tintTo(page)
  const behind = pageBehind(phone)
  if (behind) glass.backdrop(behind)
  const stroke = glass.el.querySelector('svg')
  // 0 = all glass, 1 = all page
  const solid = (k) => {
    glass.tintOpacity(k)
    if (stroke) stroke.style.opacity = String(0.7 * (1 - k))
  }
  return { ...glass, solid }
}
const pageMorphs = new WeakMap()
// Where the page's contents sit at f: between a and b on a smooth in-out
// curve (half way at the half), slower to arrive than the shape
const contentBox = (a, b, f) => {
  const x = clamp01(f)
  const q = x * x * (3 - 2 * x)
  const left = lerp(a.left, b.left, q), top = lerp(a.top, b.top, q)
  const width = Math.max(1, lerp(a.width, b.width, q)), height = Math.max(1, lerp(a.height, b.height, q))
  return { left, top, width, height, right: left + width, bottom: top + height }
}
// The page morph runs quicker than the others
const PAGE_TOTAL = 200
// The page under the item page: the active one
const pageBehind = (phone) => phone ? (phone.querySelector('.page.active:not(.drag-incoming)') || findPage(phone)) : null

export function morphPageIn(page, row) {
  if (!page || !row || !row.isConnected || reducedMotion()) return false
  pageMorphs.get(page)?.finish()
  const z = getComputedStyle(page).zIndex
  const glass = pageGlass(page, z === 'auto' ? 0 : z)   // (read before its skin is hidden)
  page.style.transition = 'none'
  page.style.opacity = '1'
  page.setAttribute('data-morph-panel', '')
  page.before(glass.el)
  const { face, rect: faceRect } = rowFace(row)
  glass.el.appendChild(face)
  const from = rowPill(row)
  const fromR = from.height / 2
  const kids = [...page.children]
  kids.forEach(k => { k.style.opacity = '0' })
  // the page behind fades away in the first quarter
  const phoneEl = page.closest('.phone') || document.getElementById('app')
  const behind = pageBehind(phoneEl)
  if (behind) behind.style.transition = 'none'
  const t0 = performance.now()
  let raf = 0, done = false
  const frame = (now) => { try { step(now) } catch (err) { console.warn('morph', err); finish() } }
  const step = (now) => {
    if (done) return
    const t = now - t0
    page.style.transition = 'none'
    page.style.opacity = '1'
    page.style.transform = 'none'
    setClip(page, '')
    const to = page.getBoundingClientRect()
    // 32px corners all the way out (the page is square once it has landed)
    // …squeezed 20% in at its top and bottom halfway through
    const genie = rectShape(from, fromR, to, 32, t, PAGE_TOTAL, 0.2 * Math.sin(Math.PI * clamp01(t / PAGE_TOTAL)))
    const { box, pts } = genie
    glass.draw(genie)
    // The page itself grows on a gentler curve than the shape, so while its
    // contents fade in (the second half) they're still visibly growing into
    // place rather than already full size and just uncovered
    const f = t / PAGE_TOTAL
    const cbox = contentBox(from, to, f)
    page.style.transformOrigin = '0 0'
    page.style.transform = fit(to, cbox)
    setClip(page, clipFor(inset(pts, box, 2), cbox, to))
    // the row's contents stay where they are (unstretched) and fade over the
    // first third
    face.style.transform = `translate(${faceRect.left - box.left}px, ${faceRect.top - box.top}px)`
    face.style.opacity = String(1 - ease(f * 3))
    // (and the blurred copy of it the glass shows, with it)
    if (behind) behind.style.opacity = String(1 - clamp01(f * 4))
    glass.backdropOpacity(1 - clamp01(f * 4))
    // the page's contents come in over the second half
    kids.forEach(k => { k.style.opacity = String(ease((f - 0.5) * 2)) })
    const k = clamp01((f - 2 / 3) * 3)
    glass.solid(k)
    // a drop shadow under the growing pill, gone by the end
    glass.el.style.filter = `drop-shadow(0 6px 24px rgba(0, 0, 0, ${(0.2 * (1 - k)).toFixed(3)}))`
    if (t >= PAGE_TOTAL) { finish(); return }
    raf = requestAnimationFrame(frame)
  }
  const finish = () => {
    if (done) return
    done = true
    cancelAnimationFrame(raf)
    glass.el.remove()
    page.removeAttribute('data-morph-panel')
    page.style.transform = ''
    page.style.transformOrigin = ''
    dropClip(page)
    page.style.opacity = ''
    kids.forEach(k => { k.style.opacity = '' })
    if (behind) { behind.style.opacity = ''; behind.style.transition = '' }
    setTimeout(() => { page.style.transition = '' }, 60)
    pageMorphs.delete(page)
  }
  pageMorphs.set(page, { finish })
  setTimeout(() => finish(), PAGE_TOTAL + 600)
  frame(t0)
  return true
}

// Close: call as the page starts to close (its `open` class just dropped). A
// copy of it shrinks back into the row; the real one is hidden at once.
export function morphPageOut(page, row) {
  if (!page || !row || !row.isConnected || reducedMotion()) return false
  pageMorphs.get(page)?.finish()
  page.style.transition = 'none'
  page.style.transform = 'translateY(0)'
  const from = page.getBoundingClientRect()
  page.style.transform = ''
  if (!from.width || !row.getBoundingClientRect().height) return false
  const home = page.parentElement
  const z = getComputedStyle(page).zIndex
  const copy = page.cloneNode(true)
  copy.classList.add('open')
  copy.setAttribute('aria-hidden', 'true')
  copy.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
  // its editor text and scroll go with it
  const srcScroll = [...page.querySelectorAll('*')].filter(n => n.scrollTop > 0).map(n => [n, n.scrollTop])
  const glass = pageGlass(page, z === 'auto' ? 0 : z)
  copy.setAttribute('data-morph-panel', '')
  copy.style.cssText += `;position:absolute;margin:0;transition:none;opacity:1;pointer-events:none;transform-origin:0 0;inset:auto;z-index:${z === 'auto' ? 1 : z};`
  home.appendChild(glass.el)
  home.appendChild(copy)
  place(copy, from)
  const all = page.querySelectorAll('*'), cps = copy.querySelectorAll('*')
  const index = new Map([...all].map((n, i) => [n, i]))
  srcScroll.forEach(([n, top]) => { const c = cps[index.get(n)]; if (c) c.scrollTop = top })
  // the real page goes at once
  page.style.opacity = '0'
  // the row stays hidden until its contents land back on it
  row.style.opacity = '0'
  const { face } = rowFace(row)
  face.style.opacity = '0'
  glass.el.appendChild(face)
  const kids = [...copy.children]
  // the page behind comes back over the last quarter
  const phoneEl = home.closest('.phone') || home
  const behind = pageBehind(phoneEl)
  if (behind) { behind.style.transition = 'none'; behind.style.opacity = '0' }
  const t0 = performance.now()
  let raf = 0, done = false
  const frame = (now) => { try { step(now) } catch (err) { console.warn('morph', err); finish() } }
  const step = (now) => {
    if (done) return
    const t = now - t0
    const to = row.isConnected ? rowPill(row) : null
    if (!to) { finish(); return }
    const genie = rectShape(from, 32, to, to.height / 2, t, PAGE_TOTAL, 0.2 * Math.sin(Math.PI * clamp01(t / PAGE_TOTAL)))
    const { box, pts } = genie
    glass.draw(genie)
    const f = t / PAGE_TOTAL
    // (its contents shrink on the gentler curve, so they're seen going)
    const cbox = contentBox(from, to, f)
    copy.style.transform = fit(from, cbox)
    setClip(copy, clipFor(inset(pts, box, 2), cbox, from))
    const rr = row.getBoundingClientRect()
    face.style.transform = `translate(${rr.left - box.left}px, ${rr.top - box.top}px)`
    // the page's solid background gives way to glass (and its shadow) over the
    // first third
    const k = 1 - clamp01(f * 3)
    glass.solid(k)
    glass.el.style.filter = `drop-shadow(0 6px 24px rgba(0, 0, 0, ${(0.2 * (1 - k)).toFixed(3)}))`
    // and go over the first half
    kids.forEach(k => { k.style.opacity = String(1 - ease(f * 2)) })
    if (behind) behind.style.opacity = String(clamp01((f - 0.75) * 4))
    glass.backdropOpacity(clamp01((f - 0.75) * 4))
    // the row's contents, in place, fade back in over the last third
    face.style.opacity = String(ease((f - 2 / 3) * 3))
    if (t >= PAGE_TOTAL) { finish(); return }
    raf = requestAnimationFrame(frame)
  }
  const finish = () => {
    if (done) return
    done = true
    cancelAnimationFrame(raf)
    glass.el.remove()
    copy.remove()
    row.style.opacity = ''
    if (behind) { behind.style.opacity = ''; behind.style.transition = '' }
    setTimeout(() => { page.style.opacity = ''; page.style.transition = '' }, 50)
  }
  setTimeout(() => finish(), PAGE_TOTAL + 600)
  frame(t0)
  return true
}
