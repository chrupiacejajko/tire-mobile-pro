-- ═══ FORM TEMPLATES (szablony formularzy) ═══
CREATE TABLE IF NOT EXISTS public.form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]',
  -- fields: [
  --   { "id": "f1", "type": "text", "label": "Numer seryjny opony", "required": true, "order": 1 },
  --   { "id": "f2", "type": "number", "label": "Ciśnienie [bar]", "required": true, "order": 2, "min": 0, "max": 10 },
  --   { "id": "f3", "type": "boolean", "label": "Opona do wymiany?", "required": false, "order": 3 },
  --   { "id": "f4", "type": "select", "label": "Stan bieżnika", "required": true, "order": 4, "options": ["Dobry", "Średni", "Zły"] },
  --   { "id": "f5", "type": "multiselect", "label": "Uszkodzenia", "required": false, "order": 5, "options": ["Pęknięcie", "Wybrzuszenie", "Przecięcie", "Zużycie"] },
  --   { "id": "f6", "type": "photo", "label": "Zdjęcie opony", "required": false, "order": 6 },
  --   { "id": "f7", "type": "date", "label": "Data produkcji", "required": false, "order": 7 },
  --   { "id": "f8", "type": "signature", "label": "Podpis klienta", "required": true, "order": 8 }
  -- ]
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_templates_all" ON public.form_templates FOR ALL USING (true);

-- Link services to form templates
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS form_template_id UUID REFERENCES public.form_templates(id);

-- ═══ FILLED FORMS (wypełnione formularze) ═══
CREATE TABLE IF NOT EXISTS public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.form_templates(id),
  employee_id UUID REFERENCES public.employees(id),
  data JSONB NOT NULL DEFAULT '{}',
  -- data: { "f1": "205/55R16", "f2": 2.4, "f3": false, "f4": "Dobry", "f5": ["Pęknięcie"], "f6": "base64...", "f7": "2023-06-15", "f8": "base64..." }
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_submissions_all" ON public.form_submissions FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS form_submissions_order_idx ON public.form_submissions(order_id);

-- ═══ NOTIFICATION TEMPLATES (szablony powiadomień) ═══
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN (
    'booking_created',      -- po utworzeniu rezerwacji
    'order_assigned',       -- po przypisaniu pracownika
    'day_before',           -- dzień przed wizytą
    'day_of',               -- w dniu wizyty (rano)
    'worker_en_route',      -- pracownik w drodze
    'order_completed',      -- po zakończeniu
    'order_cancelled',      -- po anulowaniu
    'reschedule'            -- po zmianie terminu
  )),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  subject TEXT,  -- for email
  body TEXT NOT NULL,
  -- Placeholders: {{client_name}}, {{date}}, {{time_window}}, {{employee_name}},
  --   {{services}}, {{total_price}}, {{tracking_url}}, {{address}}
  is_active BOOLEAN NOT NULL DEFAULT true,
  send_after_time TIME,  -- np. nie wysyłaj przed 8:00
  send_before_time TIME, -- np. nie wysyłaj po 20:00
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_templates_all" ON public.notification_templates FOR ALL USING (true);

-- Insert default notification templates
INSERT INTO public.notification_templates (name, trigger, channel, subject, body) VALUES
  ('Potwierdzenie rezerwacji', 'booking_created', 'email',
   'Potwierdzenie rezerwacji #{{order_id}}',
   'Cześć {{client_name}}! Twoja rezerwacja na {{date}} ({{time_window}}) została przyjęta. Usługi: {{services}}. Śledź status: {{tracking_url}}'),
  ('Przypisanie technika', 'order_assigned', 'email',
   'Technik przydzielony do zlecenia #{{order_id}}',
   'Cześć {{client_name}}! Technik {{employee_name}} został przydzielony do Twojego zlecenia na {{date}}. Śledź status: {{tracking_url}}'),
  ('Przypomnienie dzień przed', 'day_before', 'email',
   'Przypomnienie: wizyta jutro',
   'Cześć {{client_name}}! Przypominamy o jutrzejszej wizycie ({{time_window}}). Adres: {{address}}. Technik: {{employee_name}}. Śledź status: {{tracking_url}}'),
  ('Wizyta dzisiaj', 'day_of', 'email',
   'Wizyta dzisiaj!',
   'Cześć {{client_name}}! Dziś odwiedzi Cię {{employee_name}} ({{time_window}}). Śledź na żywo: {{tracking_url}}'),
  ('Technik w drodze', 'worker_en_route', 'email',
   'Technik w drodze!',
   'Cześć {{client_name}}! {{employee_name}} jest w drodze do Ciebie. Śledź na żywo: {{tracking_url}}'),
  ('Zlecenie zakończone', 'order_completed', 'email',
   'Usługa zakończona',
   'Cześć {{client_name}}! Twoje zlecenie zostało zakończone. Dziękujemy za skorzystanie z RouteTire! Kwota: {{total_price}} zł.')
ON CONFLICT DO NOTHING;
