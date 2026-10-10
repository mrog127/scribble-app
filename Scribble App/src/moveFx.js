// Moving a list item / note / link to another canvas, with its animation.
//
// The Move to menus live in several components (a canvas card's row menu, the
// list item, note and link pages), but the animation needs the page as a whole:
// App registers the routine here and every Move to calls moveWithAnimation().
//
// req: {
//   type: 'todo' | 'note' | 'link',
//   id, toCategoryId, toProjectId,
//   title,            // for the "Moved to …" toast
//   commit,           // performs the move (the context's move* call)
// }

let handler = null
export function setMoveHandler(fn) { handler = fn }
export function moveWithAnimation(req) {
  if (handler) handler(req)
  else req.commit()
}
