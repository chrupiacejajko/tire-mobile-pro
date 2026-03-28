import { describe, it, expect } from 'vitest';
import {
  isPublicApiPath,
  isWorkerApiPath,
  isWebhookBypassPath,
} from '@/lib/api/access-policy';

describe('isPublicApiPath', () => {
  it('allows POST to /api/auth/worker-login (auth prefix)', () => {
    expect(isPublicApiPath('/api/auth/worker-login', 'POST')).toBe(true);
  });

  it('allows GET to /api/tracking/<uuid> (dynamic tracking)', () => {
    expect(isPublicApiPath('/api/tracking/some-uuid', 'GET')).toBe(true);
  });

  it('allows POST to /api/orders (public booking)', () => {
    expect(isPublicApiPath('/api/orders', 'POST')).toBe(true);
  });

  it('rejects GET to /api/orders (admin-only listing)', () => {
    expect(isPublicApiPath('/api/orders', 'GET')).toBe(false);
  });

  it('rejects GET to /api/planner (admin-only)', () => {
    expect(isPublicApiPath('/api/planner', 'GET')).toBe(false);
  });

  it('rejects GET to /api/worker/tasks (worker-auth required)', () => {
    expect(isPublicApiPath('/api/worker/tasks', 'GET')).toBe(false);
  });

  it('allows OPTIONS on any path (CORS preflight)', () => {
    expect(isPublicApiPath('/api/planner', 'OPTIONS')).toBe(true);
    expect(isPublicApiPath('/api/worker/tasks', 'OPTIONS')).toBe(true);
  });

  it('allows GET to exact public paths like /api/health', () => {
    expect(isPublicApiPath('/api/health', 'GET')).toBe(true);
  });

  it('allows GET to /api/availability (prefix match)', () => {
    expect(isPublicApiPath('/api/availability', 'GET')).toBe(true);
  });

  it('rejects DELETE to /api/orders', () => {
    expect(isPublicApiPath('/api/orders', 'DELETE')).toBe(false);
  });
});

describe('isWorkerApiPath', () => {
  it('matches /api/worker/tasks', () => {
    expect(isWorkerApiPath('/api/worker/tasks')).toBe(true);
  });

  it('matches /api/worker/me', () => {
    expect(isWorkerApiPath('/api/worker/me')).toBe(true);
  });

  it('matches /api/worker-notifications', () => {
    expect(isWorkerApiPath('/api/worker-notifications')).toBe(true);
  });

  it('does not match /api/orders', () => {
    expect(isWorkerApiPath('/api/orders')).toBe(false);
  });

  it('does not match /api/planner', () => {
    expect(isWorkerApiPath('/api/planner')).toBe(false);
  });
});

describe('isWebhookBypassPath', () => {
  it('matches /api/satisgps/sync', () => {
    expect(isWebhookBypassPath('/api/satisgps/sync')).toBe(true);
  });

  it('matches /api/integrations/something', () => {
    expect(isWebhookBypassPath('/api/integrations/something')).toBe(true);
  });

  it('matches /api/webhooks/stripe', () => {
    expect(isWebhookBypassPath('/api/webhooks/stripe')).toBe(true);
  });

  it('does not match /api/orders', () => {
    expect(isWebhookBypassPath('/api/orders')).toBe(false);
  });

  it('does not match /api/worker/tasks', () => {
    expect(isWebhookBypassPath('/api/worker/tasks')).toBe(false);
  });
});
