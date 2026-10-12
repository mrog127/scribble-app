// Vite plugin: "split-mobile" mode.
//
// On a narrow desktop (1000–1240px) with a detail page open, the window splits
// into two columns: the cards on the left, the detail panel on the right. The
// sidebar is hidden there, so the left column gets the phone's floating control
// bar at its bottom. Everything else in the column keeps its desktop layout.
//
// Every phone rule is written as a viewport media query (`max-width:
// 999.98px`), which a 1000px+ window never matches. App.jsx puts `.split-m` on
// #app in that state, and this plugin rewrites the CSS at build time so that,
// for the control bar (the footer, plus the Save-to panel it opens) and the
// Gallery's page header:
//   • the phone rules apply (a copy of each `max-width: 999.98px` block, scoped
//     to those elements under `.split-m`), and
//   • the desktop rules (`min-width: 1000px`+) don't.
// All guards use :where(), so no rule's specificity changes.
import postcss from 'postcss'

// The parts of the app that switch to the phone layout in split-mobile mode
// (and the Gallery's own page header — the date title — which on the desktop
// lives in the now-hidden sidebar)
const BAR = [
  '.split-m .footer', '.split-m .footer *',
  '.split-m .save-to-panel', '.split-m .save-to-panel *',
  '.split-m .home-page > .page-header', '.split-m .home-page > .page-header *',
].join(', ')
const DESKTOP_GUARD = `:where(:not(${BAR}))`
const MOBILE_GUARD = `:where(${BAR})`
const ROOT_GUARD = ':where(.split-m)'

// Split on top-level commas (ignoring those inside () [] or quotes)
function splitList(sel) {
  const out = []; let depth = 0, q = null, start = 0
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i]
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'") q = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) { out.push(sel.slice(start, i).trim()); start = i + 1 }
  }
  out.push(sel.slice(start).trim())
  return out.filter(Boolean)
}

// Index where the subject (last compound) of a complex selector begins
function subjectStart(sel) {
  let depth = 0, q = null, last = 0
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i]
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'") q = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (depth === 0 && /[\s>+~]/.test(c)) last = i + 1
  }
  return last
}

// Index (within the subject) of a trailing pseudo-element, or its length
function pseudoElementAt(subj) {
  let depth = 0, q = null
  for (let i = 0; i < subj.length; i++) {
    const c = subj[i]
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'") q = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (depth === 0 && c === ':') {
      if (subj[i + 1] === ':') return i
      if (/^:(before|after|first-line|first-letter)(?![\w-])/.test(subj.slice(i))) return i
    }
  }
  return subj.length
}

const CONTAINER_RE = /^(html|body)(?![\w-])|:root(?![\w-])|\.phone(?![\w-])|#app(?![\w-])|\.app-wrap(?![\w-])/
const PHONE_RE = /\.phone(?![\w-])|#app(?![\w-])/

function rewrite(sel, mode) {
  const s = subjectStart(sel)
  const subj = sel.slice(s)
  const p = pseudoElementAt(subj)
  const compound = subj.slice(0, p)
  const container = CONTAINER_RE.test(compound)
  let guard
  if (mode === 'desktop') {
    if (container) return sel            // the app shell itself stays desktop
    guard = DESKTOP_GUARD
  } else {
    if (container) {
      // Only the app shell's own custom properties (the bar's sizes and colours)
      // carry over — see the filter in transformCss. Pseudo-elements and the
      // page-level shells (html / body / :root / .app-wrap) are skipped.
      if (!PHONE_RE.test(compound) || p < subj.length) return null
      guard = ROOT_GUARD
    } else guard = MOBILE_GUARD
  }
  return sel.slice(0, s) + compound + guard + subj.slice(p)
}

const num = (re, str) => [...str.matchAll(re)].map(m => parseFloat(m[1]))
const mediaInfo = (params) => ({
  min: num(/min-width:\s*([\d.]+)px/g, params),
  max: num(/max-width:\s*([\d.]+)px/g, params),
})
const isDesktopQuery = (params) => mediaInfo(params).min.some(v => v >= 1000)
const isPhoneQuery = (params) => {
  const { min, max } = mediaInfo(params)
  return !min.length && max.length && max.every(v => v >= 999 && v < 1000)
}

