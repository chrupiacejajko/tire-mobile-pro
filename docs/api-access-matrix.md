# API Access Matrix

Audit date: 2026-03-28

## Auth Levels

| Level | Gate | Description |
|-------|------|-------------|
| **Public** | None | No authentication. Available to anonymous users, booking portal, Smifybot. |
| **Worker** | Worker token OR session (admin/dispatcher/worker) | Mobile app endpoints for field workers. |
| **Admin** | Session (admin/dispatcher only) | Dashboard management endpoints. Default for all unlisted `/api/*` routes. |
| **Webhook** | Bypass middleware; handler must self-auth | Inbound data from external systems (SatisGPS, Smifybot). |

## Route Matrix

| Endpoint | Methods | Auth Level | Notes |
|----------|---------|------------|-------|
| `/api/health` | GET | Public | Uptime probe. No sensitive data. |
| `/api/geocode` | GET | Public | HERE geocoding proxy for booking form. |
| `/api/here-autocomplete` | GET | Public | HERE address autocomplete for booking form. |
| `/api/here-lookup` | GET | Public | HERE place lookup for booking form. |
| `/api/here-discover` | GET | Public | HERE nearby search for booking form. |
| `/api/orders` | POST | Public | Booking portal order creation. Rate-limited per IP (`10 req / min`) + 5-min duplicate guard. |
| `/api/orders` | GET, PUT | Admin | List/update orders. In-handler checkAuth for admin/dispatcher. |
| `/api/orders/assign-worker` | POST | Admin | Assign worker to order. |
| `/api/orders/cancel` | POST | Admin | Cancel order (dispatcher action). |
| `/api/orders/lock` | POST | Admin | Lock/unlock order for editing. |
| `/api/orders/reschedule` | POST | Admin | Reschedule order (dispatcher action). |
| `/api/orders/suggest-employees` | GET | Admin | Auto-assign suggestions. |
| `/api/orders/unassign` | POST | Admin | Remove worker assignment. |
| `/api/orders/update-time` | POST | Admin | Update order time window. |
| `/api/invite/accept` | POST | Public | Worker invite activation. Token-gated + rate-limited (5/hr per IP). |
| `/api/tracking/[id]` | GET | Public | Client order tracking. **Exposes worker GPS lat/lng/speed** for ETA. Rate-limited (60/15min). |
| `/api/tracking/actions` | POST | Public | Client self-service cancel/reschedule. Token-gated + rate-limited (10/15min). |
| `/api/auth/worker-login` | POST | Public | Worker login (prefix match on `/api/auth/`). |
| `/api/auth/worker-logout` | POST | Public | Worker logout (prefix match on `/api/auth/`). |
| `/api/availability` | GET | Public | Slot/window availability for booking portal. |
| `/api/availability/smart` | GET | Public | Smart availability with scoring. |
| `/api/availability/nearby-driver` | GET | Public | Nearest available worker. Exposes proximity data. |
| `/api/worker-notifications` | GET, POST, PUT | Worker | Worker notification inbox. Scoped to own employee_id. |
| `/api/worker/me` | GET | Worker | Worker profile info. |
| `/api/worker/nearby` | GET | Worker | Nearby workers/resources. |
| `/api/worker/day-summary` | GET | Worker | Worker daily summary. |
| `/api/worker/tasks` | GET | Worker | Worker task list. |
| `/api/worker/tasks/[id]/arrive` | POST | Worker | Mark arrival at task. |
| `/api/worker/tasks/[id]/start-driving` | POST | Worker | Mark driving to task. |
| `/api/worker/tasks/[id]/report-problem` | POST | Worker | Report problem with task. |
| `/api/worker/tasks/[id]/report-delay` | POST | Worker | Report delay on task. |
| `/api/worker/tasks/complete` | POST | Worker | Complete a task. |
| `/api/worker/shift/start` | POST | Worker | Start shift. |
| `/api/worker/shift/end` | POST | Worker | End shift. |
| `/api/worker/shift/break/start` | POST | Worker | Start break. |
| `/api/worker/shift/break/end` | POST | Worker | End break. |
| `/api/satisgps/webhook` | POST | Webhook | SatisGPS push endpoint. Requires HMAC-SHA256 signature header + `SATISGPS_WEBHOOK_SECRET`. |
| `/api/satisgps/sync` | GET, POST | Webhook | Manual/cron GPS sync. Cron mode checks `SATISGPS_WEBHOOK_SECRET`. |
| `/api/satisgps/cron` | GET | Webhook | Railway cron GPS poll. Checks `SATISGPS_WEBHOOK_SECRET` via query param. |
| `/api/satisgps/debug` | GET | Admin | GPS diagnostics. Admin-only, excluded from webhook bypass. |
| `/api/webhooks` | POST | Webhook | Generic inbound webhook (Smifybot). Requires `X-Webhook-Secret` + `WEBHOOK_SHARED_SECRET`. |
| `/api/webhooks/config` | GET, POST, DELETE | Admin | Webhook CRUD management. **Fixed: was accidentally in webhook bypass.** |
| `/api/employees` | GET, POST, PUT, DELETE | Admin | Employee CRUD. |
| `/api/vehicles` | GET, POST, PUT, DELETE | Admin | Vehicle fleet CRUD. |
| `/api/vehicles/locations` | GET | Admin | All vehicle locations. |
| `/api/vehicle-assignments` | PUT | Admin | Assign vehicles to workers. |
| `/api/services` | GET, PUT, DELETE | Admin | Service catalog management. |
| `/api/clients/search` | GET | Admin | Client search. |
| `/api/planner` | GET | Admin | Route planner view. |
| `/api/planner/optimize` | POST | Admin | Route optimization. |
| `/api/planner/auto-optimize` | POST | Admin | Automatic route optimization. |
| `/api/planner/reoptimize` | POST | Admin | Re-optimize existing routes. |
| `/api/planner/suggest-insert` | POST | Admin | Suggest order insertion point. |
| `/api/planner/insert` | POST | Admin | Insert order into route. |
| `/api/planner/undo` | POST | Admin | Undo planner action. |
| `/api/dispatcher/orders` | GET | Admin | Dispatcher order view. |
| `/api/dispatcher/routes` | GET | Admin | Dispatcher route view. |
| `/api/dispatcher/workers` | GET | Admin | Dispatcher worker list. |
| `/api/reports/daily` | GET | Admin | Daily report. |
| `/api/reports/financial` | GET | Admin | Financial report. |
| `/api/reports/plan-vs-execution` | GET | Admin | Plan vs execution report. |
| `/api/reports/gps-compliance` | GET | Admin | GPS compliance report. |
| `/api/reports/work-time` | GET | Admin | Work time report. |
| `/api/fleet/live` | GET | Admin | Live fleet positions. |
| `/api/fleet/daily-stats` | GET, POST | Admin | Fleet daily statistics. |
| `/api/fleet/stream` | GET | Admin | Fleet SSE stream. |
| `/api/gps` | GET, POST | Admin | Legacy GPS endpoint. |
| `/api/employee-gps` | GET | Admin | Employee GPS positions. |
| `/api/shifts` | GET, POST | Admin | Shift management. |
| `/api/shifts/summary` | GET | Admin | Shift summary. |
| `/api/work-logs` | GET, POST | Admin | Work log entries. |
| `/api/work-schedules` | GET, POST, DELETE | Admin | Work schedule management. |
| `/api/deposits` | GET, POST | Admin | Tire deposit management. |
| `/api/deposits/[id]` | PATCH, DELETE | Admin | Tire deposit CRUD by ID. |
| `/api/regions` | GET, POST, PUT, PATCH, DELETE | Admin | Region management. |
| `/api/assign` | POST | Admin | Generic assignment endpoint. |
| `/api/notify` | GET, POST | Admin | Send notifications to clients. |
| `/api/notifications/email` | POST | Admin | Send email notifications. |
| `/api/notification-templates` | GET, POST, PUT, DELETE | Admin | Notification template CRUD. |
| `/api/recurring-orders` | GET, POST, PUT, DELETE | Admin | Recurring order templates. |
| `/api/recurring-orders/generate` | POST | Admin | Generate orders from recurring templates. |
| `/api/schedule-templates` | GET, POST | Admin | Schedule template management. |
| `/api/route-suggest` | GET | Admin | Route suggestions. |
| `/api/import` | POST | Admin | Data import. |
| `/api/upload` | POST | Admin | File upload. |
| `/api/company-settings` | GET, PUT | Admin | Company settings. |
| `/api/alert-rules` | GET, POST, PUT, DELETE | Admin | Alert rule configuration. |
| `/api/alerts` | GET, POST, PUT | Admin | Alert management. |
| `/api/alerts/check` | POST | Admin | Run alert checks. |
| `/api/unavailabilities` | GET, POST, DELETE | Admin | Worker unavailability management. |
| `/api/subtasks` | GET, POST, PUT | Admin | Subtask management. |
| `/api/task-templates` | GET, POST | Admin | Task template management. |
| `/api/closure-codes` | GET, POST | Admin | Order closure code management. |
| `/api/form-templates` | GET, POST, PUT, DELETE | Admin | Form template management. |
| `/api/form-templates/linked-services` | GET | Admin | Services linked to form templates. |
| `/api/form-submissions` | GET, POST | Admin | Form submission data. |
| `/api/skills` | GET, POST, PUT, DELETE | Admin | Worker skill management. |
| `/api/equipment` | GET, POST, PUT | Admin | Equipment management. |
| `/api/equipment-types` | GET, POST | Admin | Equipment type definitions. |
| `/api/materials` | GET, POST | Admin | Material management. |
| `/api/material-types` | GET, POST | Admin | Material type definitions. |
| `/api/warehouses` | GET, POST, PUT | Admin | Warehouse management. |
| `/api/sms/queue` | POST | Admin | Queue SMS for sending. |
| `/api/sms/process-pending` | POST | Admin | Process queued SMS messages. |
| `/api/admin/workers/invite` | POST | Admin | Create worker invite. |
| `/api/admin/workers/[id]/operational-state` | PUT | Admin | Update worker operational state. |

