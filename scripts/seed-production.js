// Production seed script for Wulkanizacja Mobilna
// Run: node scripts/seed-production.js

const SUPABASE_URL = 'https://ntudayqouqqoytjaxzpn.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50dWRheXFvdXFxb3l0amF4enBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI2NzE0NiwiZXhwIjoyMDg5ODQzMTQ2fQ.sF37gu61AmrhZDMEcFxm3zlcLkjFKdwC3ye4Tiei9xE';

const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
};

async function post(table, data, returning = false) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': returning ? 'return=representation' : 'return=minimal' },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`POST ${table}: ${res.status} ${text.slice(0,300)}`); return null; }
  return returning ? JSON.parse(text) : true;
}

async function patch(table, filter, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const t = await res.text(); console.error(`PATCH ${table}: ${res.status} ${t.slice(0,300)}`); }
}

async function del(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
  });
  if (!res.ok) { const t = await res.text(); console.error(`DELETE ${table}: ${res.status} ${t.slice(0,300)}`); }
}

// ── DATA ─────────────────────────────────────────────────────────────────────

const TODAY = '2026-03-25';
const TOMORROW = '2026-03-26';

const EMPLOYEES = [
  { id: '386bf467-484d-43d6-8df0-ab368cabd19d', profileId: '2ecc8df8-a637-4955-b4c3-1a02407f0872', fullName: 'Bartosz Kowalski', firstName: 'Bartosz', lastName: 'Kowalski', plate: 'WY 1234A' },
  { id: 'a59684fb-b17c-4cda-adc4-9aafc6779ff3', profileId: 'fdce8d3f-9f60-4a16-bd26-4b01978c1359', fullName: 'Jakub Nowak', firstName: 'Jakub', lastName: 'Nowak', plate: 'WY 5678B' },
  { id: '07b99061-69e1-4d42-90e4-59fb2693e7de', profileId: '717ec7b7-7965-4b02-ae94-881579c2bcbf', fullName: 'Marcin Wiśniewski', firstName: 'Marcin', lastName: 'Wiśniewski', plate: 'WY 9012C' },
  { id: '5d00fec0-4f96-4f8b-bbfd-fa048bdcfdf1', profileId: 'bddba6fb-5fbd-4cdb-87b8-719d0191a6a1', fullName: 'Mariusz Dąbrowski', firstName: 'Mariusz', lastName: 'Dąbrowski', plate: 'WY 3456D' },
  { id: '337b445e-5ede-4e04-8070-87c2a6f1b0f2', profileId: 'e9d2476f-d27e-4e9f-b743-9f6fab4de1bf', fullName: 'Michał Zając', firstName: 'Michał', lastName: 'Zając', plate: 'WY 7890E' },
  { id: '3e55c8f4-a10e-4414-9679-48a27da44dc6', profileId: 'ff5c03c0-2614-496d-8f5f-ff690852d47b', fullName: 'Daniel Wróbel', firstName: 'Daniel', lastName: 'Wróbel', plate: 'WY 2345F' },
  { id: '1eb90561-b9ec-47be-a78b-6f66f3f11b6e', profileId: 'd5609c71-be43-4769-ae1d-e51c89c8c874', fullName: 'Mateusz Szymański', firstName: 'Mateusz', lastName: 'Szymański', plate: 'WY 6789G' },
];

const [bart, jakub, marcin, mariusz, michal, daniel, mateusz] = EMPLOYEES;

