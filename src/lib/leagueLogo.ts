import { supabase } from './supabase'

export const LOGO_BUCKET = 'league-logos'
const PUBLIC_MARKER = `/storage/v1/object/public/${LOGO_BUCKET}/`

export const logoPath = (leagueId: string, now = Date.now()) => `${leagueId}/logo-${now}.jpg`

// `image` is the square JPEG made by the photo adjuster
export async function uploadLeagueLogo(leagueId: string, image: Blob): Promise<string | null> {
  const path = logoPath(leagueId)
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, image, { contentType: 'image/jpeg' })
  if (error) return null
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl
}

// Only logos in our own bucket are removed; links from elsewhere are left alone.
export async function deleteLeagueLogo(url: string | null | undefined) {
  if (!url) return
  const i = url.indexOf(PUBLIC_MARKER)
  if (i === -1) return
  await supabase.storage.from(LOGO_BUCKET).remove([decodeURIComponent(url.slice(i + PUBLIC_MARKER.length))])
}
