import { supabase } from './supabase'

export const PHOTO_BUCKET = 'player-photos'
const PHOTO_PX = 512
const JPEG_QUALITY = 0.85
const PUBLIC_MARKER = `/storage/v1/object/public/${PHOTO_BUCKET}/`

export function squareCrop(width: number, height: number) {
  const size = Math.min(width, height)
  return { sx: Math.round((width - size) / 2), sy: Math.round((height - size) / 2), size }
}

export const photoPath = (playerId: string, now = Date.now()) => `players/${playerId}-${now}.jpg`

// Only photos in our own storage folder can be deleted; pasted links from elsewhere are left alone.
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const i = url.indexOf(PUBLIC_MARKER)
  return i === -1 ? null : decodeURIComponent(url.slice(i + PUBLIC_MARKER.length))
}

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the photo')) }
  img.src = url
})

// Phone photos are several MB; a centred 512px square JPEG is ~50–100 KB and loads instantly.
export async function prepareSquarePhoto(file: File): Promise<Blob> {
  const img = await loadImage(file)
  const { sx, sy, size } = squareCrop(img.naturalWidth, img.naturalHeight)
  const out = Math.min(PHOTO_PX, size)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  canvas.getContext('2d')!.drawImage(img, sx, sy, size, size, 0, 0, out, out)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('Could not prepare the photo')
  return blob
}

export async function uploadPlayerPhoto(playerId: string, file: File): Promise<string | null> {
  const blob = await prepareSquarePhoto(file)
  const path = photoPath(playerId)
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
  if (error) return null
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function deletePlayerPhoto(url: string | null | undefined) {
  const path = storagePathFromUrl(url)
  if (path) await supabase.storage.from(PHOTO_BUCKET).remove([path])
}
