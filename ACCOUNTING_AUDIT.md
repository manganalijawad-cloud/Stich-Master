# Accounting & Financial System Audit — Stich Master (Hello Darzi)

> **Audit Date:** 2026-07-22  
> **Scope:** `apps/desktop`, `packages/server`, `packages/shared`, `schema.sql`  
> **Purpose:** Determine what accounting features exist, what is missing, and what to build next.

---

## 1. Current Accounting Features

### 1.1 Order Payments (Per-Order `paid_amount`)

- **How it works:** Each order has a `paid_amount` column. When an order is created, the user enters an initial payment (can be 0). When advancing to "Delivered" status, a payment dialog prompts for additional collection. Payments can also be edited later via the Owner-only edit form.
- **Files:**
  - `packages/server/src/db.ts` — `createOrder()`, `updateOrder()` set `paid_amount`
  - `packages/server/src/index.ts` — `PUT /api/orders/:id` handles payment diff → `PAYMENT_RECEIVED` / `REFUND` audit logs
  - `apps/desktop/ui/src/components/OrdersSection.tsx` — Payment collection dialog at delivery (`handleDeliverCollectPayment`), edit form for `paid_amount`
- **Tables:** `orders.paid_amount`
- **Status:** Complete — functional but basic. No payment method tracking, no installment tracking, no payment receipt numbering.

### 1.2 Discount System

- **How it works:** Orders support a discount toggle: `discount_type` (`fixed` | `percentage`), `discount_value`, `discount_amount`, and `final_total`. Applied at order creation and editable on existing orders.
- **Files:**
  - `packages/server/src/db.ts` — Discount columns on `orders` table (SQLite)
  - `schema.sql` — Discount columns on `orders` (Supabase, lines 392–395)
  - `packages/server/src/migrate.ts` — Migration for discount columns
  - `apps/desktop/ui/src/components/OrdersSection.tsx` — Discount UI in booking flow and edit flow
  - `packages/server/src/index.ts` — Discount fields sent in `POST /api/orders` and `PUT /api/orders/:id`
- **Tables:** `orders.discount_type`, `orders.discount_value`, `orders.discount_amount`, `orders.final_total`
- **Status:** Complete — functional discount application. No validation that `discount_amount <= total_amount` on the server side (`Math.min` is only applied on the frontend).

### 1.3 Remaining Balance / Outstanding Tracking

- **How it works:** Calculated client-side as `(final_total ?? total_amount) - paid_amount`. Displayed in order list as "Due" badges, in Financial Reports as "Outstanding" KPI, and in Customer Balances section.
- **Files:**
  - `apps/desktop/ui/src/components/FinancialReports.tsx` — `outstanding = totalRevenue - totalCollected`
  - `apps/desktop/ui/src/components/OrdersSection.tsx` — Due badge on each order card
  - `packages/server/src/db.ts` — `getDashboardStats()` returns `pendingAmount` (SUM of `total_amount - paid_amount` for active orders)
- **Tables:** Computed from `orders.total_amount` / `orders.paid_amount`
- **Status:** Complete — but calculated in multiple places (frontend and backend), creating risk of inconsistency.

### 1.4 Audit Logging (Payment Events)

- **How it works:** Every payment-related action logs an `audit_logs` entry with action type `PAYMENT_RECEIVED` or `REFUND`, including the amount, previous paid value, and new paid value. Edit actions also log `EDIT_ORDER` with before/after snapshots.
- **Files:**
  - `packages/server/src/index.ts` — `logAction()` calls for payment diff tracking (lines 1770–1792, 1866–1879)
  - `packages/server/src/db.ts` — `logAction()` writes to SQLite `audit_logs`
  - `schema.sql` — `audit_logs` table definition (lines 232–249)
- **Tables:** `audit_logs`
- **Status:** Complete — good audit trail for payment changes. However, there is no dedicated payment transaction table — all history is reconstructed from audit logs and order state snapshots.

### 1.5 Expense Tracking (Inventory-Based)

