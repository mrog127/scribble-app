import { useEffect, useRef } from 'react'

/*
  A list item's comment, edited as paragraphs and bullets — the note editor's
  model (.note-para.style-body / .style-bullet, indent-1…3) and its editing
  rules: Return starts a new paragraph (a bullet keeps its depth; Return on an
  empty bullet turns it back into body text), "- " at the start of a line makes
  it a bullet, Tab / Shift+Tab or a sideways swipe indents / outdents the
  bullet the caret is on (its deeper children move with it), Backspace at the
  start of a line joins it to the line above.

  It's stored as plain text, one line per paragraph: a bullet is two spaces per
  indent level, then "- ", then its text.
*/

const levelOf = (el) => Number((el.className.match(/indent-(\d)/) || [])[1] || 0)
const isBullet = (el) => /style-bullet/.test(el.className)

function makePara(style, level, text) {
  const p = document.createElement('div')
  p.className = 'note-para style-' + style + (style === 'bullet' && level ? ' indent-' + level : '')
  if (text) p.textContent = text
  else p.appendChild(document.createElement('br'))
  return p
}

// Fill the comment element from its stored text
export function fillComment(el, text) {
  if (!el) return
  el.innerHTML = ''
  const src = (text || '').replace(/\r\n?/g, '\n')
  if (!src.trim()) return
  src.split('\n').forEach(line => {
    const m = line.match(/^( *)- (.*)$/)
    if (m) el.appendChild(makePara('bullet', Math.min(3, Math.floor(m[1].length / 2)), m[2]))
    else el.appendChild(makePara('body', 0, line))
  })
}

// The comment's text to store ('' when empty)
export function serializeComment(el) {
  if (!el) return ''
  const paras = [...el.querySelectorAll('.note-para')]
  // Text typed straight into the box (outside any paragraph) still counts
  const lines = paras.length
    ? paras.map(p => {
        const t = (p.textContent || '').replace(/ /g, ' ').replace(/\n/g, ' ')
        return isBullet(p) ? '  '.repeat(levelOf(p)) + '- ' + t : t
      })
    : [(el.textContent || '').replace(/ /g, ' ')]
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.map(l => l.replace(/\s+$/, '')).join('\n')
}

