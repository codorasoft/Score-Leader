import { supabase } from './supabase'

export const PHOTO_BUCKET = 'player-photos'
const PUBLIC_MARKER = `/storage/v1/object/public/${PHOTO_BUCKET}/`

export const photoPath = (leagueId: string, playerId: string, now = Date.now()) =>
  `${leagueId}/players/${playerId}-${now}.jpg`

// Only photos in our own storage folder can be deleted; pasted links from elsewhere are left alone.
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const i = url.indexOf(PUBLIC_MARKER)
  return i === -1 ? null : decodeURIComponent(url.slice(i + PUBLIC_MARKER.length))
}

// `photo` is the 512px square JPEG made by the photo adjuster
export async function uploadPlayerPhoto(leagueId: string, playerId: string, photo: Blob): Promise<string | null> {
  const path = photoPath(leagueId, playerId)
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, photo, { contentType: 'image/jpeg' })
  if (error) return null
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function deletePlayerPhoto(url: string | null | undefined) {
  const path = storagePathFromUrl(url)
  if (path) await supabase.storage.from(PHOTO_BUCKET).remove([path])
}
