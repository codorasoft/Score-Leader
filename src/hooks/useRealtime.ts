import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useRealtime(table: string, filter: { column: string; value: string }, onUpdate: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`${table}:${filter.column}=eq.${filter.value}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `${filter.column}=eq.${filter.value}` },
        () => onUpdate(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [table, filter.column, filter.value, onUpdate])
}
