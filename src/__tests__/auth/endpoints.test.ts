import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

/**
 * Auth enforcement tests — verify the middleware correctly gates API endpoints.
 * Expects the dev server to be running on TEST_BASE_URL (default: localhost:3001).
 *
 * These tests call endpoints with NO auth headers/cookies, so:
 * - Public endpoints should return 2xx (or valid business response)
 * - Worker endpoints should return 401
 * - Admin endpoints should return 401
 */
describe('Auth enforcement: admin endpoints require session', () => {
  const adminEndpoints = [
    { method: 'GET', path: '/api/orders', name: 'list orders' },
    { method: 'GET', path: '/api/planner', name: 'planner' },
    { method: 'GET', path: '/api/calendar', name: 'calendar' },
  ];

  for (const { method, path, name } of adminEndpoints) {
    it(`${method} ${path} (${name}) returns 401 without session`, async () => {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });
  }
});

describe('Auth enforcement: worker endpoints require worker token', () => {
  const workerEndpoints = [
    { method: 'GET', path: '/api/worker/tasks', name: 'worker tasks' },
    { method: 'GET', path: '/api/worker/me', name: 'worker profile' },
    { method: 'GET', path: '/api/worker-notifications', name: 'worker notifications' },
  ];

  for (const { method, path, name } of workerEndpoints) {
    it(`${method} ${path} (${name}) returns 401 without worker token`, async () => {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('WORKER_AUTH_REQUIRED');
    });
  }
});

describe('Auth enforcement: public endpoints accessible without auth', () => {
  it('POST /api/auth/worker-login is accessible', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/worker-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+48000000000', pin: '0000' }),
    });
    // Should not be 401 — the endpoint itself handles validation
    expect(res.status).not.toBe(401);
  });

  it('GET /api/tracking/<uuid> is accessible', async () => {
    const res = await fetch(`${BASE_URL}/api/tracking/test-uuid-12345`, {
      method: 'GET',
    });
    // Should not be 401 — may be 404 if order not found, but auth passes
    expect(res.status).not.toBe(401);
  });

  it('POST /api/orders (booking) is accessible', async () => {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Should not be 401 — may be 400/422 for invalid data, but auth passes
    expect(res.status).not.toBe(401);
  });

  it('GET /api/health is accessible', async () => {
    const res = await fetch(`${BASE_URL}/api/health`, {
      method: 'GET',
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('GET /api/geocode is accessible', async () => {
    const res = await fetch(`${BASE_URL}/api/geocode`, {
      method: 'GET',
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
