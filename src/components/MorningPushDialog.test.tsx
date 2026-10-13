import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'
import { inArabic } from '../test/arabic'
import type { PushState } from '../lib/push'

vi.mock('../lib/push', () => ({
  DEFAULT_HOUR: 7,
  QUARTERS: [0, 15, 30, 45],
  readPushState: vi.fn(),
  turnOnPush: vi.fn(),
  setPushTime: vi.fn(),
  turnOffPush: vi.fn(),
  sendTestPush: vi.fn(),
}))

import * as push from '../lib/push'
import MorningPushDialog from './MorningPushDialog'

const api = vi.mocked(push)
const OFF: PushState = { support: 'ok', permission: 'default', on: false, hour: 7, minute: 0 }
const ON: PushState = { support: 'ok', permission: 'granted', on: true, hour: 9, minute: 30 }
const BLOCKED: PushState = { support: 'ok', permission: 'denied', on: false, hour: 7, minute: 0 }
const onChange = vi.fn()
const onClose = vi.fn()
const open = (state: PushState) => {
  render(<MorningPushDialog state={state} onChange={onChange} onClose={onClose} />)
  return screen.getByRole('dialog', { name: 'Morning notification' })
}
const hour = () => screen.getByRole('combobox', { name: 'Hour' }) as HTMLSelectElement
const minutes = () => screen.getByRole('combobox', { name: 'Minutes' }) as HTMLSelectElement
const texts = (select: HTMLSelectElement) => within(select).getAllByRole('option').map((o) => o.textContent)
const button = (name: string) => screen.getByRole('button', { name })

beforeEach(() => { vi.clearAllMocks() })

