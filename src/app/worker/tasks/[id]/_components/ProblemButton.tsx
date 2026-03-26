'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ProblemButton({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/worker/tasks/${taskId}/report-delay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Blad zgloszenia');
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Blad zgloszenia');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-[24px] bg-[#FFE8D6] p-5 text-sm text-gray-700">
        Problem zostal zgloszony.
      </div>
    );
  }

  return (
    <div>
      <AnimatePresence>
        {!open ? (
          <motion.button
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center justify-center gap-2 w-full rounded-full border-2 border-gray-200 text-gray-600 py-3 text-sm font-medium active:bg-gray-50 transition-colors"
            style={{ minHeight: 48 }}
          >
            <AlertTriangle className="w-4 h-4" />
            Zglos problem
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-[24px] bg-[#FFE8D6] p-5"
          >
            <p className="text-sm font-semibold text-gray-800 mb-2">Zglos problem</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Opisz problem..."
              className="w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            <div className="flex gap-2 mt-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !reason.trim()}
                className="flex-1 rounded-full bg-orange-500 text-white text-sm font-semibold py-2.5 disabled:opacity-50 active:bg-orange-600 transition-colors"
                style={{ minHeight: 44 }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Wyslij'}
              </motion.button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-orange-300 text-gray-700 text-sm font-medium px-4 py-2.5 active:bg-orange-100 transition-colors"
                style={{ minHeight: 44 }}
              >
                Anuluj
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
