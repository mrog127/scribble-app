// Broadcast for the "item activated" celebration on the gallery button (mobile)
// and gallery tab (desktop).
//
// Activation happens deep in AppContext, called from project cards, row menus and
// the detail footer. Rather than thread a callback through all of those, the
// context fires here and whichever gallery control is mounted picks it up.

const listeners = new Set()

export function subscribeGalleryPulse(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// categoryId of the activated item — the listener resolves the accent itself,
// from the same `categories` array the pages colour themselves from.
// itemId lets the listener find the row to fly to the gallery control.
export function fireGalleryPulse(categoryId, itemId) {
  listeners.forEach(fn => fn(categoryId, itemId))
}

// While the float + button sequence plays, cards freeze the order they're
// already displaying so the activated row doesn't jump to its new slot early.
// The state itself commits immediately — this only holds the visual order.
const holdListeners = new Set()

export function subscribeOrderHold(fn) {
  holdListeners.add(fn)
  return () => holdListeners.delete(fn)
}

export function setOrderHold(held) {
  holdListeners.forEach(fn => fn(held))
}
