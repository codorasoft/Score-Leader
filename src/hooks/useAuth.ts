import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { forgetPush } from '../lib/push'

// How long signing out waits for this browser's morning notification to be turned off
const FORGET_MS = 2000

interface AuthState {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    // First, while still signed in, this browser stops getting the coach's morning
    // notification. Signing out never waits long for it: with no connection the address is
    // given back locally all the same.
    await Promise.race([
      forgetPush().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, FORGET_MS)),
    ])
    await supabase.auth.signOut()
  }

  return { user, loading, signIn, signOut }
}