const SVC = {
  komplet:    { id: 'c8000977-4c6f-4e4f-8af2-f02558d206be', name: 'Wymiana opon (komplet)', duration_minutes: 60, price: 120 },
  pojedyncza: { id: 'e9cefe62-5f51-4934-9ddb-4e070dac7480', name: 'Wymiana opon (pojedyncza)', duration_minutes: 20, price: 40 },
  waz_komplet:{ id: 'cb0e40ad-2a25-49c6-89c5-9a51e05e5114', name: 'Wyważanie kół (komplet)', duration_minutes: 40, price: 80 },
  przech:     { id: 'dc8ab1ce-1fe2-4b8d-8ba1-aada144b31f5', name: 'Przechowywanie opon (sezon)', duration_minutes: 15, price: 200 },
  dojazd:     { id: '780b6cd3-0df7-49f3-a110-6d05abcbec93', name: 'Serwis mobilny - dojazd', duration_minutes: 0, price: 50 },
  zawor:      { id: '3934ed2f-99d6-49d0-9063-efc70c600232', name: 'Wymiana zaworu', duration_minutes: 5, price: 20 },
  naprawa:    { id: 'e6bb8a9d-c296-4465-81e4-9f4d98e870c4', name: 'Naprawa opony', duration_minutes: 30, price: 50 },
  cisnienie:  { id: '4b6d94e2-42e0-4df0-a355-23f87fba440b', name: 'Kontrola ciśnienia', duration_minutes: 15, price: 0 },
};

const svc = (...keys) => keys.map(k => SVC[k]);
const price = (...keys) => keys.reduce((s, k) => s + SVC[k].price, 0) + SVC.dojazd.price;

