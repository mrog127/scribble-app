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
function makeGlass(sample, z) {
  const { bf, img } = glassOf(sample)
  const { shadow, stroke } = glassEdges(sample)
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
    el.style.clipPath = clipFor(pts, box)
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

export function startAddMorph(pillEl) {
  if (!pillEl) return
  const footer = pillEl.closest('.footer')
  if (!footer || !footer.parentElement) return
  if (running) running.finish()
  KB_PREDICT.arm()
  if (reducedMotion()) return

  const from = pillEl.getBoundingClientRect()
  if (!from.width || !from.height) return
  const fromR = parseFloat(getComputedStyle(pillEl).borderTopLeftRadius) || from.height / 2

  const glass = makeGlass(pillEl, 2)
  const ghost = glass.el
  footer.after(ghost)
  const picks = pillEl.querySelector('.mbar-type-picks, .mbar-placeholder')
  const pr = picks?.getBoundingClientRect()
  const icons = pillIcons(pillEl, from)
  if (icons) ghost.appendChild(icons)

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

  const frame = (now) => {
    if (done) return
    const t = now - t0
    const open = footer.classList.contains('add-open')
    if (open) opened = true
    // The box's own rect, without the transform laid on it last frame
    footer.style.transform = ''
    footer.style.clipPath = ''
    const to = open ? footer.getBoundingClientRect() : from
    const toR = open ? (parseFloat(getComputedStyle(footer).borderTopLeftRadius) || 32) : fromR
    const genie = riseAbove(genieShape(from, fromR, to, toR, t, 'a'), kbEdge?.(now))
    const { box, pts, foot } = genie
    glass.draw(genie)
    // The box's contents ride inside the shape, at its size, clipped to it
    if (open) {
      footer.style.transformOrigin = '0 0'
      footer.style.transform = fit(to, box)
      footer.style.clipPath = clipFor(inset(pts, box, 2), box, to)
    }
    // The pill's icons stay with the shape's foot, centred
    if (icons && pr) {
      icons.style.left = ((foot.left + foot.right) / 2 - box.left - pr.width / 2) + 'px'
      icons.style.top = (foot.bottom - box.top - (from.bottom - pr.top)) + 'px'
    }

    const f = t / TOTAL
    if (icons) icons.style.opacity = String(1 - ease(f / 0.3))
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
    footer.style.clipPath = ''
    kids.forEach(k => { k.style.opacity = '' })
    running = null
  }
  running = { finish }
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

  const frame = (now) => {
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
    content.style.clipPath = clipFor(inset(pts, box, 2), box, from)
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
  frame(tStart)
  return { finish }
}

const radiusOf = (el, r) => Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.height / 2, r.width / 2)

// Cancel: call just before Add item closes. The box pours back into the pill,
// whose icons fade in riding down with it.
export function startAddMorphClose(footer) {
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
  let rowEl = null
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
    // The row's contents ride in the glass, exactly where they'll sit, fading in
    // so they're fully there as the shape lands
    found: (row, glass) => {
      const inner = row.cloneNode(true)
      const { content } = buildDragCloneShell(row, inner)
      const r = row.getBoundingClientRect()
      inner.style.marginLeft = '0'
      inner.style.width = r.width + 'px'
      inner.style.background = 'transparent'
      // (above the glass, not in it — the glass's shadow would fall on it)
      copy = document.createElement('div')
      copy.style.cssText = `position:absolute;margin:0;pointer-events:none;z-index:6;opacity:0;`
      copy.appendChild(content)
      footer.parentElement.appendChild(copy)
      row.style.opacity = '0'
      // the real row can't take a hover (the pointer's still there from Send)
      // while it shows through the fading glass
      row.style.pointerEvents = 'none'
      rowEl = row
    },
    // The shape it lands as: the row as it looks long-pressed — a fully rounded
    // pill, 8px in from the row at each side and 4px out above and below
    rect: (row) => {
      const r = row.getBoundingClientRect()
      return { left: r.left + 8, right: r.right - 8, top: r.top - 4, bottom: r.bottom + 4, width: r.width - 16, height: r.height + 8 }
    },
    radius: (row, r) => r.height / 2,
    frame: (row, genie, f) => {
      if (!copy) return
      place(copy, row.getBoundingClientRect())
      copy.style.opacity = String(ease((f - 0.3) / 0.7))
    },
    show: (row) => { row.style.opacity = '' },
    // a quarter second in the long-pressed form before the glass goes
    hold: 250,
    // the copy stays over the row until the glass has faded off it
    done: () => {
      copy?.remove(); copy = null
      // hover returns only once the pointer next moves
      if (rowEl) {
        const el = rowEl
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
