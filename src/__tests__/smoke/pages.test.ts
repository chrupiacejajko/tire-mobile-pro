import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

/**
 * Smoke tests — verify key pages respond without server errors.
 * Expects the dev server to be running on TEST_BASE_URL (default: localhost:3001).
 *
 * Protected pages are expected to return 200 (if session exists) or redirect to login (302/307).
 * Public pages should always return 200.
 */
describe('Smoke: page responses', () => {
  const protectedPages = [
    { path: '/map', name: 'Map' },
    { path: '/planner', name: 'Planner' },
    { path: '/orders', name: 'Orders' },
    { path: '/calendar', name: 'Calendar' },
  ];

  for (const { path, name } of protectedPages) {
    it(`${name} (${path}) returns 200 or redirects to login`, async () => {
      const res = await fetch(`${BASE_URL}${path}`, { redirect: 'manual' });
      // 200 = rendered, 302/307 = redirect to login — both acceptable
      expect([200, 302, 307]).toContain(res.status);
      if (res.status >= 300) {
        const location = res.headers.get('location') || '';
        expect(location).toMatch(/\/login/);
      }
    });
  }

  it('/worker returns 200 or redirects to worker login', async () => {
    const res = await fetch(`${BASE_URL}/worker`, { redirect: 'manual' });
    expect([200, 302, 307]).toContain(res.status);
    if (res.status >= 300) {
      const location = res.headers.get('location') || '';
      expect(location).toMatch(/\/login|\/worker/);
    }
  });

  it('/tracking/test-uuid returns 200 (public)', async () => {
    const res = await fetch(`${BASE_URL}/tracking/test-uuid`, { redirect: 'manual' });
    expect(res.status).toBe(200);
  });
});
