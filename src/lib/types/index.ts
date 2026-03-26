// ============================================
// Typy dla systemu Wulkanizacja Mobilna
// ============================================

export type UserRole = 'admin' | 'dispatcher' | 'worker';

export type OrderStatus = 'new' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export type OrderPriority = 'low' | 'normal' | 'high' | 'urgent';

export type EmployeeStatus = 'online' | 'offline' | 'driving' | 'working';

// ---- Users ----
export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

// ---- Regions ----
export interface Region {
  id: string;
  name: string;
  description: string | null;
  color: string;
  polygon: [number, number][] | null;
  free_zone_polygon: [number, number][] | null;
  main_address: string | null;
  main_lat: number | null;
  main_lng: number | null;
  display_order: number;
  created_at: string;
}

// ---- Skills ----
export interface Skill {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

// ---- Employees ----
export interface Employee {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  region_id: string | null;
  skills: string[];
  hourly_rate: number;
  shift_rate: number | null;
  vehicle_info: string | null;
  default_vehicle_id: string | null;
  phone_secondary: string | null;
  default_location: string | null;
  default_lat: number | null;
  default_lng: number | null;
  is_active: boolean;
  working_hours: WorkingHours;
  created_at: string;
  // Relations
  user?: User;
  region?: Region;
  employee_skills?: { skill: Skill }[];
}

export interface WorkingHours {
  monday: DaySchedule | null;
  tuesday: DaySchedule | null;
  wednesday: DaySchedule | null;
  thursday: DaySchedule | null;
  friday: DaySchedule | null;
  saturday: DaySchedule | null;
  sunday: DaySchedule | null;
}

export interface DaySchedule {
  start: string; // "08:00"
  end: string;   // "16:00"
}

// ---- Clients ----
export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  vehicles: Vehicle[];
  notes: string | null;
  created_at: string;
  nip: string | null;
  is_blocked: boolean;
  block_reason: string | null;
}

export interface Vehicle {
  brand: string;
  model: string;
  year: number;
  tire_size: string;
  plate_number: string;
}

// ---- Services ----
export interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  category: string;
  is_active: boolean;
  form_template_id?: string | null;
  vehicle_type_id: string | null;
  required_skill_id: string | null;   // legacy single skill
  required_skill_ids: string[];       // multi-skill (new)
}

export interface ServiceType {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface VehicleType {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

// ---- Orders ----
export interface Order {
  id: string;
  client_id: string;
  employee_id: string | null;
  region_id: string | null;
  status: OrderStatus;
  priority: OrderPriority;
  scheduled_date: string;
  scheduled_time_start: string;
  scheduled_time_end: string;
  address: string;
  lat: number | null;
  lng: number | null;
  services: OrderService[];
  total_price: number;
  notes: string | null;
  dispatcher_notes: string | null;
  additional_phone: string | null;
  internal_task_type: 'pickup' | 'cleaning' | 'delivery' | 'other' | null;
  is_paid_time: boolean;
  photos: string[];
  created_at: string;
  completed_at: string | null;
  // Relations
  client?: Client;
  employee?: Employee;
  region?: Region;
}

export interface OrderService {
  service_id: string;
  name: string;
  price: number;
  quantity: number;
}

// ---- Order History ----
export interface OrderHistory {
  id: string;
  order_id: string;
  old_status: OrderStatus | null;
  new_status: OrderStatus;
  changed_by: string;
  note: string | null;
  created_at: string;
  user?: User;
}

// ---- Calendar Slots ----
export interface CalendarSlot {
  id: string;
  employee_id: string;
  date: string;
  time_start: string;
  time_end: string;
  is_available: boolean;
  order_id: string | null;
}

// ---- Employee Location (GPS) ----
export interface EmployeeLocation {
  id: string;
  employee_id: string;
  lat: number;
  lng: number;
  status: EmployeeStatus;
  timestamp: string;
  employee?: Employee;
}

// ---- Notifications ----
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

// ---- Inventory Items ----
export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  price: number;
  location: string | null;
  notes: string | null;
  created_at: string;
}

// ---- Subcontractors ----
export interface Subcontractor {
  id: string;
  name: string;
  company: string | null;
  phone: string;
  email: string | null;
  nip: string | null;
  address: string | null;
  city: string | null;
  specializations: string[];
  hourly_rate: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

// ---- Form Templates ----
export type FormFieldType = 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'photo' | 'date' | 'signature';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  order: number;
  options?: string[];
  min?: number;
  max?: number;
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  is_active: boolean;
  created_at: string;
}

export interface FormSubmission {
  id: string;
  order_id: string;
  template_id: string;
  employee_id: string | null;
  data: Record<string, any>;
  submitted_at: string;
  created_at: string;
  template?: FormTemplate;
}

// ---- Warehouses ----
export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  equipment_count?: number;
  material_stock_count?: number;
}

export type EquipmentStatus = 'available' | 'in_use' | 'maintenance' | 'retired';

export interface EquipmentType {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Equipment {
  id: string;
  serial_number: string;
  type_id: string;
  warehouse_id: string | null;
  employee_id: string | null;
  status: EquipmentStatus;
  notes: string | null;
  created_at: string;
  // Relations
  type?: EquipmentType;
  warehouse?: { id: string; name: string } | null;
  employee?: { id: string; user: { full_name: string } | null } | null;
}

export interface MaterialType {
  id: string;
  name: string;
  unit: string;
  created_at: string;
}

export interface MaterialStock {
  id: string;
  material_type_id: string;
  warehouse_id: string | null;
  employee_id: string | null;
  quantity: number;
  created_at: string;
  // Relations
  material_type?: MaterialType;
  warehouse?: { id: string; name: string } | null;
  employee?: { id: string; user: { full_name: string } | null } | null;
}

export interface MaterialMovement {
  id: string;
  material_type_id: string;
  from_warehouse_id: string | null;
  from_employee_id: string | null;
  to_warehouse_id: string | null;
  to_employee_id: string | null;
  quantity: number;
  movement_type: 'receive' | 'consume' | 'transfer';
  order_id: string | null;
  notes: string | null;
  created_at: string;
  // Relations
  material_type?: MaterialType;
  from_warehouse?: { id: string; name: string } | null;
  from_employee?: { id: string; user: { full_name: string } | null } | null;
  to_warehouse?: { id: string; name: string } | null;
  to_employee?: { id: string; user: { full_name: string } | null } | null;
}

// ---- Dashboard Stats ----
export interface DashboardStats {
  todayOrders: number;
  completedToday: number;
  activeWorkers: number;
  totalRevenue: number;
  weeklyOrders: number[];
}
