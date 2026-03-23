-- ============================================
-- Wulkanizacja Mobilna - Initial Schema
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---- Users Profile (extends Supabase Auth) ----
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('admin', 'dispatcher', 'worker')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Regions ----
CREATE TABLE public.regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Employees ----
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  skills TEXT[] DEFAULT '{}',
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  vehicle_info TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  working_hours JSONB NOT NULL DEFAULT '{
    "monday": {"start": "08:00", "end": "16:00"},
    "tuesday": {"start": "08:00", "end": "16:00"},
    "wednesday": {"start": "08:00", "end": "16:00"},
    "thursday": {"start": "08:00", "end": "16:00"},
    "friday": {"start": "08:00", "end": "16:00"},
    "saturday": null,
    "sunday": null
  }',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ---- Clients ----
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  vehicles JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Services ----
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Orders ----
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'in_progress', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  scheduled_date DATE NOT NULL,
  scheduled_time_start TIME NOT NULL,
  scheduled_time_end TIME NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  services JSONB NOT NULL DEFAULT '[]',
  total_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ---- Calendar Slots ----
CREATE TABLE public.calendar_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Employee Locations (GPS tracking) ----
CREATE TABLE public.employee_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'driving', 'working')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Notifications ----
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Order History ----
CREATE TABLE public.order_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_date ON public.orders(scheduled_date);
CREATE INDEX idx_orders_employee ON public.orders(employee_id);
CREATE INDEX idx_orders_client ON public.orders(client_id);
CREATE INDEX idx_calendar_slots_employee_date ON public.calendar_slots(employee_id, date);
CREATE INDEX idx_employee_locations_employee ON public.employee_locations(employee_id);
CREATE INDEX idx_employee_locations_timestamp ON public.employee_locations(timestamp DESC);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read);
CREATE INDEX idx_order_history_order ON public.order_history(order_id);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all data (internal app)
CREATE POLICY "Authenticated users can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read regions" ON public.regions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage regions" ON public.regions FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated read employees" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage employees" ON public.employees FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated read clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated manage clients" ON public.clients FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated read services" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage services" ON public.services FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated read orders" ON public.orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated manage orders" ON public.orders FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated read calendar" ON public.calendar_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated manage calendar" ON public.calendar_slots FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated read locations" ON public.employee_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated manage locations" ON public.employee_locations FOR ALL TO authenticated USING (true);

CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System manage notifications" ON public.notifications FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated read order history" ON public.order_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert order history" ON public.order_history FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- Function: Auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'worker')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Seed: Default services for tire shop
-- ============================================
INSERT INTO public.services (name, description, duration_minutes, price, category) VALUES
  ('Wymiana opon (komplet)', 'Wymiana 4 opon z wyważeniem', 60, 120.00, 'wymiana'),
  ('Wymiana opon (pojedyncza)', 'Wymiana 1 opony z wyważeniem', 20, 40.00, 'wymiana'),
  ('Wyważanie kół (komplet)', 'Wyważanie 4 kół', 40, 80.00, 'serwis'),
  ('Wyważanie kół (pojedyncze)', 'Wyważanie 1 koła', 15, 25.00, 'serwis'),
  ('Naprawa opony', 'Naprawa przebitej opony (łatka/wulkanizacja)', 30, 50.00, 'naprawa'),
  ('Wymiana zaworu', 'Wymiana zaworu w oponie', 15, 20.00, 'naprawa'),
  ('Kontrola ciśnienia', 'Sprawdzenie i regulacja ciśnienia w oponach', 15, 0.00, 'serwis'),
  ('Przechowywanie opon (sezon)', 'Sezonowe przechowywanie kompletu opon', 15, 200.00, 'przechowywanie'),
  ('Wymiana opon + przechowywanie', 'Wymiana opon z odbiorem starych na przechowanie', 75, 300.00, 'pakiet'),
  ('Serwis mobilny - dojazd', 'Opłata za dojazd do klienta', 0, 50.00, 'dojazd');