- **How it works:** Expenses are calculated from the `inventory` table. Each inventory item has a `price` and `quantity`. Total expense = SUM of all `price * quantity`. Displayed in Financial Reports as "Material Costs."
- **Files:**
  - `apps/desktop/ui/src/components/FinancialReports.tsx` — `totalExpenses` calculated from inventory (lines 98–103)
  - `packages/server/src/db.ts` — Inventory CRUD (`getInventory`, `createInventoryItem`, `updateInventoryItem`, `deleteInventoryItem`)
  - `packages/server/src/index.ts` — Inventory data fetched in `GET /api/reports/financials`
- **Tables:** `inventory` (name, quantity, price)
- **Status:** **Incomplete** — This is not true expense tracking. Inventory `price * quantity` represents the value of stock on hand, not actual expenses incurred. There is no concept of recording a purchase, a supplier, a bill, a cost category, or tracking when an expense was incurred. The "Material Costs" number in reports is misleading.

### 1.6 Dashboard Statistics

- **How it works:** `GET /api/reports/dashboard` returns `totalRevenue`, `totalReceived`, `totalPendingDues`, `customerCount`, `orderCount`, `orderStatuses` distribution, and `popularItems` (garment type frequency).
- **Files:**
  - `packages/server/src/index.ts` — `GET /api/reports/dashboard` (lines 2985–3044)
  - `packages/server/src/db.ts` — `getDashboardStats()` (lines 482–521)
- **Tables:** `orders`, `customers`
- **Status:** Complete — basic dashboard statistics for revenue, dues, and order counts.

### 1.7 Financial Reports

- **How it works:** `GET /api/reports/financials` returns all orders, inventory, and settings. The frontend (`FinancialReports.tsx`) computes: Total Sales, Payments In, Outstanding, Order Count, Profit (Revenue - Expenses), Profit Margin %, Payment Status Distribution (fully paid / partially paid / unpaid), Pipeline Financials (value/collected per stage), Customer Balances, and a Sales/Payments chart. Supports date filtering (Today, Week, Month, Year, Custom) and CSV export.
- **Files:**
  - `apps/desktop/ui/src/components/FinancialReports.tsx` — Full report UI (594 lines)
  - `packages/server/src/index.ts` — `GET /api/reports/financials` (lines 3046–3075)
  - `packages/server/src/db.ts` — `getFinancialReport()` (lines 523–559)
- **Tables:** `orders`, `inventory`, `customers`
- **Status:** Complete — comprehensive reporting on the frontend. However, the backend financial report endpoint (`/api/reports/financials`) returns raw data rather than computed aggregates (unlike the dashboard endpoint which does compute server-side).

### 1.8 Profit Calculation

- **How it works:** Calculated entirely on the frontend as `totalRevenue - totalExpenses`, where `totalExpenses = SUM(inventory.price * inventory.quantity)`. Profit margin = `(profit / totalRevenue) * 100`.
- **Files:**
  - `apps/desktop/ui/src/components/FinancialReports.tsx` — Lines 104–107
- **Tables:** Computed from `orders.total_amount` and `inventory.price * inventory.quantity`
- **Status:** **Flawed** — Uses inventory valuation as "expenses." Does not track actual cost of goods sold (COGS), labor costs, or operating expenses.

### 1.9 Customer Ledger (Per-Customer Outstanding)

- **How it works:** The Financial Reports page shows "Customer Balances" — aggregated totals per customer of bookings, payments, and outstanding amounts for the selected period. No dedicated customer ledger page exists; this is embedded in reports.
- **Files:**
  - `apps/desktop/ui/src/components/FinancialReports.tsx` — `customerInsights` computed (lines 141–160)
- **Tables:** Computed from `orders`
- **Status:** **Incomplete** — Shows current-period outstanding but doesn't provide a full customer ledger with running balance, transaction history, or statement generation.

### 1.10 Payment Status Distribution

- **How it works:** Orders are categorized as Fully Paid, Partially Paid, or Unpaid based on comparing `paid_amount` to `total_amount`. Displayed with counts and total values.
- **Files:**
  - `apps/desktop/ui/src/components/FinancialReports.tsx` — `paymentDistribution` (lines 181–192)
