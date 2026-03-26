import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Generic Supabase Realtime subscription for any table.
 * Calls `onChange` whenever any INSERT / UPDATE / DELETE happens on the table.
 *
 * Usage:
 *   useTableRealtime('work_schedules', fetchData);
 */
export function useTableRealtime(
  table: string,
  onChange: () => void,
  enabled = true,
) {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`${table}-realtime`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          callbackRef.current();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, enabled]);
}
