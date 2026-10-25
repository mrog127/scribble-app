// A note's saved HTML read for its text only (row previews, search). Parsed in
// a document that never loads anything — HTML put into an element of the live
// page starts fetching every <img> in it, which made each note photo download
// (full size) wherever a preview was shown, slowing the app's start.
let inertDoc = null
export function parseInert(html) {
  if (!inertDoc) inertDoc = document.implementation.createHTMLDocument('')
  const div = inertDoc.createElement('div')
  div.innerHTML = html || ''
  return div
}
