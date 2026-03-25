import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribe to Supabase Realtime changes on the `orders` table.
 * Calls `onOrderChange` whenever any INSERT / UPDATE / DELETE happens.
 *
 * Usage:
 *   const refresh = useCallback(() => fetchData(), [fetchData]);
 *   useOrdersRealtime(refresh);
 */
export function useOrdersRealtime(onOrderChange: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          onOrderChange();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onOrderChange, enabled]);
}