- **Tables:** Computed from `orders`
- **Status:** Complete — simple and effective.

### 1.11 Backup / Restore

- **How it works:** Owner can download a JSON backup of all data (profiles, customers, measurements, orders, shop_settings) and restore it later.
- **Files:**
  - `packages/server/src/index.ts` — `POST /api/backup`, `POST /api/restore`
  - `packages/server/src/db.ts` — `exportBackup()`, `importBackup()`
- **Tables:** All tables
- **Status:** Complete — full data backup/restore.

### 1.12 Data Import

- **How it works:** CSV/Excel import for customer data with measurement fields. Supports duplicate detection by name + phone.
- **Files:**
  - `apps/desktop/ui/src/components/DataImport.tsx`
  - `packages/server/src/index.ts` — `POST /api/import/customers`
- **Tables:** `customers`, `measurements`
- **Status:** Complete — customer data import only. No order or financial data import.

### 1.13 Currency Setting

- **How it works:** The shop settings include a `currency` field (default: "PKR"). Used for display throughout the app.
- **Files:**
  - `packages/server/src/index.ts` — `DEFAULT_SHOP_SETTINGS.currency = "PKR"`
  - `apps/desktop/ui/src/components/admin/ShopProfile.tsx` — Currency setting UI
  - `packages/shared/src/types.ts` — `ShopSettings.currency`
- **Tables:** `shop_settings`
- **Status:** Complete.

---

## 2. Existing Database Structure

### Tables Related to Accounting / Finance

| Table | Purpose | Key Financial Columns | Relationships |
|---|---|---|---|
| `orders` | Core order/booking record | `total_amount`, `paid_amount`, `discount_type`, `discount_value`, `discount_amount`, `final_total`, `delivered_at` | `customer_id → customers`, `created_by → auth.users` |
| `customers` | Customer records | (none directly financial, but linked to orders) | `id → orders.customer_id` |
| `inventory` | Material/stock items | `price` (REAL), `quantity` (INTEGER) | `created_by → auth.users` |
| `garment_types` | Garment catalog with pricing | `price` (REAL) | `shop_id → shops`, `created_by → auth.users` |
| `shop_settings` | Shop config including currency | `value` (JSONB — contains `currency`, `pipeline_stages`, etc.) | `user_id → auth.users`, `key` (prefixed with user ID) |
| `audit_logs` | Full audit trail | `action` (PAYMENT_RECEIVED, REFUND, etc.), `previous_value`, `new_value`, `details` | `user_id → auth.users`, `shop_id → shops` |
| `profiles` | User profiles with roles | (indirect — role determines financial permissions) | `id → auth.users`, `shop_id → shops`, `created_by → auth.users` |
| `subscriptions` | SaaS subscription tracking | `status`, `plan_id` | `user_id → auth.users` |

### Key Observations

- **No dedicated `payments` table** — Payment data lives entirely on the `orders` row as a single `paid_amount` scalar.
- **No `transactions` table** — Financial movements are not recorded as discrete transactions.
- **No `expenses` table** — The `inventory` table doubles as expense tracking, which is incorrect.
- **No `suppliers` table** — No vendor/supplier tracking.
- **No `tax` columns** — No sales tax, VAT, or GST tracking anywhere.
- **No `invoice` table** — No separate invoice records; the order serves as the invoice.
- **All monetary columns use `REAL` (floating point)** — This is a **data integrity risk**; `REAL` should be `INTEGER` (storing cents/paisa) or `NUMERIC`/`DECIMAL` for exact precision.

---

## 3. Current Financial Flow

### 3.1 Customer Places an Order

1. User selects or creates a customer.
2. User selects garment type, sets price, optionally modifies measurement/styling.
3. User optionally applies discount (fixed or percentage).
4. User enters an initial `paid_amount` (can be 0).
5. Frontend sends `POST /api/orders` with `customer_id`, `items[]`, `total_amount`, `discount_type`, `discount_value`, `discount_amount`, `final_total`, `paid_amount`.
6. Backend creates the order record, logs `CREATE_ORDER` audit event.
7. If `paid_amount > 0`, a `PAYMENT_RECEIVED` audit event is **not** logged here (only if payment is later edited).
8. **Money flow:** Initial payment is recorded but not tracked as a separate event.

