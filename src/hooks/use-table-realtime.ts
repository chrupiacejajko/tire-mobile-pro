import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Generic Supabase Realtime subscription for any table.
 * Calls `onChange` whenever any INSERT / UPDATE / DELETE happens on the table.
 *
 * Usage:
 *   const refresh = useCallback(() => fetchData(), [fetchData]);
 *   useTableRealtime('work_schedules', refresh);
 */
export function useTableRealtime(
  table: string,
  onChange: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`${table}-realtime`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          onChange();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, onChange, enabled]);
}