const CLIENTS_DATA = [
  { name: 'Piotr Adamczyk',    phone: '501 234 567', address: 'ul. Puławska 142, Warszawa',      city: 'Warszawa', lat: 52.1912, lng: 21.0234, vehicles: [{ brand: 'Volkswagen', model: 'Golf',     year: 2019, tire_size: '205/55 R16', plate_number: 'WI 45623' }] },
  { name: 'Anna Kowalczyk',    phone: '502 345 678', address: 'ul. Wołoska 18, Warszawa',         city: 'Warszawa', lat: 52.1965, lng: 20.9912, vehicles: [{ brand: 'Toyota',     model: 'Corolla',  year: 2021, tire_size: '195/65 R15', plate_number: 'WI 78901' }] },
  { name: 'Krzysztof Malinowski', phone: '503 456 789', address: 'ul. Połczyńska 72, Warszawa',  city: 'Warszawa', lat: 52.2380, lng: 20.9412, vehicles: [{ brand: 'Ford',       model: 'Focus',    year: 2018, tire_size: '205/55 R16', plate_number: 'WG 23456' }] },
  { name: 'Katarzyna Wiśniewska', phone: '504 567 890', address: 'ul. Ogrodowa 28, Warszawa',    city: 'Warszawa', lat: 52.2360, lng: 20.9990, vehicles: [{ brand: 'Skoda',      model: 'Octavia',  year: 2020, tire_size: '215/55 R17', plate_number: 'WA 34567' }] },
  { name: 'Łukasz Pawlak',     phone: '505 678 901', address: 'ul. Świętokrzyska 14, Warszawa',  city: 'Warszawa', lat: 52.2367, lng: 21.0120, vehicles: [{ brand: 'BMW',        model: '3 Series', year: 2017, tire_size: '225/45 R18', plate_number: 'WA 56789' }] },
  { name: 'Agnieszka Krawczyk',phone: '506 789 012', address: 'ul. Inflancka 3, Warszawa',       city: 'Warszawa', lat: 52.2503, lng: 20.9951, vehicles: [{ brand: 'Opel',       model: 'Astra',    year: 2016, tire_size: '205/55 R16', plate_number: 'WA 67890' }] },
  { name: 'Tomasz Wróblewski', phone: '507 890 123', address: 'ul. Radzymińska 78, Warszawa',    city: 'Warszawa', lat: 52.2731, lng: 21.0612, vehicles: [{ brand: 'Renault',    model: 'Megane',   year: 2020, tire_size: '205/60 R16', plate_number: 'WB 12345' }] },
  { name: 'Monika Lewandowska',phone: '508 901 234', address: 'ul. Tarchomin 12, Warszawa',      city: 'Warszawa', lat: 52.3115, lng: 20.9972, vehicles: [{ brand: 'Honda',      model: 'Civic',    year: 2022, tire_size: '215/55 R17', plate_number: 'WB 23456' }] },
  { name: 'Rafał Jankowski',   phone: '509 012 345', address: 'ul. Pułkowa 98, Warszawa',        city: 'Warszawa', lat: 52.2895, lng: 20.9234, vehicles: [{ brand: 'Peugeot',    model: '308',      year: 2019, tire_size: '205/55 R16', plate_number: 'WB 34567' }] },
  { name: 'Ewa Nowicka',       phone: '510 123 456', address: 'ul. Grochowska 274, Warszawa',    city: 'Warszawa', lat: 52.2420, lng: 21.0823, vehicles: [{ brand: 'Seat',       model: 'Leon',     year: 2021, tire_size: '205/55 R16', plate_number: 'WI 12345' }] },
  { name: 'Michał Pietrzak',   phone: '511 234 567', address: 'ul. Czerniakowska 89, Warszawa',  city: 'Warszawa', lat: 52.2052, lng: 21.0304, vehicles: [{ brand: 'Audi',       model: 'A3',       year: 2018, tire_size: '225/45 R17', plate_number: 'WI 23456' }] },
  { name: 'Dorota Kamińska',   phone: '512 345 678', address: 'ul. Woronicza 21, Warszawa',      city: 'Warszawa', lat: 52.1985, lng: 21.0112, vehicles: [{ brand: 'Hyundai',    model: 'i30',      year: 2020, tire_size: '195/65 R15', plate_number: 'WA 78901' }] },
  { name: 'AUTO-SERVICE Piotrowski', phone: '513 456 789', address: 'ul. Szosa Pabianicka 3, Warszawa', city: 'Warszawa', lat: 52.1678, lng: 20.9978, vehicles: [{ brand: 'Mercedes', model: 'Sprinter', year: 2019, tire_size: '235/65 R16C', plate_number: 'WA 90123' }] },
  { name: 'Logistics Prima Sp. z o.o.', phone: '514 567 890', address: 'ul. Annopol 17, Warszawa', city: 'Warszawa', lat: 52.2882, lng: 21.0293, vehicles: [{ brand: 'Iveco', model: 'Daily', year: 2021, tire_size: '225/75 R16C', plate_number: 'WB 45678' }] },
  { name: 'Radosław Lis',      phone: '515 678 901', address: 'ul. Odkryta 56, Warszawa',        city: 'Warszawa', lat: 52.3005, lng: 21.0134, vehicles: [{ brand: 'Mazda',      model: 'CX-5',     year: 2022, tire_size: '225/55 R19', plate_number: 'WB 56789' }] },
  { name: 'Aleksandra Szymańska', phone: '516 789 012', address: 'ul. Żwirki i Wigury 9, Warszawa', city: 'Warszawa', lat: 52.1690, lng: 20.9676, vehicles: [{ brand: 'Nissan', model: 'Qashqai', year: 2021, tire_size: '215/65 R17', plate_number: 'WA 11223' }] },
  { name: 'Paweł Woźniak',     phone: '517 890 123', address: 'ul. Powsińska 34, Warszawa',      city: 'Warszawa', lat: 52.1625, lng: 21.0489, vehicles: [{ brand: 'Kia',        model: 'Sportage', year: 2020, tire_size: '225/60 R17', plate_number: 'WA 22334' }] },
  { name: 'Justyna Michalska', phone: '518 901 234', address: 'ul. Gagarina 28, Warszawa',       city: 'Warszawa', lat: 52.2075, lng: 21.0431, vehicles: [{ brand: 'Toyota',     model: 'Yaris',    year: 2019, tire_size: '185/65 R15', plate_number: 'WA 33445' }] },
  { name: 'Grzegorz Walczak',  phone: '519 012 345', address: 'ul. Stryjeńskich 22, Warszawa',   city: 'Warszawa', lat: 52.1592, lng: 21.0011, vehicles: [{ brand: 'Volkswagen', model: 'Passat',   year: 2017, tire_size: '215/55 R16', plate_number: 'WA 44556' }] },
  { name: 'Barbara Jabłońska', phone: '520 123 456', address: 'ul. Baśniowa 8, Warszawa',        city: 'Warszawa', lat: 52.2562, lng: 21.0812, vehicles: [{ brand: 'Fiat',       model: 'Tipo',     year: 2020, tire_size: '195/65 R15', plate_number: 'WW 55667' }] },
];