function inKeyframes(node) {
  for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true
  return false
}
function underDesktopMedia(node) {
  for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'media' && isDesktopQuery(p.params)) return true
  return false
}

// A stray top-level `}` (e.g. a `}}` typo) makes a browser fold it into the
// next rule's selector, so that rule is dropped. PostCSS refuses such input, so
// drop exactly what the browser drops: the stray brace through the end of the
// next rule's block. The rendered result is unchanged.
function dropStrayBraces(css) {
  let out = '', depth = 0, i = 0
  const n = css.length
  const skipCommentOrString = (j) => {
    if (css[j] === '/' && css[j + 1] === '*') { const e = css.indexOf('*/', j + 2); return e < 0 ? n : e + 2 }
    if (css[j] === '"' || css[j] === "'") {
      const q = css[j]; j++
      while (j < n && css[j] !== q) { if (css[j] === '\\') j++; j++ }
      return j + 1
    }
    return -1
  }
  while (i < n) {
    const k = skipCommentOrString(i)
    if (k >= 0) { out += css.slice(i, k); i = k; continue }
    const c = css[i]
    if (c === '{') depth++
    else if (c === '}') {
      if (depth === 0) {
        // Skip the swallowed prelude up to its block, then the block itself
        let j = i + 1, d = 0, opened = false
        while (j < n) {
          const k2 = skipCommentOrString(j)
          if (k2 >= 0) { j = k2; continue }
          if (css[j] === '{') { d++; opened = true }
          else if (css[j] === '}' && opened) { d--; if (d === 0) { j++; break } }
          j++
        }
        i = j
        continue
      }
      depth--
    }
    out += c; i++
  }
  return out
}

export function transformCss(css, from) {
  const root = postcss.parse(dropStrayBraces(css), { from })

  // 1. Desktop rules: don't apply to the left column in split-mobile mode
  root.walkRules(rule => {
    if (inKeyframes(rule) || !underDesktopMedia(rule)) return
    rule.selector = splitList(rule.selector).map(s => rewrite(s, 'desktop')).join(',\n')
  })

  // 2. Phone rules: copy each top-level phone block, scoped to split-mobile
  root.each(node => {
    if (node.type !== 'atrule' || node.name !== 'media' || !isPhoneQuery(node.params)) return
    const copy = node.clone()
    copy.params = node.params
      .replace(/\(\s*max-width:\s*[\d.]+px\s*\)/, '(min-width: 1000px)')
    // Phone rules size things off 100vw (the phone *is* the window). In the
    // split, the phone layout only gets the left column, exposed as --split-vw.
    copy.walkDecls(decl => {
      decl.value = decl.value.replace(/(\d*\.?\d+)vw\b/g, (m, n) =>
        n === '100' ? 'var(--split-vw, 100vw)' : `calc(var(--split-vw, 100vw) * ${n} / 100)`)
    })
    copy.walkRules(rule => {
      if (inKeyframes(rule)) return
      const sels = splitList(rule.selector).map(s => rewrite(s, 'mobile')).filter(Boolean)
      if (!sels.length) { rule.remove(); return }
      rule.selector = sels.join(',\n')
      // On the app shell itself, keep only custom properties (--mbar-h etc.)
      if (sels.every(sel => sel.endsWith(ROOT_GUARD))) {
        rule.walkDecls(d => { if (!d.prop.startsWith('--')) d.remove() })
        if (!rule.nodes.length) rule.remove()
      }
    })
    node.after(copy)
  })

  return root.toString()
}

export default function splitMobileCss() {
  return {
    name: 'split-mobile-css',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/src\/styles\/[^/]+\.css(\?|$)/.test(id)) return null
      return { code: transformCss(code, id), map: null }
    },
  }
}
