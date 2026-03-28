'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wrench } from 'lucide-react';

export default function WorkerLoginPage() {
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!login.trim() || !pin.trim()) {
      setError('Podaj login i PIN');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/worker-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password: pin.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Nieprawidlowy login lub PIN');
        setLoading(false);
        return;
      }

      router.replace('/worker');
    } catch {
      setError('Blad polaczenia z serwerem');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDF8F4] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center mb-4 shadow-lg shadow-orange-500/20">
            <Wrench className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">RouteTire</h1>
          <p className="text-sm text-gray-500 mt-1">Logowanie pracownika</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login" className="block text-sm font-medium text-gray-700 mb-1.5">
                Login
              </label>
              <input
                id="login"
                type="text"
                autoComplete="username"
                placeholder="Login"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                disabled={loading}
                className="w-full h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-base text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 focus:bg-white outline-none transition-all disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-1.5">
                PIN
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                placeholder="PIN"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={loading}
                className="w-full h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-base text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 focus:bg-white outline-none transition-all disabled:opacity-50 tracking-[0.3em]"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Logowanie...
                </>
              ) : (
                'Zaloguj sie'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
