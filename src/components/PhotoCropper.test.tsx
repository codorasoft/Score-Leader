import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { PhotoCropper } from './PhotoCropper'

// A tall phone photo, as most player photos are
const W = 1000
const H = 1600

function renderLoaded(onDone = vi.fn()) {
  const { container } = render(<PhotoCropper src="blob:photo" onCancel={vi.fn()} onDone={onDone} />)
  const img = container.querySelector('img') as HTMLImageElement
  Object.defineProperty(img, 'naturalWidth', { value: W })
  Object.defineProperty(img, 'naturalHeight', { value: H })
  fireEvent.load(img)
  const viewer = img.parentElement as HTMLElement
  viewer.setPointerCapture = () => {}
  return { img, viewer }
}

const drag = (el: HTMLElement, dx: number, dy: number) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy })
  fireEvent.pointerUp(el, { pointerId: 1 })
}

it('moves a tall photo sideways without zooming in first', () => {
  const { img, viewer } = renderLoaded()
  expect(img.style.left).toBe('0px')
  drag(viewer, 60, 0)
  expect(img.style.left).toBe('60px')
  drag(viewer, -200, 0)
  expect(img.style.left).toBe('-140px')
})

it('stops once the edge of the photo reaches the centre of the circle', () => {
  const { img, viewer } = renderLoaded()
  drag(viewer, 1000, 0)
  // The photo's left edge sits on the circle's centre (280 / 2)
  expect(img.style.left).toBe('140px')
})

it('zooms out until the whole photo fits in the frame', () => {
  renderLoaded()
  const slider = screen.getByRole('slider', { name: 'Zoom' })
  expect(slider).toHaveAttribute('min', String(W / H))
  fireEvent.change(slider, { target: { value: '0.1' } })
  expect(slider).toHaveValue(String(W / H))
})

it('saves exactly the framing shown, over the avatar background colour', () => {
  const calls: unknown[][] = []
  const ctx = {
    set fillStyle(v: string) { calls.push(['fillStyle', v]) },
    fillRect: (...a: unknown[]) => calls.push(['fillRect', ...a]),
    drawImage: (_img: unknown, ...a: unknown[]) => calls.push(['drawImage', ...a]),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'])))
  const onDone = vi.fn()
  const { viewer } = renderLoaded(onDone)
  drag(viewer, 140, 0)
  fireEvent.click(screen.getByRole('button', { name: 'Use photo' }))

  // Saved at 512 px: 512 / 280 times what the viewer shows
  const k = 512 / 280
  expect(calls[0]).toEqual(['fillStyle', '#374151'])
  expect(calls[1]).toEqual(['fillRect', 0, 0, 512, 512])
  const [, left, top, width, height] = calls[2] as number[]
  expect(left).toBeCloseTo(140 * k)
  expect(top).toBeCloseTo(-84 * k)
  expect(width).toBeCloseTo(280 * k)
  expect(height).toBeCloseTo(448 * k)
  expect(onDone).toHaveBeenCalledTimes(1)
  vi.restoreAllMocks()
})
