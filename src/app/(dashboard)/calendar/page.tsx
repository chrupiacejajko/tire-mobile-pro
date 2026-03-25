'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar as CalendarIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Topbar } from '@/components/layout/topbar';
import { createClient } from '@/lib/supabase/client';

import {
  type CalendarOrder,
  type EmployeeCol,
  type WorkScheduleBlock,
  type ClientOption,
  type ServiceOption,
  type CalendarView,
  type SchedulingType,
  type DensityLevel,
  DENSITY_CONFIG,
} from './_components/types';
import { CalendarToolbar } from './_components/CalendarToolbar';
import { CalendarSidebar } from './_components/CalendarSidebar';
import { TeamView } from './_components/TeamView';
import { TimelineView } from './_components/TimelineView';
import { WeekView } from './_components/WeekView';
import { MonthView } from './_components/MonthView';
import { OrderDetailPanel } from './_components/OrderDetailPanel';
import { OrderCreationDialog } from './_components/OrderCreationDialog';
import { UnassignedOrdersDrawer } from './_components/UnassignedOrdersDrawer';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('team');
  const [density, setDensity] = useState<DensityLevel>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('cal-density') as DensityLevel) || 'normal';
    }
    return 'normal';
  });
  const [loading, setLoading] = useState(true);
  const rowHeight = DENSITY_CONFIG[density].rowHeight;

  // Data
  const [orders, setOrders] = useState<CalendarOrder[]>([]);
  const [employees, setEmployees] = useState<EmployeeCol[]>([]);
  const [workSchedules, setWorkSchedules] = useState<WorkScheduleBlock[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);

  // Filters
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());  // empty = show all
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());        // empty = show all
  const [filterEmployees, setFilterEmployees] = useState<Set<string>>(new Set()); // empty = show all

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (filterStatuses.size > 0 && !filterStatuses.has(o.status)) return false;
      if (filterTypes.size > 0 && !filterTypes.has(o.scheduling_type)) return false;
      if (filterEmployees.size > 0 && o.employee_id && !filterEmployees.has(o.employee_id)) return false;
      return true;
    });
  }, [orders, filterStatuses, filterTypes, filterEmployees]);

  // Panels
  const [selectedOrder, setSelectedOrder] = useState<CalendarOrder | null>(null);
  const [newOrderDialog, setNewOrderDialog] = useState(false);
  const [unassignedDrawer, setUnassignedDrawer] = useState(false);
  const [newOrderPrefill, setNewOrderPrefill] = useState<{
    date?: string;
    time?: string;
    employeeId?: string;
  }>({});

  // Derived
  const dateStr = currentDate.toISOString().split('T')[0];
  const unassigned = useMemo(() => orders.filter(o => !o.employee_id), [orders]);

  // ── Date helpers ───────────────────────────────────────────────────────────

  const getWeekRange = useCallback((date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  }, []);

  const getMonthRange = useCallback((date: Date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    return {
      start: `${y}-${(m + 1).toString().padStart(2, '0')}-01`,
      end: new Date(y, m + 1, 0).toISOString().split('T')[0],
    };
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Date range based on view
    let rangeStart: string, rangeEnd: string;
    if (view === 'team' || view === 'timeline') {
      rangeStart = dateStr;
      rangeEnd = dateStr;
    } else if (view === 'week') {
      const r = getWeekRange(currentDate);
      rangeStart = r.start;
      rangeEnd = r.end;
    } else {
      const r = getMonthRange(currentDate);
      rangeStart = r.start;
      rangeEnd = r.end;
    }

    const [ordersRes, empRes, clientsRes, servicesRes, schedulesRes] = await Promise.all([
      supabase
        .from('orders')
        .select(
          'id, scheduled_date, scheduled_time_start, scheduled_time_end, status, priority, services, employee_id, address, total_price, scheduling_type, time_window_start, time_window_end, flexibility_minutes, auto_assigned, estimated_arrival, source, internal_task_type, is_paid_time, client:clients(name, phone), employee:employees(user:profiles(full_name), region:regions(color))'
        )
        .not('status', 'eq', 'cancelled')
        .gte('scheduled_date', rangeStart)
        .lte('scheduled_date', rangeEnd)
        .order('scheduled_time_start'),

      supabase
        .from('employees')
        .select('id, region_id, user:profiles(full_name), region:regions(name, color)')
        .eq('is_active', true),

      supabase.from('clients').select('id, name, phone, address, city').order('name'),

      supabase
        .from('services')
        .select('id, name, price, duration_minutes')
        .eq('is_active', true),

      supabase
        .from('work_schedules')
        .select('employee_id, date, start_time, end_time, is_night_shift')
        .gte('date', rangeStart)
        .lte('date', rangeEnd),
    ]);

    if (ordersRes.data) {
      setOrders(
        ordersRes.data.map((o: any) => ({
          id: o.id,
          client_name: o.client?.name || 'Nieznany',
          client_phone: o.client?.phone || '',
          service_names: (o.services || []).map((s: any) => s.name).join(', '),
          scheduled_date: o.scheduled_date,
          scheduled_time_start: o.scheduled_time_start,
          scheduled_time_end: o.scheduled_time_end,
          status: o.status,
          priority: o.priority,
          address: o.address,
          total_price: Number(o.total_price),
          employee_id: o.employee_id,
          employee_name: o.employee?.user?.full_name || null,
          employee_color: o.employee?.region?.color || '#94A3B8',
          // Scheduling fields
          scheduling_type: (o.scheduling_type as SchedulingType) || 'fixed_time',
          time_window_start: o.time_window_start,
          time_window_end: o.time_window_end,
          flexibility_minutes: o.flexibility_minutes || 0,
          auto_assigned: o.auto_assigned || false,
          estimated_arrival: o.estimated_arrival,
          source: o.source,
          internal_task_type: o.internal_task_type || null,
          is_paid_time: o.is_paid_time ?? null,
        }))
      );
    }

    if (empRes.data) {
      setEmployees(
        empRes.data.map((e: any) => ({
          id: e.id,
          name: e.user?.full_name || '?',
          color: e.region?.color || '#94A3B8',
          region: e.region?.name || '',
          region_id: e.region_id || null,
        }))
      );
    }

    if (clientsRes.data) setClients(clientsRes.data as ClientOption[]);
    if (servicesRes.data) setServices(servicesRes.data as ServiceOption[]);
    if (schedulesRes.data) setWorkSchedules(schedulesRes.data as WorkScheduleBlock[]);

    setLoading(false);
  }, [currentDate, view, dateStr, supabase, getWeekRange, getMonthRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  };

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const handleSlotClick = (time: string, employeeId: string) => {
    setNewOrderPrefill({ date: dateStr, time, employeeId });
    setNewOrderDialog(true);
  };

  const handleOrderClick = (order: CalendarOrder) => {
    setSelectedOrder(order);
  };

  const handleQuickAssign = async (orderId: string, empId: string) => {
    await supabase
      .from('orders')
      .update({ employee_id: empId, status: 'assigned' })
      .eq('id', orderId);
    fetchData();
  };

  const handleAutoAssign = async () => {
    const res = await fetch('/api/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr, strategy: 'balance' }),
    });
    const data = await res.json();
    if (data.assigned > 0) fetchData();
  };

  const handleDayClick = (date: Date) => {
    setCurrentDate(date);
    setView('team');
  };

  const handleReassign = async (orderId: string, empId: string) => {
    await supabase
      .from('orders')
      .update({ employee_id: empId, status: 'assigned' })
      .eq('id', orderId);
    setSelectedOrder(null);
    fetchData();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Topbar
        title="Kalendarz"
        subtitle="Dispatch board — planowanie zleceń"
        icon={<CalendarIcon className="h-5 w-5" />}
        actions={
          <Button
            className="h-9 rounded-xl text-sm gap-2 bg-orange-500 hover:bg-orange-600"
            onClick={() => {
              setNewOrderPrefill({ date: dateStr });
              setNewOrderDialog(true);
            }}
          >
            <Plus className="h-4 w-4" /> Nowe zlecenie
          </Button>
        }
      />

      <div className="p-4 lg:p-6">
        {/* Toolbar */}
        <CalendarToolbar
          currentDate={currentDate}
          view={view}
          orders={orders}
          employees={employees}
          unassignedCount={unassigned.length}
          density={density}
          onNavigate={navigate}
          onViewChange={setView}
          onDensityChange={d => { setDensity(d); localStorage.setItem('cal-density', d); }}
          onToday={() => setCurrentDate(new Date())}
          onOpenUnassigned={() => setUnassignedDrawer(true)}
        />

        {/* Sidebar + Main Content */}
        <div className="flex gap-5 mt-4">
          {/* Left Sidebar — sticky, scrollable independently */}
          <div className="hidden xl:block sticky top-0 self-start max-h-[calc(100vh-140px)] overflow-y-auto scrollbar-thin">
            <CalendarSidebar
              currentDate={currentDate}
              view={view}
              orders={orders}
              employees={employees}
              filterStatuses={filterStatuses}
              filterTypes={filterTypes}
              filterEmployees={filterEmployees}
              onFilterStatusToggle={s => setFilterStatuses(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; })}
              onFilterTypeToggle={t => setFilterTypes(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; })}
              onFilterEmployeeToggle={e => setFilterEmployees(prev => { const n = new Set(prev); n.has(e) ? n.delete(e) : n.add(e); return n; })}
              onClearFilters={() => { setFilterStatuses(new Set()); setFilterTypes(new Set()); setFilterEmployees(new Set()); }}
              onDateChange={d => { setCurrentDate(d); }}
              onViewChange={setView}
            />
          </div>

          {/* Main Calendar Area */}
          <div className="flex-1 min-w-0">
            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
              </div>
            )}

            {/* Views */}
            {!loading && view === 'team' && (
              <TeamView
                currentDate={currentDate}
                orders={filteredOrders}
                employees={employees}
                workSchedules={workSchedules}
                rowHeight={rowHeight}
                selectedOrderId={selectedOrder?.id ?? null}
                onSlotClick={handleSlotClick}
                onOrderClick={handleOrderClick}
              />
            )}

            {!loading && view === 'timeline' && (
              <TimelineView
                currentDate={currentDate}
                orders={filteredOrders}
                employees={employees}
                workSchedules={workSchedules}
                selectedOrderId={selectedOrder?.id ?? null}
                onSlotClick={handleSlotClick}
                onOrderClick={handleOrderClick}
              />
            )}

            {!loading && view === 'week' && (
              <WeekView
                currentDate={currentDate}
                orders={filteredOrders}
                onOrderClick={handleOrderClick}
                onDayClick={handleDayClick}
              />
            )}

            {!loading && view === 'month' && (
              <MonthView
                currentDate={currentDate}
                orders={filteredOrders}
                onOrderClick={handleOrderClick}
                onDayClick={handleDayClick}
              />
            )}
          </div>
        </div>
      </div>

      {/* Panels & Dialogs */}
      <OrderDetailPanel
        order={selectedOrder}
        employees={employees}
        onClose={() => setSelectedOrder(null)}
        onReassign={handleReassign}
        onOpenFull={id => router.push(`/orders`)}
      />

      <OrderCreationDialog
        open={newOrderDialog}
        onClose={() => setNewOrderDialog(false)}
        onCreated={fetchData}
        prefilledDate={newOrderPrefill.date}
        prefilledTime={newOrderPrefill.time}
        prefilledEmployeeId={newOrderPrefill.employeeId}
        clients={clients}
        services={services}
        employees={employees}
      />

      <UnassignedOrdersDrawer
        open={unassignedDrawer}
        onClose={() => setUnassignedDrawer(false)}
        orders={unassigned}
        employees={employees}
        dateStr={dateStr}
        onAssign={handleQuickAssign}
        onAutoAssign={handleAutoAssign}
        onOrderClick={order => {
          setUnassignedDrawer(false);
          setSelectedOrder(order);
        }}
      />
    </div>
  );
}
