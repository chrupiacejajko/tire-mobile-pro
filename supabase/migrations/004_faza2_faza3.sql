-- ═══════════════════════════════════════════════════════════
-- FAZA 2: Okna czasowe na zleceniach
-- ═══════════════════════════════════════════════════════════

-- Add time_window field to orders: null = exact slot, else "08:00-12:00" etc.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS time_window TEXT;

-- ═══════════════════════════════════════════════════════════
-- FAZA 3: Depozyty opon
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tire_deposits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  order_id          UUID REFERENCES public.orders(id) ON DELETE SET NULL,

  -- Vehicle info
  vehicle_info      TEXT,               -- "BMW X5 2020, WE12345"
  license_plate     TEXT,               -- "WE12345"

  -- Tire details
  tire_brand        TEXT,               -- "Continental", "Michelin"
  tire_size         TEXT,               -- "225/45 R17"
  tire_type         TEXT NOT NULL DEFAULT 'letnie',  -- 'letnie' | 'zimowe' | 'całoroczne'
  quantity          INTEGER NOT NULL DEFAULT 4,
  condition         TEXT DEFAULT 'dobre',            -- 'dobre' | 'do_wymiany' | 'uszkodzone'

  -- Storage
  storage_location  TEXT,               -- "Regał A3, półka 2"
  season            TEXT,               -- "2025/2026 zima"

  -- Dates
  received_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_pickup   DATE,
  picked_up_date    DATE,

  -- Status & notes
  status            TEXT NOT NULL DEFAULT 'stored',  -- 'stored' | 'picked_up' | 'disposed'
  notes             TEXT,
  photos            TEXT[] DEFAULT '{}',

  -- Pricing
  storage_price     NUMERIC(10,2),      -- PLN per season

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tire_deposits_client ON public.tire_deposits(client_id);
CREATE INDEX IF NOT EXISTS idx_tire_deposits_status ON public.tire_deposits(status);
CREATE INDEX IF NOT EXISTS idx_tire_deposits_expected_pickup ON public.tire_deposits(expected_pickup);

-- RLS
ALTER TABLE public.tire_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage tire deposits"
  ON public.tire_deposits FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tire_deposits_updated_at
  BEFORE UPDATE ON public.tire_deposits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
