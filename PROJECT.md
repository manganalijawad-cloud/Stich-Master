# PROJECT.md — Hello Darzi

> **This document is the single source of truth for the Hello Darzi project.**
> It exists to keep humans and AI assistants aligned on what the product is, what stage it is in, and how it must be built. Read this document before planning or implementing any feature. When in doubt, this document wins.

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Current Development Stage](#2-current-development-stage)
3. [Authentication](#3-authentication)
4. [Offline-First Architecture](#4-offline-first-architecture)
5. [User Roles](#5-user-roles)
6. [Customer Management](#6-customer-management)
7. [Garment Configuration](#7-garment-configuration)
8. [Styling Configuration](#8-styling-configuration)
9. [Order Workflow](#9-order-workflow)
10. [Pipeline](#10-pipeline)
11. [UI/UX Guidelines](#11-uiux-guidelines)
12. [Performance](#12-performance)
13. [Security](#13-security)
14. [Code Quality](#14-code-quality)
15. [Development Rules](#15-development-rules)
16. [Ultimate Goal](#16-ultimate-goal)

---

## 1. Product Vision

Hello Darzi is a **desktop-first tailor shop management system**.

- The goal is to build the **simplest, fastest, and most reliable** software for real tailor shops.
- The application must be easy enough for **non-technical users** — shop owners and staff who may have little to no computer experience.
- Every decision must prioritize, in this order:
  1. **Simplicity** — the fewest steps to get work done.
  2. **Reliability** — the software must never lose data or behave unpredictably.
  3. **Consistency** — the same action should always behave the same way, everywhere.
  4. **Performance** — the app should feel instant.
- Adding unnecessary features is explicitly **not** a priority. Do not add functionality "because it might be useful" — only build what tailor shops actually need.

---

## 2. Current Development Stage

- We are currently building **Version 1 (MVP)**.
- All work must focus **only** on features required for V1.
- **Avoid feature creep.** If a feature is not required to make Hello Darzi usable and reliable for a real tailor shop today, it does not belong in V1.
- When a request or idea falls outside V1 scope, it should be noted for later rather than implemented now.

---

## 3. Authentication

- **Login only.** There is no self-service signup flow in the app.
- **No "Create Account"** option anywhere in the product.
- **No "Continue with Google"** or any other third-party OAuth sign-in.
- Authentication is handled entirely through **Supabase Authentication**.
- User accounts are managed **exclusively** through the Supabase Authentication Dashboard — not through any in-app admin UI.
- The developer (not the end user, not the app itself) is responsible for and able to:
  - Add new users.
  - Delete users.
  - Disable users.
  - Reset user passwords/credentials.
- All of the above happen in Supabase, outside the application.

---

## 4. Offline-First Architecture

Hello Darzi is an **offline-first** application. This is a core architectural constraint, not an optional feature.

- The desktop app **must work completely offline**, with zero degradation to core functionality.
- **All business data is stored locally first** (local database on the device).
- The app **automatically syncs with Supabase** whenever an internet connection becomes available.
- Sync happens **silently in the background** — no spinners blocking work, no interruption to the user's flow.
- **User data must never be lost**, regardless of connectivity state, app restarts, or sync failures.
- Users must **never** be required to manually trigger a sync. Sync is entirely automatic and invisible to the end user.

**Implication for development:** every new feature must be designed assuming the user may be fully offline at the moment they use it, and that any data written locally must eventually and reliably reach Supabase without user intervention.

---

## 5. User Roles

- Hello Darzi uses **one account per shop** — there is no multi-account/multi-seat model in V1.
- Within that single account, there are **two modes**:
  - **Manager** — the default, day-to-day operating mode.
  - **Owner/Admin** — elevated mode for sensitive settings and actions.
- **Manager Mode** has limited permissions and **must not** have access to:
  - Sensitive settings (e.g., configuration that affects the whole shop).
  - Dangerous or irreversible actions (e.g., deleting data, changing financial records after the fact).
- **Switching to Owner Mode requires re-entering the account password.** This is a deliberate, explicit action.
- **Owner Mode auto-expires:** if Owner Mode remains inactive for a period of time, the app must automatically switch back to Manager Mode without requiring user action.

**Implication for development:** every sensitive screen or action must check the current mode before allowing access, and this check must be enforced consistently, not just hidden in the UI (see [Security](#13-security)).

---

## 6. Customer Management

- Each customer record stores:
  - **Name**
  - **Mobile number**
  - **Address**
- Each customer **owns a set of reusable measurements**.
- Measurements are **attached to the customer profile** and persist across orders — they are entered once and reused for future orders unless updated.

---

## 7. Garment Configuration

- Garment types in Hello Darzi are **configurable**, not hardcoded.
- The existing garment configuration system **already works** — this is existing, functioning behavior.
- **Before changing anything** related to garment configuration, the backend implementation must be verified and understood first.
- Any change in this area must **preserve existing functionality**. Do not rewrite or restructure working garment configuration logic without a clear, verified need.

---

## 8. Styling Configuration

- Users can create **reusable styling options** (e.g., collar types, cuff styles, pocket styles — whatever styling attributes the shop defines).
- **Each garment item within an order can have its own, independent styling** — styling is per garment item, not per order.
- **Measurements are shared** from the customer's profile and are not duplicated per garment or per order.

---

## 9. Order Workflow

The complete order creation flow is as follows:

1. **Select or create customer**
   - Search for an existing customer, or create a new one inline if they don't exist yet.

2. **Add garment items**
   - An order can contain **multiple garments**.
   - For each garment item:
     - Select the **garment type**.
     - Enter the **fabric color**.
     - Select the **styling** for that specific garment.

3. **Finance step** (applies to the order as a whole)
   - **Base price** per garment.
   - **Discount** (if applicable).
   - **Total** (calculated from base prices and discount).
   - **Paid amount** (what the customer has paid so far).
   - **Remaining balance** (total minus paid amount).

4. **Printing step**
   - **Customer invoice** — for the customer, summarizing the order and financials.
   - **Worker measurement slip** — for the tailor/worker, containing garment details, styling, and measurements needed to produce the garment.

This flow must remain simple and linear — a shop employee should be able to complete it quickly without confusion.

---

## 10. Pipeline

- Every new order starts in the **"Getting Ready"** stage.
- Orders then move through **configurable pipeline stages** (the shop can define/adjust the stages that make sense for their workflow).
- **QR code scanning** is a first-class interaction:
  - Scanning an order's QR code should **open that order**.
  - From there, the user should be able to **move the order to its next pipeline stage**.
- The pipeline must **remain customizable** — do not hardcode a fixed set of stages into core logic.

---

## 11. UI/UX Guidelines

- Visual and interaction design is **inspired by Cursor** (the editor) — clean, focused, professional.
- **Color palette:** black, white, and neutral grays only. Avoid introducing arbitrary accent colors.
- Overall feel: **modern, minimal, clean.**
- **Typography must be highly readable** — clear hierarchy, comfortable sizing, no clutter.
- The app must be **fast and responsive** at all times; UI should never feel like it's "waiting" on the user.
- **No unnecessary animations.** Motion should only be used when it clarifies state changes, never for decoration.
- Every screen must be **understandable by someone with little to no computer experience** — this is a hard requirement, not a nice-to-have. If a screen requires explanation, it needs to be simplified.

---

## 12. Performance

Performance is a first-class product requirement, not an afterthought:

- **Fast startup** — the app should be usable within seconds of launch.
- **Fast search** — searching customers, orders, etc. must feel instant.
- **Fast navigation** — moving between screens must not introduce noticeable lag.
- **Efficient database queries** — avoid unnecessary queries, N+1 patterns, or scanning large datasets when indexed lookups will do.
- **Low memory usage** — the app should be lightweight enough to run comfortably on modest shop hardware.

---

## 13. Security

- **Never expose secrets** (API keys, service credentials, tokens) in client-accessible code or logs.
- **Protect Owner-only functionality** at every layer, not just in the UI.
- **Validate permissions properly** — every sensitive operation must check the current role/mode before executing.
- **Never rely only on frontend authorization.** Any check that determines access to sensitive data or actions must also be enforced server-side/in the data layer. The frontend can hide UI for convenience, but it must never be the only gatekeeper.

---

## 14. Code Quality

- **Clean architecture** — clear separation of concerns between UI, business logic, and data access.
- **Modular components** — features should be composed of small, focused, reusable pieces.
- **Reusable code** — avoid one-off implementations when a shared utility or component would serve better.
- **Type safety** — leverage TypeScript fully; avoid `any` and untyped boundaries where avoidable.
- **Readable code** — code should be easy to follow without excessive comments explaining "what" (the code should be self-explanatory); comments should explain "why" when the reasoning isn't obvious.
- **Avoid duplicate logic** — if the same logic appears in multiple places, it should be extracted and shared.
- **Preserve existing functionality before adding new features** — working behavior must not regress as a side effect of new work.

---

## 15. Development Rules

Before implementing **any** feature or change, the AI assistant (or developer) must:

1. **Understand the request** — clarify scope and intent before writing code.
2. **Understand the existing implementation** — read and comprehend the relevant existing code before modifying it.
3. **Reuse existing code where possible** — prefer extending or composing existing utilities, components, and patterns over writing new ones.
4. **Avoid unnecessary rewrites** — do not refactor or restructure working code unless it is required to complete the task.
5. **Preserve backward compatibility** — existing data, workflows, and behavior must continue to work.
6. **Keep UI consistent** — new screens and components must match the established look, feel, and interaction patterns (see [UI/UX Guidelines](#11-uiux-guidelines)).
7. **Build only what V1 requires** — resist the urge to add scope beyond the current stage (see [Current Development Stage](#2-current-development-stage)).
8. **Consider offline-first behavior in every feature** — assume the user may be offline; ensure local-first storage and background sync are respected (see [Offline-First Architecture](#4-offline-first-architecture)).
9. **Think before coding** — plan the approach, consider edge cases and trade-offs, and confirm the plan makes sense before writing implementation code.

---

## 16. Ultimate Goal

Hello Darzi should become **the easiest tailor shop management software to learn** and **the most reliable to use** — helping real tailoring businesses work faster, with fewer mistakes, every single day.
