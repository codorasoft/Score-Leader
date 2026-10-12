import { parseYouTubeId, youtubeEmbedUrl, youtubeThumbnail, youtubeWatchUrl } from './youtube'

const ID = 'dQw4w9WgXcQ'

it.each([
  `https://www.youtube.com/watch?v=${ID}`,
  `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
  `https://m.youtube.com/watch?feature=share&v=${ID}`,
  `https://music.youtube.com/watch?v=${ID}`,
  `https://youtu.be/${ID}?si=abc`,
  `https://www.youtube.com/shorts/${ID}`,
  `https://www.youtube.com/embed/${ID}`,
  `https://www.youtube-nocookie.com/embed/${ID}`,
  `https://www.youtube.com/live/${ID}?feature=shared`,
  `http://www.youtube.com/watch?v=${ID}`,
  `youtu.be/${ID}`,
  `www.youtube.com/watch?v=${ID}`,
  // Phone share sheets add spaces and line breaks around the link
  `  https://youtu.be/${ID}\n`,
])('reads the id from %s', (link) => expect(parseYouTubeId(link)).toBe(ID))

it.each([
  '',
  '   ',
  ID,
  'not a link',
  `https://vimeo.com/${ID}`,
  `https://youtube.com.evil.com/watch?v=${ID}`,
  `https://evil.com/?u=https://youtu.be/${ID}`,
  'https://www.youtube.com/playlist?list=PL123',
  'https://www.youtube.com/watch?v=short',
  `https://www.youtube.com/watch?v=${ID}extra`,
  `https://www.youtube.com/channel/${ID}`,
  `https://youtu.be/${ID}/more`,
  `ftp://youtu.be/${ID}`,
])('refuses %s', (link) => expect(parseYouTubeId(link)).toBeNull())

it('builds the three urls', () => {
  expect(youtubeThumbnail(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`)
  expect(youtubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&playsinline=1&rel=0`)
  expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`)
})
