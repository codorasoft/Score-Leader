import { act, renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const fetchMyProfile = vi.fn()
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }))
vi.mock('../lib/tenancy', () => ({ fetchMyProfile: (id: string) => fetchMyProfile(id) }))

import { useProfile } from './useProfile'

beforeEach(() => fetchMyProfile.mockReset())

it('reports an error instead of a missing profile when the fetch fails, and retries', async () => {
  fetchMyProfile.mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(() => useProfile())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.error).toBe(true)
  expect(result.current.profile).toBeNull()

  fetchMyProfile.mockResolvedValueOnce({ user_id: 'u1', role: 'admin' })
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.profile).toEqual({ user_id: 'u1', role: 'admin' }))
  expect(result.current.error).toBe(false)
  expect(fetchMyProfile).toHaveBeenCalledTimes(2)
})

it('reports no error when the profile row is missing', async () => {
  fetchMyProfile.mockResolvedValueOnce(null)
  const { result } = renderHook(() => useProfile())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.error).toBe(false)
  expect(result.current.profile).toBeNull()
})