// Make sure there's a paragraph to type into, and put the caret at the end of
// the last one
export function caretToEnd(el) {
  if (!el) return
  if (!el.querySelector('.note-para')) {
    const loose = (el.textContent || '').trim()
    el.innerHTML = ''
    el.appendChild(makePara('body', 0, loose))
  }
  const last = el.querySelector('.note-para:last-child') || el.lastElementChild
  const range = document.createRange()
  range.selectNodeContents(last)
  range.collapse(false)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

function findPara(content, node, offset) {
  let n = node
  if (n === content) n = content.childNodes[offset] || content.childNodes[offset - 1] || content.lastChild
  while (n && n !== content && !(n.nodeType === 1 && n.classList?.contains('note-para'))) n = n.parentNode
  return (n && n !== content) ? n : null
}

export function cursorPara(content) {
  const sel = window.getSelection()
  if (!content || !sel || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  if (!content.contains(r.startContainer)) return null
  return findPara(content, r.startContainer, r.startOffset)
}

// Indent (dir 1) or outdent (dir -1) a bullet, its deeper children with it
export function shiftBullet(content, para, dir) {
  if (!content || !para) return false
  const setLevel = (el, lvl) => {
    el.classList.remove('indent-1', 'indent-2', 'indent-3')
    if (lvl) el.classList.add('indent-' + lvl)
  }
  const paras = [...content.querySelectorAll('.note-para')]
  const idx = paras.indexOf(para)
  if (idx < 0) return false
  const cur = levelOf(para)
  const next = Math.max(0, Math.min(3, cur + dir))
  if (next === cur) return false
  setLevel(para, next)
  for (let i = idx + 1; i < paras.length; i++) {
    const p = paras[i]
    if (!isBullet(p)) break
    const lv = levelOf(p)
    if (lv <= cur) break
    setLevel(p, Math.max(0, Math.min(3, lv + dir)))
  }
  return true
}

// Return / Tab / Backspace inside the comment. Returns true when handled.
export function commentKeyDown(e, content, onChange) {
  if (!content) return false
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  let range = sel.getRangeAt(0)

  if (e.key === 'Tab') {
    const para = findPara(content, range.startContainer, range.startOffset)
    if (para && isBullet(para)) {
      e.preventDefault()
      if (shiftBullet(content, para, e.shiftKey ? -1 : 1)) onChange?.()
      return true
    }
    return false
  }

  if (e.key === 'Backspace' && range.collapsed) {
    const para = findPara(content, range.startContainer, range.startOffset)
    if (!para) return false
    const probe = document.createRange()
    probe.selectNodeContents(para)
    probe.setEnd(range.startContainer, range.startOffset)
    if (probe.toString().length !== 0) return false
    const prev = para.previousElementSibling
    if (!prev || !prev.classList?.contains('note-para')) return false
    e.preventDefault()
    if (prev.innerHTML.trim() === '<br>') prev.innerHTML = ''
    const junction = document.createRange()
    junction.selectNodeContents(prev)
    junction.collapse(false)
    const paraEmpty = para.textContent.trim() === '' && /^(<br>)?$/.test(para.innerHTML.trim())
    if (!paraEmpty) { while (para.firstChild) prev.appendChild(para.firstChild) }
    if (!prev.textContent && !prev.querySelector('br')) prev.innerHTML = '<br>'
    para.remove()
    sel.removeAllRanges()
    sel.addRange(junction)
    onChange?.()
    return true
  }

  if (e.key !== 'Enter') return false
  e.preventDefault()
  if (!range.collapsed) { range.deleteContents(); range = sel.getRangeAt(0) }

  const currentPara = findPara(content, range.startContainer, range.startOffset)
  if (!currentPara) {
    const p = makePara('body', 0, '')
    content.appendChild(p)
    const r = document.createRange(); r.setStart(p, 0); r.collapse(true)
    sel.removeAllRanges(); sel.addRange(r)
    onChange?.()
    return true
  }

  // Empty bullet + Return → back to body text
  if (isBullet(currentPara) && (currentPara.textContent.trim() === '' || currentPara.innerHTML.trim() === '<br>')) {
    currentPara.className = 'note-para style-body'
    const r = document.createRange(); r.setStart(currentPara, 0); r.collapse(true)
    sel.removeAllRanges(); sel.addRange(r)
    onChange?.()
    return true
  }

  // Split at the caret; the new line keeps the style (and a bullet's depth)
  const style = isBullet(currentPara) ? 'bullet' : 'body'
  const newPara = document.createElement('div')
  const indent = (currentPara.className.match(/indent-\d/) || [])[0]
  newPara.className = 'note-para style-' + style + (style === 'bullet' && indent ? ' ' + indent : '')
  const afterRange = document.createRange()
  afterRange.setStart(range.startContainer, range.startOffset)
  afterRange.setEnd(currentPara, currentPara.childNodes.length)
  const fragment = afterRange.extractContents()
  if (fragment.textContent || (fragment.querySelector && fragment.querySelector('br'))) newPara.appendChild(fragment)
  else newPara.innerHTML = '<br>'
  if (!currentPara.textContent && !currentPara.querySelector('br')) currentPara.innerHTML = '<br>'
  currentPara.after(newPara)
  const r = document.createRange(); r.setStart(newPara, 0); r.collapse(true)
  sel.removeAllRanges(); sel.addRange(r)
  requestAnimationFrame(() => newPara.scrollIntoView?.({ block: 'nearest' }))
  onChange?.()
  return true
}

// Typing "- " at the start of a line turns it into a bullet
export function commentInput(e, content) {
  const ne = e && e.nativeEvent
  if (!content || !ne || ne.inputType !== 'insertText' || ne.data !== ' ') return
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return
  // Text typed with no paragraph around it (an empty box): wrap it in one
  if (!content.querySelector('.note-para') && content.textContent) {
    const t = content.textContent
    content.innerHTML = ''
    const p = makePara('body', 0, t)
    content.appendChild(p)
    const r = document.createRange(); r.selectNodeContents(p); r.collapse(false)
    sel.removeAllRanges(); sel.addRange(r)
  }
  const para = cursorPara(content)
  if (!para || isBullet(para)) return
  const caret = sel.getRangeAt(0)
  const before = document.createRange()
  before.selectNodeContents(para)
  before.setEnd(caret.startContainer, caret.startOffset)
  if (!/^-[  ]$/.test(before.toString())) return
  before.deleteContents()
  para.className = 'note-para style-bullet'
  if (!para.textContent) { para.innerHTML = ''; para.appendChild(document.createElement('br')) }
  const r = document.createRange(); r.setStart(para, 0); r.collapse(true)
  sel.removeAllRanges(); sel.addRange(r)
}

/*
  Swipe sideways to indent / outdent the bullet the caret is on (one level per
  swipe) — a mouse drag, a two-finger trackpad swipe, or a finger on a phone
  while the comment is being edited. As in the note editor, a touch on the
  caret's own bullet line is claimed up front (iOS would otherwise take it for
  caret dragging) and its tap / scroll done by hand.
*/
export function useBulletSwipe(contentRef, surfaceRef, editingRef, onShift) {
  const onShiftRef = useRef(onShift)
  onShiftRef.current = onShift
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const THRESHOLD = 40
    const cursorBullet = () => {
      const para = cursorPara(content)
      return para && isBullet(para) ? para : null
    }
    const tryShift = (para, dir) => { if (shiftBullet(content, para, dir)) onShiftRef.current?.() }

    let activePointer = null
    const onPointerDown = (e) => {
      if (e.pointerType === 'touch') return
      const para = cursorBullet()
      if (!para || activePointer !== null) return
      activePointer = e.pointerId
      const startX = e.clientX, startY = e.clientY
      let done = false
      const onMove = (e2) => {
        if (done || e2.pointerId !== activePointer) return
        const dx = e2.clientX - startX, dy = e2.clientY - startY
        if (Math.abs(dy) > 24) { cleanup(); return }
        if (Math.abs(dx) < THRESHOLD) return
        done = true
        tryShift(para, dx > 0 ? 1 : -1)
        cleanup()
      }
      const cleanup = () => {
        activePointer = null
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', cleanup)
        document.removeEventListener('pointercancel', cleanup)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', cleanup)
      document.addEventListener('pointercancel', cleanup)
    }

    let acc = 0, accPara = null, timer = null, fired = false
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      const para = cursorBullet()
      if (!para) return
      e.preventDefault()
      if (para !== accPara) { accPara = para; acc = 0; fired = false }
      acc += -e.deltaX
      if (!fired && Math.abs(acc) >= THRESHOLD) { fired = true; tryShift(para, acc > 0 ? 1 : -1) }
      clearTimeout(timer)
      timer = setTimeout(() => { acc = 0; accPara = null; fired = false }, 200)
    }

    const surface = surfaceRef?.current || content
    let t = null
    let lastTap = null
    const onTouchStart = (e) => {
      if (!editingRef.current || e.touches.length !== 1) { t = null; return }
      const para = cursorBullet()
      if (!para) { t = null; return }
      const x = e.touches[0].clientX, y = e.touches[0].clientY
      const r = para.getBoundingClientRect()
      let nearCaret = false
      const sel = window.getSelection()
      if (sel && sel.rangeCount) {
        const rect = sel.getRangeAt(0).getClientRects()[0] || sel.getRangeAt(0).getBoundingClientRect()
        if (rect && (rect.height || rect.width)) {
          nearCaret = Math.abs(x - (sel.isCollapsed ? rect.left : x)) <= 28 && y >= rect.top - 12 && y <= rect.bottom + 12
          if (!sel.isCollapsed) nearCaret = [...sel.getRangeAt(0).getClientRects()].some(q => x >= q.left - 12 && x <= q.right + 12 && y >= q.top - 12 && y <= q.bottom + 12)
        }
      }
      const own = y >= r.top && y <= r.bottom && !nearCaret
      if (own) e.preventDefault()
      t = { x, y, para, decided: false, horizontal: false, done: false, own, lastY: y }
    }
    const onTouchMove = (e) => {
      if (!t || t.done) return
      const cx = e.touches[0].clientX, cy = e.touches[0].clientY
      const dx = cx - t.x, dy = cy - t.y
      if (!t.decided) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        t.decided = true
        t.horizontal = Math.abs(dx) > Math.abs(dy) * 1.5
        if (!t.horizontal && !t.own) { t = null; return }
      }
      e.preventDefault()
      if (!t.horizontal) {
        const scroller = surfaceRef?.current
        if (scroller) scroller.scrollTop -= cy - t.lastY
        t.lastY = cy
        return
      }
      if (Math.abs(dx) >= THRESHOLD) { t.done = true; tryShift(t.para, dx > 0 ? 1 : -1) }
    }
    const onTouchEnd = (e) => {
      if (t && t.own && !t.decided && e.type === 'touchend') {
        const range = document.caretRangeFromPoint?.(t.x, t.y)
        if (range && content.contains(range.startContainer)) {
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
          const now = Date.now()
          if (lastTap && now - lastTap.at < 350 && Math.abs(t.x - lastTap.x) < 24 && Math.abs(t.y - lastTap.y) < 24 && sel.modify) {
            sel.modify('move', 'backward', 'word')
            sel.modify('extend', 'forward', 'word')
            lastTap = null
          } else {
            lastTap = { at: now, x: t.x, y: t.y }
          }
        }
      }
      t = null
    }

    content.addEventListener('pointerdown', onPointerDown)
    content.addEventListener('wheel', onWheel, { passive: false })
    surface.addEventListener('touchstart', onTouchStart, { passive: false })
    surface.addEventListener('touchmove', onTouchMove, { passive: false })
    surface.addEventListener('touchend', onTouchEnd)
    surface.addEventListener('touchcancel', onTouchEnd)
    return () => {
      content.removeEventListener('pointerdown', onPointerDown)
      content.removeEventListener('wheel', onWheel)
      surface.removeEventListener('touchstart', onTouchStart)
      surface.removeEventListener('touchmove', onTouchMove)
      surface.removeEventListener('touchend', onTouchEnd)
      surface.removeEventListener('touchcancel', onTouchEnd)
      clearTimeout(timer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
