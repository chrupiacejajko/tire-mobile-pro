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
  created_at: string;
}

// ---- Employees ----
export interface Employee {
  id: string;
  user_id: string;
  region_id: string | null;
  skills: string[];
  hourly_rate: number;
  vehicle_info: string | null;
  is_active: boolean;
  working_hours: WorkingHours;
  created_at: string;
  // Relations
  user?: User;
  region?: Region;
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

// ---- Dashboard Stats ----
export interface DashboardStats {
  todayOrders: number;
  completedToday: number;
  activeWorkers: number;
  totalRevenue: number;
  weeklyOrders: number[];
}
