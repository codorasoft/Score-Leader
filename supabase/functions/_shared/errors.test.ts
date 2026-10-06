import { afterEach, describe, expect, it, vi } from 'vitest'
import { INTERNAL_ERROR, internalError } from './errors.ts'
import { serverErrorKey } from '../../../src/lib/errorText'

describe('internalError', () => {
  afterEach(() => vi.restoreAllMocks())

  it('hides the raw message from the response and logs it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = internalError('insert profile', { message: 'duplicate key value violates unique constraint "admin_profiles_email_key"' })
    expect(body).toEqual({ error: INTERNAL_ERROR })
    expect(log).toHaveBeenCalledWith('insert profile:', 'duplicate key value violates unique constraint "admin_profiles_email_key"')
  })

  it('logs thrown errors by message', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    internalError('handler', new Error('boom'))
    expect(log).toHaveBeenCalledWith('handler:', 'boom')
  })

  it('translates to the general message on the client', () => {
    expect(serverErrorKey(INTERNAL_ERROR)).toBe('serverErrors.generic')
  })
})