### 3.2 Advance Payment Is Received (Separate from Delivery)

- **There is no separate "record payment" feature.** Payments can only be recorded in two ways:
  - At order creation (initial `paid_amount`).
  - By editing the order (`PUT /api/orders/:id`) to increase `paid_amount`.
  - At delivery (the payment dialog calls `PUT /api/orders/:id` which triggers the audit).
- **Impact:** To record a partial payment mid-production, the user must open the edit form, change `paid_amount`, and save. This is 4+ clicks and exposes all order fields.

### 3.3 Another Payment Is Received

1. User selects the order.
2. If Owner, clicks "Edit."
3. Changes the `paid_amount` field to the new running total.
4. Saves — backend computes `paymentDiff = newPaid - oldPaid`.
5. If `paymentDiff > 0`, logs `PAYMENT_RECEIVED` with the difference amount.
6. If `paymentDiff < 0`, logs `REFUND` with the absolute difference.
7. **Money flow:** The `paid_amount` field is updated in-place. No separate payment record is created. Old values are lost in the orders table (only preserved in audit logs).

### 3.4 Order Is Delivered

1. User clicks the advance button on the order.
2. Frontend checks if there's a remaining balance: `(final_total ?? total_amount) - paid_amount`.
3. If balance > 0, a payment dialog opens asking how much to collect now.
   - Option A: Collect full or partial amount → `PUT /api/orders/:id` updates `paid_amount`, then `PUT /api/orders/:id/status` sets status to "Delivered."
   - Option B: Skip payment → `PUT /api/orders/:id/status` sets status to "Delivered" without payment.
4. Backend sets `delivered_at = now()`.
5. Logs `DELIVERY_COMPLETED` + `UPDATE_ORDER_STATUS` audit events.
6. **Money flow:** Payment is incorporated into `paid_amount` before delivery is marked. If skipped, the balance remains as outstanding.

### 3.5 An Expense Is Added

- **There is no expense add flow.** The `inventory` table allows creating items with `name`, `quantity`, `price`. But there is no UI to record "I bought fabric for Rs. 5000 today."
- **Current behavior:** Inventory items represent stock. The total inventory value (`SUM(price * quantity)`) is displayed as "Material Costs" in Financial Reports.
- **Money flow:** No actual expense recording happens. The inventory number is not tied to cash outflow.

### 3.6 A Payment Is Edited / Deleted

- **Payments cannot be deleted — only overwritten.** Decreasing `paid_amount` logs a `REFUND` audit event.
- **Order deletion:** Requires Owner mode. `DELETE /api/orders/:id` removes the order entirely. No refund is automatically processed; the customer's balance simply disappears.
- **Money flow:** Editing creates an audit trail but no actual transaction reversal. Deleting an order destroys the financial record.

---

## 4. Missing Features

### Required for MVP

| Feature | Why Needed |
|---|---|
| **Dedicated Payments Table** | Currently `paid_amount` is a single scalar. No way to track installments, partial payments, or payment methods. |
| **Record Payment Action (non-edit)** | Currently must edit entire order to record a payment. Need a one-click "Record Payment" button. |
| **Expense Tracking (Real)** | Inventory valuation is not expense tracking. Need a proper expense recording system with date, category, amount, description. |
| **Profit = Revenue − COGS − Expenses** | Current profit calculation uses inventory value as expenses. Wrong. |
| **Payment Method Tracking** | No record of cash / card / bank transfer / digital payment. |
| **Customer Statement / Ledger** | Need a per-customer page showing all orders and payments with running balance. |
| **Due Date Reminders** | Currently no way to see which orders are overdue for payment. |

### Can Wait