// Normalize order object: all same keys
function mkOrder(o) {
  return {
    client_id: o.client_id ?? null,
    employee_id: o.employee_id ?? null,
    status: o.status ?? 'new',
    priority: o.priority ?? 'normal',
    scheduled_date: o.date ?? TODAY,
    scheduled_time_start: o.start ?? '09:00',  // NOT NULL in schema
    scheduled_time_end: o.end ?? '16:00',
    address: o.address ?? '',
    lat: o.lat ?? null,
    lng: o.lng ?? null,
    services: o.services ?? [],
    total_price: o.total_price ?? 0,
    notes: o.notes ?? null,
    scheduling_type: o.scheduling_type ?? 'flexible',
    time_window: o.time_window ?? null,
    time_window_start: o.tw_start ?? null,
    time_window_end: o.tw_end ?? null,
  };
}

async function main() {
  console.log('🚀 Starting production seed...\n');

  // 1. Update employee names
  console.log('👤 Updating employee names...');
  for (const emp of EMPLOYEES) {
    await patch('employees', `id=eq.${emp.id}`, { first_name: emp.firstName, last_name: emp.lastName, vehicle_info: emp.plate });
    await patch('profiles', `id=eq.${emp.profileId}`, { full_name: emp.fullName });
  }
  console.log(`   ✓ Updated ${EMPLOYEES.length} employees\n`);

  // 2. Work schedules
  console.log('📅 Creating work schedules...');
  await del('work_schedules', `date=in.(${TODAY},${TOMORROW})`);
  const schedules = EMPLOYEES.flatMap(e => [
    { employee_id: e.id, date: TODAY,     start_time: '08:00', end_time: '16:00' },
    { employee_id: e.id, date: TOMORROW,  start_time: '08:00', end_time: '16:00' },
  ]);
  await post('work_schedules', schedules);
  console.log(`   ✓ Created ${schedules.length} schedules\n`);

  // 3. Create clients one by one (safer than batch with vehicles JSONB)
  console.log('👥 Creating clients...');
  const clientMap = {};
  for (const c of CLIENTS_DATA) {
    const rows = await post('clients', {
      name: c.name, phone: c.phone, email: null,
      address: c.address, city: c.city, lat: c.lat, lng: c.lng,
      vehicles: c.vehicles,
    }, true);
    if (rows?.[0]) clientMap[c.name] = { ...rows[0], lat: c.lat, lng: c.lng, address: c.address };
  }
  console.log(`   ✓ Created ${Object.keys(clientMap).length} clients\n`);

  const C = (name) => clientMap[name] || {};

  // 4. Clear test orders
  console.log('🗑️  Clearing old orders for these dates...');
  await del('orders', `scheduled_date=in.(${TODAY},${TOMORROW})&status=in.(new,assigned,in_progress)`);
  console.log('   ✓ Cleared\n');

  // 5. Create today's orders
  console.log('📋 Creating orders for today...');

  const todayOrders = [
    // BARTOSZ — Mokotów/Ursynów zone
    mkOrder({ client_id: C('Piotr Adamczyk').id,     employee_id: bart.id,    status: 'assigned',    priority: 'high',   start: '08:30', end: '10:00', address: C('Piotr Adamczyk').address,     lat: C('Piotr Adamczyk').lat,     lng: C('Piotr Adamczyk').lng,     services: svc('komplet','waz_komplet','dojazd'), total_price: price('komplet','waz_komplet'), scheduling_type: 'time_window', time_window: 'morning',   tw_start: '08:00', tw_end: '12:00', notes: 'Klient prosi o telefon 30 min przed przyjazdem. Opony w garażu.' }),
    mkOrder({ client_id: C('Dorota Kamińska').id,     employee_id: bart.id,    status: 'assigned',    priority: 'normal', start: '10:30', end: '11:30', address: C('Dorota Kamińska').address,     lat: C('Dorota Kamińska').lat,     lng: C('Dorota Kamińska').lng,     services: svc('komplet','dojazd'),               total_price: price('komplet'),               scheduling_type: 'time_window', time_window: 'morning',   tw_start: '10:00', tw_end: '13:00' }),
    mkOrder({ client_id: C('Justyna Michalska').id,   employee_id: bart.id,    status: 'assigned',    priority: 'normal', start: '12:00', end: '13:30', address: C('Justyna Michalska').address,   lat: C('Justyna Michalska').lat,   lng: C('Justyna Michalska').lng,   services: svc('komplet','waz_komplet','dojazd'), total_price: price('komplet','waz_komplet'), scheduling_type: 'flexible',                              tw_start: '11:00', tw_end: '15:00', notes: 'Wymiana na letnie' }),

    // JAKUB — Praga/Targówek zone
    mkOrder({ client_id: C('Tomasz Wróblewski').id,   employee_id: jakub.id,   status: 'assigned',    priority: 'urgent', start: '08:00', end: '09:00', address: C('Tomasz Wróblewski').address,   lat: C('Tomasz Wróblewski').lat,   lng: C('Tomasz Wróblewski').lng,   services: svc('naprawa','dojazd'),               total_price: price('naprawa'),               scheduling_type: 'asap',        notes: 'PILNE! Przebita opona, klient stoi na parkingu przy CH Promenada.' }),
    mkOrder({ client_id: C('Ewa Nowicka').id,         employee_id: jakub.id,   status: 'assigned',    priority: 'normal', start: '10:00', end: '11:30', address: C('Ewa Nowicka').address,         lat: C('Ewa Nowicka').lat,         lng: C('Ewa Nowicka').lng,         services: svc('komplet','dojazd'),               total_price: price('komplet'),               scheduling_type: 'time_window', time_window: 'morning',   tw_start: '09:00', tw_end: '12:00' }),
    mkOrder({ client_id: C('Barbara Jabłońska').id,   employee_id: jakub.id,   status: 'assigned',    priority: 'normal', start: '12:30', end: '13:30', address: C('Barbara Jabłońska').address,   lat: C('Barbara Jabłońska').lat,   lng: C('Barbara Jabłońska').lng,   services: svc('komplet','dojazd'),               total_price: price('komplet'),               scheduling_type: 'time_window', time_window: 'afternoon', tw_start: '12:00', tw_end: '15:00' }),

    // MARIUSZ — Wola/Bemowo zone
    mkOrder({ client_id: C('Krzysztof Malinowski').id,employee_id: mariusz.id, status: 'assigned',    priority: 'normal', start: '08:00', end: '09:30', address: C('Krzysztof Malinowski').address, lat: C('Krzysztof Malinowski').lat, lng: C('Krzysztof Malinowski').lng, services: svc('komplet','waz_komplet','dojazd'), total_price: price('komplet','waz_komplet'), scheduling_type: 'fixed_time',                            tw_start: '08:00', tw_end: '10:00', notes: 'Stały klient - zawsze punktualnie o 8:00' }),
    mkOrder({ client_id: C('Agnieszka Krawczyk').id,  employee_id: mariusz.id, status: 'assigned',    priority: 'normal', start: '10:00', end: '11:00', address: C('Agnieszka Krawczyk').address,  lat: C('Agnieszka Krawczyk').lat,  lng: C('Agnieszka Krawczyk').lng,  services: svc('komplet','dojazd'),               total_price: price('komplet'),               scheduling_type: 'time_window', time_window: 'morning',   tw_start: '09:30', tw_end: '13:00' }),
    mkOrder({ client_id: C('Logistics Prima Sp. z o.o.').id, employee_id: mariusz.id, status: 'in_progress', priority: 'high', start: '11:30', end: '13:30', address: C('Logistics Prima Sp. z o.o.').address, lat: C('Logistics Prima Sp. z o.o.').lat, lng: C('Logistics Prima Sp. z o.o.').lng, services: svc('komplet','waz_komplet','dojazd'), total_price: price('komplet','waz_komplet') * 2, scheduling_type: 'time_window', tw_start: '11:00', tw_end: '14:00', notes: '2 pojazdy dostawcze – Iveco Daily + VW Transporter. Parkig firmowy zarezerwowany.' }),
    mkOrder({ client_id: C('Rafał Jankowski').id,     employee_id: mariusz.id, status: 'assigned',    priority: 'normal', start: '14:00', end: '15:00', address: C('Rafał Jankowski').address,     lat: C('Rafał Jankowski').lat,     lng: C('Rafał Jankowski').lng,     services: svc('komplet','dojazd'),               total_price: price('komplet'),               scheduling_type: 'flexible',                              tw_start: '13:00', tw_end: '16:00', notes: 'Można do 16:00' }),

    // MICHAŁ — Bielany/Tarchomin zone
    mkOrder({ client_id: C('Monika Lewandowska').id,  employee_id: michal.id,  status: 'assigned',    priority: 'normal', start: '09:00', end: '10:30', address: C('Monika Lewandowska').address,  lat: C('Monika Lewandowska').lat,  lng: C('Monika Lewandowska').lng,  services: svc('komplet','przech','waz_komplet','dojazd'), total_price: price('komplet','przech','waz_komplet'), scheduling_type: 'time_window', time_window: 'morning', tw_start: '08:30', tw_end: '12:00', notes: 'Nowy klient z polecenia. Wymiana na letnie + magazynowanie zimowych.' }),
    mkOrder({ client_id: C('Radosław Lis').id,        employee_id: michal.id,  status: 'assigned',    priority: 'high',   start: '11:30', end: '13:00', address: C('Radosław Lis').address,        lat: C('Radosław Lis').lat,        lng: C('Radosław Lis').lng,        services: svc('komplet','przech','dojazd'),      total_price: price('komplet','przech'),      scheduling_type: 'time_window',                           tw_start: '11:00', tw_end: '14:00', notes: 'Wymiana na letnie + odbiór zimowych do magazynu' }),

    // DANIEL — Wilanów/Południe zone
    mkOrder({ client_id: C('Grzegorz Walczak').id,    employee_id: daniel.id,  status: 'assigned',    priority: 'normal', start: '08:30', end: '10:00', address: C('Grzegorz Walczak').address,    lat: C('Grzegorz Walczak').lat,    lng: C('Grzegorz Walczak').lng,    services: svc('komplet','waz_komplet','dojazd'), total_price: price('komplet','waz_komplet'), scheduling_type: 'time_window', time_window: 'morning',   tw_start: '08:00', tw_end: '11:00' }),
    mkOrder({ client_id: C('Aleksandra Szymańska').id,employee_id: daniel.id,  status: 'assigned',    priority: 'normal', start: '11:00', end: '12:30', address: C('Aleksandra Szymańska').address, lat: C('Aleksandra Szymańska').lat, lng: C('Aleksandra Szymańska').lng, services: svc('komplet','przech','dojazd'),      total_price: price('komplet','przech'),      scheduling_type: 'flexible',                              notes: 'Opony do zostawienia w magazynie' }),
    mkOrder({ client_id: C('Paweł Woźniak').id,       employee_id: daniel.id,  status: 'assigned',    priority: 'normal', start: '13:00', end: '14:00', address: C('Paweł Woźniak').address,       lat: C('Paweł Woźniak').lat,       lng: C('Paweł Woźniak').lng,       services: svc('komplet','dojazd'),               total_price: price('komplet'),               scheduling_type: 'flexible',                              tw_start: '12:00', tw_end: '16:00' }),

    // MATEUSZ — Żoliborz/Lotnisko zone
    mkOrder({ client_id: C('AUTO-SERVICE Piotrowski').id, employee_id: mateusz.id, status: 'assigned', priority: 'high', start: '09:00', end: '11:00', address: C('AUTO-SERVICE Piotrowski').address, lat: C('AUTO-SERVICE Piotrowski').lat, lng: C('AUTO-SERVICE Piotrowski').lng, services: svc('komplet','waz_komplet','dojazd'), total_price: price('komplet','waz_komplet') * 2, scheduling_type: 'fixed_time', tw_start: '09:00', tw_end: '11:00', notes: 'Flota 2 pojazdów. Klient biznesowy – FV 30 dni.' }),
    mkOrder({ client_id: C('Anna Kowalczyk').id,      employee_id: mateusz.id, status: 'assigned',    priority: 'normal', start: '12:00', end: '13:00', address: C('Anna Kowalczyk').address,      lat: C('Anna Kowalczyk').lat,      lng: C('Anna Kowalczyk').lng,      services: svc('komplet','dojazd'),               total_price: price('komplet'),               scheduling_type: 'time_window', time_window: 'afternoon', tw_start: '12:00', tw_end: '16:00' }),

    // MARCIN — dostępny, brak zleceń (celowo dla testów planera)

    // UNASSIGNED — do przydzielenia przez dyspozytora
    mkOrder({ client_id: C('Katarzyna Wiśniewska').id, employee_id: null, status: 'new', priority: 'urgent', address: C('Katarzyna Wiśniewska').address, lat: C('Katarzyna Wiśniewska').lat, lng: C('Katarzyna Wiśniewska').lng, services: svc('naprawa','zawor','dojazd'), total_price: price('naprawa','zawor'), scheduling_type: 'asap', notes: 'PILNE! Opona spuszcza powietrze, klientka stoi na ul. Marszałkowskiej. Jedzie na felce.' }),
    mkOrder({ client_id: C('Łukasz Pawlak').id,       employee_id: null, status: 'new', priority: 'high',   address: C('Łukasz Pawlak').address,       lat: C('Łukasz Pawlak').lat,       lng: C('Łukasz Pawlak').lng,       services: svc('komplet','waz_komplet','dojazd'), total_price: price('komplet','waz_komplet'), scheduling_type: 'time_window', time_window: 'morning', tw_start: '09:00', tw_end: '13:00', notes: 'BMW 3 Series – prosi o doświadczonego mechanika' }),
    mkOrder({ client_id: C('Michał Pietrzak').id,     employee_id: null, status: 'new', priority: 'normal', address: C('Michał Pietrzak').address,     lat: C('Michał Pietrzak').lat,     lng: C('Michał Pietrzak').lng,     services: svc('komplet','dojazd'),               total_price: price('komplet'),               scheduling_type: 'flexible' }),
    mkOrder({ client_id: C('Piotr Adamczyk').id,      employee_id: null, status: 'new', priority: 'low',    address: 'ul. Marszałkowska 100, Warszawa', lat: 52.2316,                          lng: 21.0122,                          services: svc('cisnienie','zawor','dojazd'),    total_price: price('cisnienie','zawor'),    scheduling_type: 'flexible',    notes: 'Kontrola ciśnienia + wymiana 1 zaworu. Drobna sprawa.' }),
  ];

  const created = await post('orders', todayOrders, true);
  const assignedCount = todayOrders.filter(o => o.employee_id).length;
  const unassignedCount = todayOrders.filter(o => !o.employee_id).length;
  console.log(`   ✓ Created ${created?.length ?? '?'} orders (${assignedCount} assigned, ${unassignedCount} unassigned)\n`);

  // 6. Tomorrow's orders
  console.log('📋 Creating orders for tomorrow...');
  const tomorrowOrders = [
    mkOrder({ client_id: C('Katarzyna Wiśniewska').id, employee_id: bart.id,   status: 'assigned', priority: 'normal', date: TOMORROW, start: '09:00', end: '10:00', address: C('Katarzyna Wiśniewska').address, lat: C('Katarzyna Wiśniewska').lat, lng: C('Katarzyna Wiśniewska').lng, services: svc('komplet','dojazd'), total_price: price('komplet'), scheduling_type: 'time_window', time_window: 'morning', tw_start: '08:00', tw_end: '12:00' }),
    mkOrder({ client_id: C('Michał Pietrzak').id,     employee_id: jakub.id,  status: 'assigned', priority: 'normal', date: TOMORROW, start: '10:00', end: '11:30', address: C('Michał Pietrzak').address,     lat: C('Michał Pietrzak').lat,     lng: C('Michał Pietrzak').lng,     services: svc('komplet','waz_komplet','dojazd'), total_price: price('komplet','waz_komplet'), scheduling_type: 'flexible' }),
    mkOrder({ client_id: C('Anna Kowalczyk').id,      employee_id: null,      status: 'new',      priority: 'high',   date: TOMORROW, address: C('Anna Kowalczyk').address,      lat: C('Anna Kowalczyk').lat,      lng: C('Anna Kowalczyk').lng,      services: svc('komplet','waz_komplet','dojazd'), total_price: price('komplet','waz_komplet'), scheduling_type: 'time_window', tw_start: '09:00', tw_end: '13:00' }),
    mkOrder({ client_id: C('Łukasz Pawlak').id,       employee_id: null,      status: 'new',      priority: 'normal', date: TOMORROW, address: C('Łukasz Pawlak').address,       lat: C('Łukasz Pawlak').lat,       lng: C('Łukasz Pawlak').lng,       services: svc('waz_komplet','dojazd'),           total_price: price('waz_komplet'),           scheduling_type: 'flexible' }),
    mkOrder({ client_id: C('Grzegorz Walczak').id,    employee_id: null,      status: 'new',      priority: 'urgent', date: TOMORROW, address: C('Grzegorz Walczak').address,    lat: C('Grzegorz Walczak').lat,    lng: C('Grzegorz Walczak').lng,    services: svc('naprawa','dojazd'),               total_price: price('naprawa'),               scheduling_type: 'asap', notes: 'Uszkodzona opona na autostradzie – klient odholowany do domu' }),
    mkOrder({ client_id: C('Rafał Jankowski').id,     employee_id: null,      status: 'new',      priority: 'normal', date: TOMORROW, address: C('Rafał Jankowski').address,     lat: C('Rafał Jankowski').lat,     lng: C('Rafał Jankowski').lng,     services: svc('komplet','przech','dojazd'),      total_price: price('komplet','przech'),      scheduling_type: 'time_window', time_window: 'afternoon', tw_start: '12:00', tw_end: '16:00' }),
  ];
  const cr2 = await post('orders', tomorrowOrders, true);
  console.log(`   ✓ Created ${cr2?.length ?? '?'} orders for tomorrow\n`);

  // 7. GPS locations
  console.log('📍 Updating GPS locations...');
  const locs = [
    { employee_id: bart.id,    lat: 52.1950, lng: 21.0180, status: 'driving', speed: 45, heading: 180 },
    { employee_id: jakub.id,   lat: 52.2700, lng: 21.0580, status: 'working', speed: 0,  heading: 90  },
    { employee_id: marcin.id,  lat: 52.2460, lng: 20.9890, status: 'online',  speed: 0,  heading: 0   },
    { employee_id: mariusz.id, lat: 52.2420, lng: 20.9450, status: 'driving', speed: 38, heading: 270 },
    { employee_id: michal.id,  lat: 52.3050, lng: 20.9980, status: 'driving', speed: 52, heading: 0   },
    { employee_id: daniel.id,  lat: 52.1640, lng: 21.0040, status: 'working', speed: 0,  heading: 45  },
    { employee_id: mateusz.id, lat: 52.1720, lng: 20.9700, status: 'online',  speed: 0,  heading: 0   },
  ];
  for (const loc of locs) {
    await post('employee_locations', { ...loc, timestamp: new Date().toISOString(), engine_on: loc.speed > 0 });
  }
  console.log(`   ✓ Updated ${locs.length} GPS locations\n`);

  console.log('✅ Done! Summary:');
  console.log(`  • 7 employees with proper Polish names`);
  console.log(`  • Work schedules: ${TODAY} and ${TOMORROW}`);
  console.log(`  • ${Object.keys(clientMap).length} new clients (Warsaw area)`);
  console.log(`  • ${todayOrders.length} orders today (${assignedCount} assigned, ${unassignedCount} unassigned)`);
  console.log(`  • ${tomorrowOrders.length} orders tomorrow`);
  console.log(`  • GPS tracking data for 7 employees`);
  console.log('');
  console.log('Employees and their loads today:');
  const loads = {};
  for (const o of todayOrders.filter(o => o.employee_id)) {
    loads[o.employee_id] = (loads[o.employee_id] || 0) + 1;
  }
  for (const e of EMPLOYEES) {
    const n = loads[e.id] || 0;
    const marker = e.id === marcin.id ? ' (brak zleceń – do testów)' : '';
    console.log(`  - ${e.fullName}: ${n} zlecenia${marker}`);
  }
}

main().catch(console.error);
