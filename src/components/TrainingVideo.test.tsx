import { fireEvent, render, screen } from '@testing-library/react'
import TrainingVideo from './TrainingVideo'

const ID = 'dQw4w9WgXcQ'

const renderVideo = (playing: boolean, onPlay = vi.fn()) => {
  render(<TrainingVideo youtubeId={ID} title="Rondo" playing={playing} onPlay={onPlay} />)
  return onPlay
}

describe('TrainingVideo', () => {
  it('shows the thumbnail and loads no player until it is tapped', () => {
    const onPlay = renderVideo(false)
    const play = screen.getByRole('button', { name: 'Play Rondo' })
    const img = play.querySelector('img')!
    expect(img).toHaveAttribute('src', `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`)
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(document.querySelector('iframe')).toBeNull()
    fireEvent.click(play)
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('plays in the page when it is the playing one', () => {
    renderVideo(true)
    const frame = screen.getByTitle('Rondo')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&playsinline=1&rel=0`)
    expect(frame.getAttribute('allow')).toContain('autoplay')
    expect(frame.getAttribute('allow')).toContain('fullscreen')
    // YouTube refuses embeds that send no referrer
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    expect(screen.queryByRole('button', { name: 'Play Rondo' })).not.toBeInTheDocument()
  })

  it.each([false, true])('always links to the video on YouTube (playing: %s)', (playing) => {
    renderVideo(playing)
    const link = screen.getByRole('link', { name: 'Open on YouTube' })
    expect(link).toHaveAttribute('href', `https://www.youtube.com/watch?v=${ID}`)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('keeps the play button when the thumbnail cannot be loaded', () => {
    renderVideo(false)
    const play = screen.getByRole('button', { name: 'Play Rondo' })
    fireEvent.error(play.querySelector('img')!)
    expect(play.querySelector('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Play Rondo' })).toBeInTheDocument()
  })
})