| Feature | Notes |
|---|---|
| **Invoice Generation** | Receipt printing exists; invoices can wait for v2. |
| **Tax (GST/VAT) Tracking** | Not essential for small tailor shop MVP. |
| **Supplier / Vendor Management** | Useful but not MVP. |
| **Bank Reconciliation** | Overkill for MVP. |
| **Multi-currency** | Single currency (`currency` setting) is sufficient. |
| **Payroll / Salary** | Not currently implemented; can wait. |
| **Purchase Orders** | Not needed for MVP. |
| **Balance Sheet / P&L** | The MVP needs only basic profit calculation. |

---

## 5. Bugs or Weaknesses

### 5.1 `REAL` (Float) for Monetary Values

- **Location:** `schema.sql`, `packages/server/src/db.ts` — all `total_amount`, `paid_amount`, `discount_value`, `discount_amount`, `final_total`, `price` columns.
- **Issue:** Floating-point arithmetic causes rounding errors (e.g., 0.1 + 0.2 = 0.30000000000000004).
- **Fix:** Use `INTEGER` (store in cents/paisa) or `NUMERIC(10,2)`.

### 5.2 Profit Calculation Uses Inventory Value, Not Actual Expenses

- **Location:** `FinancialReports.tsx` lines 98–107.
- **Issue:** `totalExpenses = SUM(inventory.price * inventory.quantity)` values the entire stock as expenses. This overstates costs if inventory is not consumed and understates if no inventory is recorded.
- **Impact:** Profit number is meaningless.

### 5.3 No Payment Transaction History

- **Location:** The entire system.
- **Issue:** When `paid_amount` is overwritten, the old value is lost in the orders table. It lives only in audit logs, which are not designed for financial reconciliation.
- **Impact:** Cannot reconstruct payment history without parsing audit logs.

### 5.4 Duplicate Calculations (Frontend vs Backend)

- **Location:** `FinancialReports.tsx` vs `db.ts`.
- **Issue:** Outstanding, revenue, and pending amounts are calculated both in `getDashboardStats()` / `getFinancialReport()` (backend) and in the frontend `FinancialReports.tsx`. They may diverge if one is updated but not the other.

### 5.5 Auto-Archive Deletes Financial History from Active Reports

- **Location:** `packages/server/src/index.ts` lines 1326–1330 (local DB), 1361–1379 (Supabase).
- **Issue:** Delivered orders are auto-archived after `auto_archive_days`. Archived orders are filtered out from "Active" queries and from the financial report (which uses `filteredOrders` based on date range). If a user looks at last year's report, archived orders won't be fetched unless the date range includes them from the full dataset.
- **Impact:** Risk of incomplete financial history in reports.

### 5.6 No Server-Side Discount Validation

- **Location:** `packages/server/src/index.ts` — `POST /api/orders` and `PUT /api/orders/:id`.
- **Issue:** The backend does not validate that `discount_amount <= total_amount` or that `discount_type` is valid. Frontend applies `Math.min`, but a direct API call can bypass this.

### 5.7 No Validation of `paid_amount <= final_total`

- **Location:** `packages/server/src/index.ts` — Order creation/update.
- **Issue:** The backend accepts any `paid_amount` value. A user could accidentally set `paid_amount > order total`.

### 5.8 Deleted Orders Destroy Financial Records

- **Location:** `packages/server/src/index.ts` — `DELETE /api/orders/:id`.
- **Issue:** When an order is deleted, its financial data is gone. If payments were collected, there is no record of the money received.

### 5.9 Expense and Inventory Are Confused

- **Location:** The entire system treats inventory items as expenses.
- **Issue:** The concept of "cost of goods sold" is absent. Inventory items have no connection to orders or consumption.

### 5.10 No Refund Workflow

- **Location:** `packages/server/src/index.ts` — The `REFUND` audit action exists, but there's no UI or workflow for processing refunds. A refund can only happen by editing `paid_amount` downward.

---

## 6. Recommendations (MVP Only)

### What to Build First

