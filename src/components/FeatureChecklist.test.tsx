import { fireEvent, render, screen } from '@testing-library/react'
import FeatureChecklist from './FeatureChecklist'

describe('FeatureChecklist', () => {
  it('ticking Award voting pulls in its dependency', () => {
    const onChange = vi.fn()
    render(<FeatureChecklist value={[]} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText(/Award voting/))
    expect(onChange).toHaveBeenCalledWith(['awards', 'voting'])
  })
  it('None clears everything', () => {
    const onChange = vi.fn()
    render(<FeatureChecklist value={['cards']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
  it('Select all ticks every feature', () => {
    const onChange = vi.fn()
    render(<FeatureChecklist value={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(onChange.mock.calls[0][0]).toHaveLength(14)
  })
})
