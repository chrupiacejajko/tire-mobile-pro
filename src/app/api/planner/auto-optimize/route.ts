/**
 * POST /api/planner/auto-optimize
 * Body: { date?: string }  — defaults to tomorrow
 *
 * Cron-like endpoint that auto-optimizes the next day's schedule.
 * Internally calls /api/planner/optimize with commit=true and buffer_pct=0.2,
 * then optionally triggers recurring order generation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/api/auth-guard';

export async function POST(request: NextRequest) {
  const auth = await checkAuth(request, ['admin', 'dispatcher']);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const { date: inputDate } = body as { date?: string };

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = inputDate || tomorrow.toISOString().split('T')[0];

    const baseUrl = request.nextUrl.origin;

    // Call the optimize endpoint internally
    const optimizeRes = await fetch(`${baseUrl}/api/planner/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, commit: true, buffer_pct: 0.2 }),
    });
    const optimizeResult = await optimizeRes.json();

    // Also attempt to generate recurring orders for that date (may not exist yet)
    let recurringResult = null;
    try {
      const recurringRes = await fetch(`${baseUrl}/api/recurring-orders/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (recurringRes.ok) {
        recurringResult = await recurringRes.json();
      }
    } catch {
      // recurring-orders endpoint may not exist yet — skip silently
    }

    console.log(`[auto-optimize] Completed for ${date}:`, {
      optimized: optimizeResult.optimized ?? 0,
      committed: optimizeResult.committed ?? false,
      recurring: recurringResult ? 'generated' : 'skipped',
    });

    return NextResponse.json({
      date,
      optimization: optimizeResult,
      recurring: recurringResult,
      message: `Auto-optimization for ${date} completed`,
    });
  } catch (err: any) {
    console.error('[auto-optimize]', err);
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 });
  }
}
