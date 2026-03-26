'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Wrench } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Auto-append @routetire.pl if user typed just a login (no @ sign)
    const loginEmail = email.includes('@') ? email : `${email}@routetire.pl`;
    const { error } = await signIn(loginEmail, password);
    if (error) {
      setError(error);
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-transparent to-transparent" />

      <div className="relative w-full max-w-[420px]">
        {/* Card */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/80 backdrop-blur-xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="RouteTire" className="h-14 w-14 rounded-2xl object-contain" />
          </div>

          {/* Title */}
          <h1 className="text-center text-2xl font-bold text-white mb-1">
            Zaloguj się do RouteTire
          </h1>
          <p className="text-center text-sm text-gray-400 mb-8">
            Nie masz konta?{' '}
            <Link href="/register" className="text-orange-400 hover:text-orange-300 font-medium transition-colors">
              Utwórz konto
            </Link>
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Login */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Login
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="blazej.s"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full rounded-xl border border-gray-700 bg-gray-800/50 py-3 pl-10 pr-4 text-sm text-white placeholder-gray-500 outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Hasło
                </label>
                <button type="button"
                  onClick={() => setError('Skontaktuj się z administratorem w celu resetu hasła.')}
                  className="text-xs text-orange-400 hover:text-orange-300 font-medium transition-colors">
                  Zapomniałeś?
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Wpisz hasło"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-700 bg-gray-800/50 py-3 pl-10 pr-16 text-sm text-white placeholder-gray-500 outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-300 font-medium transition-colors"
                >
                  {showPassword ? 'Ukryj' : 'Pokaż'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition-all hover:from-orange-600 hover:to-orange-700 hover:shadow-orange-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logowanie...' : 'Przejdź do panelu'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-gray-900 px-3 text-gray-500">lub</span>
            </div>
          </div>

          {/* Social login */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: 'Google', icon: 'G' },
              { name: 'Apple', icon: '' },
              { name: 'GitHub', icon: '' },
            ].map((provider) => (
              <button
                key={provider.name}
                type="button"
                className="flex items-center justify-center rounded-xl border border-gray-700 bg-gray-800/30 py-2.5 text-lg text-gray-400 transition-all hover:border-gray-600 hover:bg-gray-800/50 hover:text-white"
              >
                {provider.icon}
              </button>
            ))}
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-gray-500">
            Kontynuując, akceptujesz{' '}
            <span className="text-orange-400 cursor-pointer">Regulamin</span>
            {' '}i{' '}
            <span className="text-orange-400 cursor-pointer">Politykę Prywatności</span>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