describe('a device that cannot be turned on', () => {
  it('says so when this browser cannot push', () => {
    const dialog = open({ ...OFF, support: 'unsupported' })
    expect(dialog).toHaveTextContent('This browser cannot show notifications from the app.')
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
  it('tells an iPhone to be added to the Home Screen first', () => {
    const dialog = open({ ...OFF, support: 'needsInstall' })
    expect(dialog).toHaveTextContent('On an iPhone or iPad, add the app to the Home Screen first: tap Share, then Add to Home Screen. Open it from there and turn the notification on.')
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
  })
  it('says notifications are blocked', () => {
    const dialog = open(BLOCKED)
    expect(dialog).toHaveTextContent('Notifications are blocked for this app. Allow them in your browser or phone settings, then come back here.')
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
  })
})

describe('off', () => {
  it('offers the hour, 07:00 chosen, and Turn on', () => {
    const dialog = open(OFF)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('Each morning, a notification with what is on your schedule that day. Nothing is sent on a day with nothing on it.')
    expect(dialog).toHaveTextContent('The titles of your items appear in the notification.')
    // The time is two pickers under one name: the hour, and the minutes in quarters
    expect(within(screen.getByRole('group', { name: 'Time' })).getAllByRole('combobox')).toEqual([hour(), minutes()])
    expect(hour().value).toBe('7')
    expect(texts(hour())).toHaveLength(24)
    expect([texts(hour())[0], texts(hour())[7], texts(hour())[23]]).toEqual(['00', '07', '23'])
    expect(minutes().value).toBe('0')
    expect(texts(minutes())).toEqual(['00', '15', '30', '45'])
    expect(button('Turn on')).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send a test now' })).not.toBeInTheDocument()
  })

  it('turns on with the time chosen, and passes the new state on', async () => {
    api.turnOnPush.mockResolvedValue('on')
    api.readPushState.mockResolvedValue({ ...ON, hour: 6 })
    open(OFF)
    fireEvent.change(hour(), { target: { value: '6' } })
    fireEvent.change(minutes(), { target: { value: '30' } })
    fireEvent.click(button('Turn on'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...ON, hour: 6 }))
    expect(api.turnOnPush).toHaveBeenCalledWith(6, 30, 'en')
    // Choosing a time while off saves nothing by itself
    expect(api.setPushTime).not.toHaveBeenCalled()
  })

  it('a permission question closed without an answer leaves it off and says nothing', async () => {
    api.turnOnPush.mockResolvedValue('dismissed')
    open(OFF)
    fireEvent.click(button('Turn on'))
    await waitFor(() => expect(button('Turn on')).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a blocked answer passes the blocked state on', async () => {
    api.turnOnPush.mockResolvedValue('blocked')
    api.readPushState.mockResolvedValue(BLOCKED)
    open(OFF)
    fireEvent.click(button('Turn on'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(BLOCKED))
  })

  it('a blocked answer is shown as blocked even when the browser still says it was never asked', async () => {
    api.turnOnPush.mockResolvedValue('blocked')
    api.readPushState.mockResolvedValue(OFF)
    open(OFF)
    fireEvent.click(button('Turn on'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(BLOCKED))
  })

  it('a failed save says so', async () => {
    api.turnOnPush.mockResolvedValue('failed')
    open(OFF)
    fireEvent.click(button('Turn on'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save. Check your connection and try again.')
    expect(onChange).not.toHaveBeenCalled()
    expect(button('Turn on')).toBeEnabled()
  })

  it('a double tap turns it on once', async () => {
    let answer = (_: 'on') => {}
    api.turnOnPush.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    api.readPushState.mockResolvedValue(ON)
    open(OFF)
    fireEvent.click(button('Turn on'))
    fireEvent.click(button('Turn on'))
    expect(button('Turn on')).toBeDisabled()
    expect(hour()).toBeDisabled()
    expect(minutes()).toBeDisabled()
    answer('on')
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(api.turnOnPush).toHaveBeenCalledTimes(1)
  })
})

describe('on', () => {
  it('shows the stored time, the test and Turn off', () => {
    open(ON)
    expect(hour().value).toBe('9')
    expect(minutes().value).toBe('30')
    expect(button('Send a test now')).toBeEnabled()
    expect(button('Turn off')).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
  })

  it('changing the hour saves at once, with the minutes as they are', async () => {
    api.setPushTime.mockResolvedValue(true)
    api.readPushState.mockResolvedValue({ ...ON, hour: 10 })
    open(ON)
    fireEvent.change(hour(), { target: { value: '10' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...ON, hour: 10 }))
    expect(api.setPushTime).toHaveBeenCalledWith(10, 30, 'en')
  })

  it('changing the minutes saves at once, with the hour as it is', async () => {
    api.setPushTime.mockResolvedValue(true)
    api.readPushState.mockResolvedValue({ ...ON, minute: 45 })
    open(ON)
    fireEvent.change(minutes(), { target: { value: '45' } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...ON, minute: 45 }))
    expect(api.setPushTime).toHaveBeenCalledWith(9, 45, 'en')
  })

  it('a refused time goes back and says so', async () => {
    api.setPushTime.mockResolvedValue(false)
    open(ON)
    fireEvent.change(hour(), { target: { value: '10' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save. Check your connection and try again.')
    expect(hour().value).toBe('9')
    fireEvent.change(minutes(), { target: { value: '0' } })
    await waitFor(() => expect(api.setPushTime).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(minutes().value).toBe('30'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('a test says it was sent', async () => {
    api.sendTestPush.mockResolvedValue(true)
    open(ON)
    fireEvent.click(button('Send a test now'))
    expect(await screen.findByRole('status')).toHaveTextContent('Sent. It should arrive in a moment.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a failed test says so', async () => {
    api.sendTestPush.mockResolvedValue(false)
    open(ON)
    fireEvent.click(button('Send a test now'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send. Try again.')
  })

  it('turning off passes the new state on', async () => {
    api.turnOffPush.mockResolvedValue(true)
    api.readPushState.mockResolvedValue({ ...OFF, permission: 'granted' })
    open(ON)
    fireEvent.click(button('Turn off'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ ...OFF, permission: 'granted' }))
    expect(api.turnOffPush).toHaveBeenCalledTimes(1)
  })

  it('everything waits while a request runs', () => {
    api.sendTestPush.mockReturnValue(new Promise(() => {}))
    open(ON)
    fireEvent.click(button('Send a test now'))
    expect(button('Send a test now')).toBeDisabled()
    expect(button('Turn off')).toBeDisabled()
    expect(hour()).toBeDisabled()
    expect(minutes()).toBeDisabled()
  })
})

describe('the dialog itself', () => {
  it.each([
    ['Close', (d: HTMLElement) => fireEvent.click(within(d).getByRole('button', { name: 'Close' }))],
    ['Escape', (d: HTMLElement) => fireEvent.keyDown(d, { key: 'Escape' })],
    ['a tap outside', (d: HTMLElement) => fireEvent.click(d.parentElement!)],
  ])('%s closes it', (_name, close) => {
    close(open(OFF))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a tap inside does not close it', () => {
    fireEvent.click(within(open(OFF)).getByText('The titles of your items appear in the notification.'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('focus starts on Close, where Enter does no harm, and Tab stays inside', () => {
    open(OFF)
    expect(button('Close')).toHaveFocus()
    fireEvent.keyDown(button('Close'), { key: 'Tab' })
    expect(hour()).toHaveFocus()
    fireEvent.keyDown(hour(), { key: 'Tab', shiftKey: true })
    expect(button('Close')).toHaveFocus()
  })

  it('speaks Arabic', async () => {
    await inArabic(() => {
      render(<MorningPushDialog state={OFF} onChange={onChange} onClose={onClose} />)
      const dialog = screen.getByRole('dialog', { name: 'إشعار الصباح' })
      expect(within(dialog).getByRole('button', { name: 'تفعيل' })).toBeInTheDocument()
      expect(within(dialog).getByRole('group', { name: 'الوقت' })).toBeInTheDocument()
      expect(within(dialog).getByRole('combobox', { name: 'الساعة' })).toBeInTheDocument()
      expect(within(dialog).getByRole('combobox', { name: 'الدقائق' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'إغلاق' })).toBeInTheDocument()
    })
  })
})
