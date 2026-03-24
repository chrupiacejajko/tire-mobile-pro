-- ============================================================
-- 017_worker_invites.sql
-- Invite flow for worker account activation.
-- Replaces mobile_login/mobile_password with secure invite tokens.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS worker_invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- Store SHA-256 hash of the plaintext token ONLY.
  -- Plaintext is sent in the invite URL and never stored.
  token_hash    TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '72 hours',
  accepted_at   TIMESTAMPTZ,
  ip_accepted   INET,
  -- Rate-limit resends: track last resend time
  last_resent_at TIMESTAMPTZ,
  resend_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_invites_token_hash ON worker_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_worker_invites_employee   ON worker_invites(employee_id);
CREATE INDEX IF NOT EXISTS idx_worker_invites_status     ON worker_invites(status);

-- RLS
ALTER TABLE worker_invites ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_all_invites" ON worker_invites
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Worker: can read their own invite (to show status in /worker/profile)
CREATE POLICY "worker_read_own_invite" ON worker_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.id = employee_id AND p.id = auth.uid()
    )
  );

-- Note: /invite/[token] page uses server-side admin client (service role),
-- so it doesn't need an RLS policy for public token lookup.
