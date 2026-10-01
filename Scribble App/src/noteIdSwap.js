// A new note shows up instantly with a temporary id (Date.now()), and gets its
// real database id once the insert comes back — often after its page has
// already opened. Anything that remembers "the open note" by id has to follow
// that swap, or the note page loses its note and closes.
//
// AppContext announces each swap here; open-note state follows it (AppContext's
// own openDetail, a list item page's attached-note page via the event), and
// the note page itself uses swappedFrom to tell "same note, new id" apart from
// "a different note" so it doesn't reset what you're typing.

export const swappedFrom = new Map()   // realId -> tempId

export function announceNoteIdSwap(from, to) {
  swappedFrom.set(to, from)
  window.dispatchEvent(new CustomEvent('note-id-swap', { detail: { from, to } }))
}
