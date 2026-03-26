'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, X, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ProblemButton({ taskId }: { taskId: string }) {
  const [open, setOpen]           = useState(false);
  const [reason, setReason]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState<string | null>(null);

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
        throw new Error(data.error ?? 'Błąd zgłoszenia');
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd zgłoszenia');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-3xl p-4">
        <div className="w-8 h-8 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
        </div>
        <p className="text-sm font-medium text-amber-800">Problem został zgłoszony.</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!open ? (
        <motion.button
          key="btn"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center justify-center gap-2 w-full rounded-2xl border-2 border-gray-200 bg-white text-gray-500 text-sm font-medium py-3 active:bg-gray-50 transition-colors"
          style={{ minHeight: 48 }}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Zgłoś problem
        </motion.button>
      ) : (
        <motion.div
          key="panel"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="bg-white rounded-3xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-sm font-bold text-gray-900">Zgłoś problem</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </motion.button>
          </div>

          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Opisz problem…"
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-300 focus:bg-white resize-none transition-all"
          />

          {error && (
            <p className="text-xs text-red-600 font-medium mt-2">{error}</p>
          )}

          <div className="flex gap-2 mt-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !reason.trim()}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-amber-500 text-white text-sm font-semibold py-3 disabled:opacity-50 active:bg-amber-600 transition-colors"
              style={{ minHeight: 44 }}
            >
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Send className="w-3.5 h-3.5" />Wyślij</>
              }
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-2xl border border-gray-200 bg-gray-50 text-gray-600 text-sm font-medium px-5 py-3 active:bg-gray-100 transition-colors"
              style={{ minHeight: 44 }}
            >
              Anuluj
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