1. **Payments Table + Record Payment UI**
   - Create a `payments` table with columns: `id`, `order_id`, `amount`, `method` (cash/card/bank/other), `reference`, `date`, `notes`, `created_by`.
   - Add a simple "Record Payment" button on the order detail page that opens a dialog: amount, method, date.
   - When a payment is recorded, update `orders.paid_amount = SUM(payments.amount)` and log `PAYMENT_RECEIVED`.
   - This immediately fixes the transaction history gap.

2. **Proper Expense Tracking**
   - Create an `expenses` table: `id`, `amount`, `category` (fabric, thread, labor, rent, utilities, other), `description`, `date`, `created_by`.
   - Add an "Expenses" section/page with add/list/edit/delete.
   - Update profit calculation: `Profit = Total_Collected - Total_Expenses`.
   - Remove the inventory-based "Material Costs" from profit calculation (or keep it as a separate inventory valuation metric).

3. **Customer Ledger Page**
   - Create a simple ledger view per customer showing: date, order #, description, debit (order amount), credit (payment), balance.
   - Display running balance.
   - Add a "Statement" button to view any customer's full financial history.

4. **Overdue Orders Dashboard**
   - Add a "Due Payments" view showing orders where `paid_amount < final_total`.
   - Sort by due date ascending.
   - Quick "Record Payment" action from this view.

5. **Change `REAL` to `INTEGER` (Cents/Paisa)**
   - Store all monetary values as integers (smallest currency unit).
   - Convert display values by dividing by 100.
   - This eliminates floating-point rounding errors.

### What Not to Build Yet

- Tax tracking (GST/VAT)
- Supplier management
- Bank reconciliation
- Payroll/salary
- Purchase orders
- Multi-currency
- Balance sheet / P&L reports (beyond basic Revenue - Expenses)
- Invoicing (receipt printing is sufficient)

---

## 7. Final Priority List

| # | Feature | Why Required | Complexity | Dependencies |
|---|---|---|---|---|
| 1 | **Payments Table + Record Payment UI** | Foundation for all payment tracking. Fixes transaction history gap. | **Medium** | Database migration |
| 2 | **Record Payment on Order Detail** | Currently need to edit entire order. One-click payment is critical. | **Low** | #1 |
| 3 | **Overdue / Due Payments View** | Tailors need to know who hasn't paid. High frequency need. | **Low** | None (can use existing `paid_amount` vs `final_total`) |
| 4 | **Expense Tracking Table + UI** | Current "Material Costs" is wrong. Need real expense tracking to compute true profit. | **Medium** | Database migration |
| 5 | **Fix Profit Calculation** | Use actual expenses instead of inventory valuation. | **Low** | #4 |
| 6 | **Customer Ledger / Statement** | Essential for customer follow-up and transparency. | **Medium** | #1 |
| 7 | **Change `REAL` to `INTEGER` for Money** | Eliminate floating-point errors. Important for correctness. | **High** | Database migration |
| 8 | **Server-Side Validation** | Validate `paid_amount <= final_total`, `discount_amount <= total_amount`, valid `discount_type`. | **Low** | None |
| 9 | **Payment Method Tracking** | Know whether customer paid cash, card, or bank transfer. | **Low** | #1 |

---

## Appendix: File Reference Index

| Area | Key Files |
|---|---|
| Database Schema (Supabase) | `schema.sql` |
| Database Layer (SQLite) | `packages/server/src/db.ts` |
| API Routes | `packages/server/src/index.ts` |
| Migrations | `packages/server/src/migrate.ts` |
| Shared Types | `packages/shared/src/types.ts` |
| Order UI + Payments | `apps/desktop/ui/src/components/OrdersSection.tsx` |
| Financial Reports | `apps/desktop/ui/src/components/FinancialReports.tsx` |
| Customer Management | `apps/desktop/ui/src/components/CustomersSection.tsx` |
| Owner Dashboard | `apps/desktop/ui/src/components/OwnerDashboard.tsx` |
| Shop Settings | `apps/desktop/ui/src/components/admin/ShopProfile.tsx` |
| Data Import | `apps/desktop/ui/src/components/DataImport.tsx` |
| Sync Engine | `packages/server/src/sync.ts` |
