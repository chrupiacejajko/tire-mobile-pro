import { createClient } from './client';
import type {
  Client,
  Employee,
  Order,
  Region,
  Service,
  OrderStatus,
  Notification,
  OrderHistory,
  EmployeeLocation,
} from '@/lib/types';

const supabase = createClient();

// ============ CLIENTS ============
export async function getClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Client[];
}

export async function getClient(id: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Client;
}

export async function createClientRecord(client: Omit<Client, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('clients')
    .insert(client)
    .select()
    .single();
  if (error) throw error;
  return data as Client;
}

export async function updateClientRecord(id: string, updates: Partial<Client>) {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Client;
}

export async function deleteClientRecord(id: string) {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}

// ============ REGIONS ============
export async function getRegions() {
  const { data, error } = await supabase
    .from('regions')
    .select('*')
    .order('name');
  if (error) throw error;
  return data as Region[];
}

export async function createRegionRecord(region: Omit<Region, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('regions')
    .insert(region)
    .select()
    .single();
  if (error) throw error;
  return data as Region;
}

export async function updateRegionRecord(id: string, updates: Partial<Region>) {
  const { data, error } = await supabase
    .from('regions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Region;
}

export async function deleteRegionRecord(id: string) {
  const { error } = await supabase.from('regions').delete().eq('id', id);
  if (error) throw error;
}

// ============ EMPLOYEES ============
export async function getEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select('*, user:profiles(*), region:regions(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Employee[];
}

export async function getEmployee(id: string) {
  const { data, error } = await supabase
    .from('employees')
    .select('*, user:profiles(*), region:regions(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Employee;
}

// ============ SERVICES ============
export async function getServices() {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('category, name');
  if (error) throw error;
  return data as Service[];
}

// ============ ORDERS ============
export async function getOrders(filters?: {
  status?: OrderStatus;
  date?: string;
  employeeId?: string;
  regionId?: string;
}) {
  let query = supabase
    .from('orders')
    .select('*, client:clients(*), employee:employees(*, user:profiles(*)), region:regions(*)')
    .order('scheduled_date', { ascending: false })
    .order('scheduled_time_start', { ascending: true });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.date) query = query.eq('scheduled_date', filters.date);
  if (filters?.employeeId) query = query.eq('employee_id', filters.employeeId);
  if (filters?.regionId) query = query.eq('region_id', filters.regionId);

  const { data, error } = await query;
  if (error) throw error;
  return data as Order[];
}

export async function getOrder(id: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, client:clients(*), employee:employees(*, user:profiles(*)), region:regions(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Order;
}

export async function createOrderRecord(order: Omit<Order, 'id' | 'created_at' | 'completed_at' | 'client' | 'employee' | 'region'>) {
  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single();
  if (error) throw error;
  return data as Order;
}

export async function updateOrderStatus(id: string, status: OrderStatus, changedBy: string, note?: string) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .update({
      status,
      ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', id)
    .select()
    .single();
  if (orderError) throw orderError;

  // Add to history
  await supabase.from('order_history').insert({
    order_id: id,
    old_status: null, // TODO: fetch old status
    new_status: status,
    changed_by: changedBy,
    note: note || null,
  });

  return order as Order;
}

export async function getOrderHistory(orderId: string) {
  const { data, error } = await supabase
    .from('order_history')
    .select('*, user:profiles(*)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as OrderHistory[];
}

// ============ DASHBOARD STATS ============
export async function getDashboardStats(date: string) {
  const { data: todayOrders } = await supabase
    .from('orders')
    .select('id, status, total_price')
    .eq('scheduled_date', date);

  const { data: activeEmployees } = await supabase
    .from('employees')
    .select('id')
    .eq('is_active', true);

  const total = todayOrders?.length || 0;
  const completed = todayOrders?.filter((o) => o.status === 'completed').length || 0;
  const revenue = todayOrders
    ?.filter((o) => o.status === 'completed')
    .reduce((sum, o) => sum + Number(o.total_price), 0) || 0;

  return {
    todayOrders: total,
    completedToday: completed,
    activeWorkers: activeEmployees?.length || 0,
    totalRevenue: revenue,
    weeklyOrders: [],
  };
}

// ============ EMPLOYEE LOCATIONS ============
export async function getEmployeeLocations() {
  const { data, error } = await supabase
    .from('employee_locations')
    .select('*, employee:employees(*, user:profiles(*))')
    .order('timestamp', { ascending: false });
  if (error) throw error;

  // Get only latest location per employee
  const latest = new Map<string, EmployeeLocation>();
  for (const loc of (data || [])) {
    if (!latest.has(loc.employee_id)) {
      latest.set(loc.employee_id, loc as EmployeeLocation);
    }
  }
  return Array.from(latest.values());
}

// ============ NOTIFICATIONS ============
export async function getNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data as Notification[];
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
}
