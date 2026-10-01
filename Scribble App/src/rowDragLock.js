// While a row/card is being dragged to reorder, the page must not scroll and
// pull-to-refresh must not engage. Drags flag themselves here; App's
// pull-to-refresh checks the flag, and CSS freezes the page's scroll.
export function lockRowDrag() { document.documentElement.classList.add('row-dragging') }
export function unlockRowDrag() { document.documentElement.classList.remove('row-dragging') }
export function isRowDragging() { return document.documentElement.classList.contains('row-dragging') }
