-- ═══ FORM TEMPLATES (szablony formularzy) ═══
CREATE TABLE IF NOT EXISTS public.form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_templates_all" ON public.form_templates FOR ALL USING (true);

-- ═══ FORM TEMPLATE FIELDS ═══
CREATE TABLE IF NOT EXISTS public.form_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text','number','boolean','select','multiselect','date','datetime','time','photo','signature','location')),
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  options JSONB, -- for select/multiselect: ["option1","option2",...]
  validation_regex TEXT,
  category TEXT, -- optional grouping
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.form_template_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_template_fields_all" ON public.form_template_fields FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS form_fields_template_idx ON public.form_template_fields(template_id, sort_order);

-- Link form templates to service types
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS form_template_id UUID REFERENCES public.form_templates(id);

-- ═══ FILLED FORMS (wypełnione formularze) ═══
CREATE TABLE IF NOT EXISTS public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.form_templates(id),
  employee_id UUID REFERENCES public.employees(id),
  data JSONB NOT NULL DEFAULT '{}', -- { field_id: value, field_id: value, ... }
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_submissions_all" ON public.form_submissions FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS form_submissions_order_idx ON public.form_submissions(order_id);

-- ═══ WAREHOUSE MODULE ═══
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses_all" ON public.warehouses FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.equipment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment_types_all" ON public.equipment_types FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT NOT NULL UNIQUE,
  type_id UUID NOT NULL REFERENCES public.equipment_types(id),
  warehouse_id UUID REFERENCES public.warehouses(id),
  employee_id UUID REFERENCES public.employees(id), -- if assigned to a worker's vehicle
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','in_use','maintenance','retired')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment_all" ON public.equipment FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS equipment_warehouse_idx ON public.equipment(warehouse_id);
CREATE INDEX IF NOT EXISTS equipment_employee_idx ON public.equipment(employee_id);

CREATE TABLE IF NOT EXISTS public.material_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL DEFAULT 'szt.', -- szt., kg, l, m, opak.
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.material_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_types_all" ON public.material_types FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.material_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_type_id UUID NOT NULL REFERENCES public.material_types(id),
  warehouse_id UUID REFERENCES public.warehouses(id),
  employee_id UUID REFERENCES public.employees(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(material_type_id, warehouse_id, employee_id)
);
ALTER TABLE public.material_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_stock_all" ON public.material_stock FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.material_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_type_id UUID NOT NULL REFERENCES public.material_types(id),
  from_warehouse_id UUID REFERENCES public.warehouses(id),
  to_warehouse_id UUID REFERENCES public.warehouses(id),
  from_employee_id UUID REFERENCES public.employees(id),
  to_employee_id UUID REFERENCES public.employees(id),
  quantity NUMERIC NOT NULL,
  order_id UUID REFERENCES public.orders(id), -- if used on an order
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.material_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_movements_all" ON public.material_movements FOR ALL USING (true);

-- Insert some default equipment types for tire service
INSERT INTO public.equipment_types (name, description) VALUES
  ('Klucz pneumatyczny', 'Klucz do odkręcania kół'),
  ('Podnośnik hydrauliczny', 'Podnośnik samochodowy'),
  ('Wyważarka', 'Wyważarka do kół'),
  ('Kompresor', 'Kompresor powietrza'),
  ('Zestaw łatek', 'Zestaw do naprawy opon')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.material_types (name, unit) VALUES
  ('Zawór do opony', 'szt.'),
  ('Łatka do opony', 'szt.'),
  ('Pasta montażowa', 'kg'),
  ('Ciężarki wyważające', 'g'),
  ('Worki na opony', 'szt.')
ON CONFLICT (name) DO NOTHING;
