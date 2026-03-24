-- Company settings / whitelabel configuration
CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT DEFAULT 'Wulkanizacja Mobilna',
  company_short TEXT DEFAULT 'WM',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#f97316',
  secondary_color TEXT DEFAULT '#3B82F6',
  address TEXT,
  nip TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_settings_all" ON public.company_settings FOR ALL USING (true);

-- Insert default row
INSERT INTO public.company_settings (company_name, company_short)
VALUES ('Wulkanizacja Mobilna', 'WM')
ON CONFLICT DO NOTHING;
