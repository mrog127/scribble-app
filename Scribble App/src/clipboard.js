// Reads the clipboard into a field on a user gesture. Kept in one place so every
// "Add link" row behaves the same when the browser blocks or denies the read —
// the field just stays empty and keeps focus rather than throwing.
export function pasteInto(setValue, inputRef) {
  const focus = () => inputRef?.current?.focus()
  try {
    const pending = navigator.clipboard?.readText?.()
    if (!pending) { focus(); return }
    pending
      .then(text => {
        const trimmed = (text || '').trim()
        if (trimmed) setValue(trimmed)
        focus()
      })
      .catch(focus)
  } catch {
    focus()
  }
}
