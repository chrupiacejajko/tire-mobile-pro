-- Migration 031: Warehouse tables
-- Creates tables needed for warehouse/inventory module

-- Warehouses (locations)
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Equipment types (categories)
CREATE TABLE IF NOT EXISTS equipment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Material types
CREATE TABLE IF NOT EXISTS material_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'szt.',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Equipment (individual items)
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id UUID REFERENCES equipment_types(id),
  warehouse_id UUID REFERENCES warehouses(id),
  employee_id UUID REFERENCES employees(id),
  name TEXT NOT NULL,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Material stock (quantity per location/employee)
CREATE TABLE IF NOT EXISTS material_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_type_id UUID NOT NULL REFERENCES material_types(id),
  warehouse_id UUID REFERENCES warehouses(id),
  employee_id UUID REFERENCES employees(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  min_quantity NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Material movements (history)
CREATE TABLE IF NOT EXISTS material_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_type_id UUID NOT NULL REFERENCES material_types(id),
  quantity NUMERIC NOT NULL,
  movement_type TEXT NOT NULL, -- 'transfer', 'restock', 'usage', 'adjustment'
  from_warehouse_id UUID REFERENCES warehouses(id),
  from_employee_id UUID REFERENCES employees(id),
  to_warehouse_id UUID REFERENCES warehouses(id),
  to_employee_id UUID REFERENCES employees(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_movements ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all
CREATE POLICY "Authenticated read warehouses" ON warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read equipment_types" ON equipment_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read material_types" ON material_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read equipment" ON equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read material_stock" ON material_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read material_movements" ON material_movements FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert/update (admin checks in app layer)
CREATE POLICY "Authenticated write warehouses" ON warehouses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write equipment_types" ON equipment_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write material_types" ON material_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write equipment" ON equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write material_stock" ON material_stock FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated write material_movements" ON material_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
