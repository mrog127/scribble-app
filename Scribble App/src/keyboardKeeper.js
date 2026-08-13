// Holds the on-screen keyboard open across a gap in the interaction.
//
// Creating a note opens its editor ~650ms later (after the fly animation and the
// Supabase-assigned id arrives), so enterEdit() can never run inside the tap —
// and iOS only raises the keyboard for a focus that happens in a user gesture.
//
// The fix is to never let it close: focusing this parked input synchronously
// during the tap keeps the keyboard up, and iOS allows focus to *transfer* to
// the editor later while it's already showing.
//
// It's deliberately not the composer input — that one's focus drives the
// Save-to panel and the collapsed page state.

let keeper = null

export function registerKeyboardKeeper(el) {
  keeper = el
}

// Call synchronously inside the gesture, before the composer blurs.
export function keepKeyboardAlive() {
  keeper?.focus({ preventScroll: true })
}