## Security Findings

### Critical

1. **`/api/webhooks/config` was in webhook bypass** (FIXED)
   - The `/api/webhooks/` prefix in `WEBHOOK_ALLOWLIST` caused `/api/webhooks/config` (GET/POST/DELETE) to bypass auth entirely.
   - Anyone could list, create, or delete webhook configurations without authentication.
   - Fix: `isWebhookBypassPath()` now explicitly excludes `/api/webhooks/config`.

### High

2. **`POST /api/orders` is public**
   - Public endpoint for creating orders. It now has IP rate limiting (`10 req / min`) plus a 5-min duplicate guard.
   - Residual risk: in-memory limiter is per-instance, so horizontal scale weakens the guarantee.
   - Recommendation: keep monitoring abuse and move to distributed limiting only if traffic justifies it.

3. **`POST /api/webhooks` is middleware-bypassed by design**
   - Handler now checks `X-Webhook-Secret` against `WEBHOOK_SHARED_SECRET`.
   - Residual risk exists only if the secret is missing, weak, or leaked.

4. **`POST /api/satisgps/webhook` is middleware-bypassed by design**
   - Handler now verifies HMAC-SHA256 signature using `SATISGPS_WEBHOOK_SECRET`.
   - Residual risk exists only if the secret is missing, weak, or leaked.

5. **`GET /api/satisgps/debug` remains sensitive**
   - It no longer bypasses auth and now requires admin session.
   - Recommendation: keep it diagnostic-only and avoid exposing it outside trusted operators.

### Medium

6. **`GET /api/tracking/[id]` exposes worker GPS coordinates**
   - Returns driver lat/lng/speed to unauthenticated users for ETA display.
   - Intentional for customer tracking UX. Rate-limited (60 req / 15 min per IP+order).
   - Order IDs are UUIDs (hard to guess), providing some obscurity.
   - Acceptable risk for the use case, but consider: only returning ETA (not raw coords), or requiring a tracking token.

7. **`GET /api/availability/nearby-driver`** is public
   - Could reveal approximate worker positions to the booking portal.
   - Acceptable for booking UX but worth monitoring.

### Low

8. **`/api/integrations/` in webhook allowlist has no routes**
   - Dead prefix. No security impact currently, but could be exploited if routes are added without realizing they bypass auth.
