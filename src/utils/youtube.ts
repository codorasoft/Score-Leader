// The catalog stores a YouTube video's id, never its link. These read the id out of any link
// form people paste and build the urls the app shows.

const SHORT_HOST = 'youtu.be'
const HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtube-nocookie.com', 'www.youtube-nocookie.com', SHORT_HOST,
])
const ID = /^[A-Za-z0-9_-]{11}$/
// /shorts/<id>, /embed/<id>, /live/<id>
const ID_PATHS = new Set(['shorts', 'embed', 'live'])

// The video id of a YouTube link, or null when the text is not a link to one video.
export function parseYouTubeId(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!HOSTS.has(url.hostname.toLowerCase())) return null

  const parts = url.pathname.split('/').filter(Boolean)
  let id: string | null = null
  if (url.hostname.toLowerCase() === SHORT_HOST) {
    if (parts.length === 1) id = parts[0]
  } else if (parts.length === 1 && parts[0] === 'watch') {
    id = url.searchParams.get('v')
  } else if (parts.length === 2 && ID_PATHS.has(parts[0])) {
    id = parts[1]
  }
  return id && ID.test(id) ? id : null
}

export const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

// The privacy-friendly player; playsinline keeps phones from jumping to full screen
export const youtubeEmbedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`

export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`
