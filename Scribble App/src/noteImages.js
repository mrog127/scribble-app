// Photos placed in a note. Each one is scaled down (longest side 2000px, JPEG)
// and uploaded to the public "note-images" Storage bucket under the user's own
// folder; the note keeps only the image's URL, so the notes table, the offline
// cache and the outbox stay small.
import { supabase } from './supabaseClient.js'

export const NOTE_IMAGE_BUCKET = 'note-images'
const MAX_SIDE = 2000

async function shrink(file) {
  let source
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }
  const w = source.width, h = source.height
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'   // a transparent PNG gets a white ground, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  source.close?.()
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85))
}

// Resolves to the image's public URL
export async function uploadNoteImage(file) {
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) throw new Error('not signed in')
  const blob = await shrink(file)
  const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${uid}/${id}.jpg`
  const { error } = await supabase.storage.from(NOTE_IMAGE_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  })
  if (error) throw error
  return supabase.storage.from(NOTE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}

// Camera only makes sense on a phone / tablet — decided by the device, not the
// window size
export const deviceHasCamera = () =>
  typeof window !== 'undefined' &&
  (navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches)
