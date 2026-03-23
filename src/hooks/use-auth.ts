'use client';

import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,

  initialize: async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl === 'your-supabase-url') {
      // Demo mode - use fake user
      set({
        user: {
          id: 'demo',
          email: 'admin@wulkanizacja.pl',
          full_name: 'Admin Demo',
          phone: '+48 800 123 456',
          role: 'admin',
          avatar_url: null,
          created_at: new Date().toISOString(),
        },
        loading: false,
      });
      return;
    }

    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        set({ user: profile as User | null, loading: false });
      } else {
        set({ user: null, loading: false });
      }
    } catch {
      set({ user: null, loading: false });
    }
  },

  signIn: async (email, password) => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return { error: error.message };

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      set({ user: profile as User | null });
    }

    return { error: null };
  },

  signUp: async (email, password, fullName) => {
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: 'worker' } },
    });

    if (error) return { error: error.message };
    return { error: null };
  },

  signOut: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null });
  },
}));
