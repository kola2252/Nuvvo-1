# PhonePe Payment Gateway Integration Plan & Architecture

Official PhonePe Payment Gateway (Standard Checkout PG v1) integration for Nuvvo Food Ordering Application.

---

### 1. Executive Summary & Architecture

This implementation provides an official, secure, server-side PhonePe Standard Checkout payment flow for Nuvvo. In strict compliance with security standards:
- **No Secrets in Frontend**: PhonePe Merchant ID, Salt Key, Salt Index, and Webhook secrets are strictly isolated on the server and never exposed in browser bundles, client responses, or Git.
- **Strict Server-Side Initiation**: Payment sessions are initiated only via authenticated server API `/api/payment/phonepe/initiate`.
- **Server-Verified Amounts**: The payable amount is calculated and verified directly from the persisted order record in Supabase / server memory. Client-supplied amounts are never accepted.
- **Server-to-Server (S2S) Verification**: Order payment status is never trusted from frontend redirect query parameters. True payment confirmation occurs only through PhonePe's official Check Status API (`/pg/v1/status/{merchantId}/{merchantTransactionId}`) and cryptographically signed webhooks.
- **Idempotency & Duplicate Prevention**: Order payments are protected against replay attacks and duplicate webhook deliveries.
- **Full Fallback & COD Preservation**: Cash on Delivery (COD) and Direct UPI QR remain fully operational and intact.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER CHECKOUT FLOW                          │
│                                                                        │
│  [ Customer Cart ] ──► [ Order Created (Pending) ]                     │
│                                  │                                     │
│                                  ▼                                     │
│            [ POST /api/payment/phonepe/initiate ]                      │
│            (Server fetches verified amount from Order)                 │
│                                  │                                     │
│                                  ▼                                     │
│      [ Compute SHA256 X-VERIFY: Base64 + /pg/v1/pay + SaltKey ]        │
│                                  │                                     │
│                                  ▼                                     │
│           [ POST https://api.phonepe.com/apis/.../pg/v1/pay ]          │
│                                  │                                     │
│                                  ▼                                     │
│       [ Redirect Customer to PhonePe Hosted Payment Page ]             │
│       (Customer pays via UPI App, Credit/Debit Card, NetBanking)       │
│                                  │                                     │
│         ┌────────────────────────┴────────────────────────┐            │
│         ▼                                                 ▼            │
│  [ Webhook Callback ]                             [ Browser Return ]   │
│  POST /api/payment/phonepe/callback               /api/payment/...     │
│  - Verify X-VERIFY signature                      - Verify Status API  │
│  - Query PhonePe Status API                       - Redirect to app    │
│  - Update Supabase order 'confirmed'              - /tracking page     │
│  - Trigger WhatsApp Confirmation                                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Required Vercel Environment Variables

To activate live PhonePe transactions in your Vercel deployment, configure the following variables in **Vercel Project Settings $\to$ Environment Variables**:

| Variable Name | Environment | Description & Sample Value |
| :--- | :--- | :--- |
| `PHONEPE_MERCHANT_ID` | Production / Preview | Your approved Merchant ID (e.g. `M22XXXXXXXX` or `PGTESTPAYUAT` for sandbox) |
| `PHONEPE_SALT_KEY` | Production / Preview | Salt Key provided by PhonePe Merchant Dashboard (e.g. `099eb0cd-02cf-4e2a-8aca-3e6c6aff0399`) |
| `PHONEPE_SALT_INDEX` | Production / Preview | Salt Index assigned to your key (typically `1`) |
| `PHONEPE_ENV` | Production | Set to `PRODUCTION` for live transactions, or `SANDBOX` for UAT testing |
| `APP_URL` | Production | Your public canonical URL (e.g. `https://your-domain.vercel.app`) |

> [!CAUTION]
> Never commit actual Salt Keys or Merchant Secret Keys to GitHub or frontend `.env` files. Enter them exclusively in the Vercel dashboard.

---

### 3. Manual PhonePe Merchant Dashboard Setup

Log into your **[PhonePe Merchant Dashboard](https://business.phonepe.com/)** and complete the following one-time configuration:

1. **Webhook / Callback URL**:
   - Navigate to **Developer Settings $\to$ Webhooks** (or S2S Callbacks).
   - Add your Webhook URL:
     `https://<your-vercel-domain>/api/payment/phonepe/callback`
   - Select event triggers: `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `PAYMENT_PENDING`.
2. **Redirect URL (Optional / Whitelisting)**:
   - Ensure your domain (`https://<your-vercel-domain>`) is listed under allowed redirect origins.
3. **API Keys / Salt Key**:
   - Generate or copy your Production `SALT_KEY` and `SALT_INDEX` from Developer Settings.

---

### 4. Implementation Details by Component

#### A. Backend & Server (`server.ts`, `src/utils/phonepe.ts`)
- **`src/utils/phonepe.ts`**:
  - Implements PhonePe PG v1 payload builder with Base64 encoding.
  - Implements official SHA-256 Checksum generation: `SHA256(data + saltKey) + "###" + saltIndex`.
  - Implements Check Status API client (`/pg/v1/status/{merchantId}/{merchantTransactionId}`).
  - Implements webhook checksum validation with timing-safe comparison.
- **`server.ts` API Routes**:
  - `GET /api/payment/phonepe/status`: Diagnostic endpoint reporting readiness without leaking secrets.
  - `POST /api/payment/phonepe/initiate`: Verifies order amount server-side and creates checkout session.
  - `POST /api/payment/phonepe/callback`: Server-to-server webhook handler with idempotency guard.
  - `POST / GET /api/payment/phonepe/redirect`: Safe browser return handler that queries the Check Status API before updating Supabase.
  - `GET /api/payment/phonepe/verify/:orderId`: Real-time status verification endpoint for frontend polling.

#### B. Frontend Customer Checkout (`src/components/PaymentMethodScreen.tsx`, `CartScreen.tsx`)
- **`PaymentMethodScreen.tsx`**:
  - Added dedicated **"PhonePe PG"** payment tab alongside Direct UPI and Cash on Delivery.
  - Displays official PhonePe styling with cards, netbanking, and UPI badges.
  - Non-blocking config detection: if merchant keys are not yet configured in Vercel, displays a clear, informative setup notice while preserving checkout functionality.
- **`CartScreen.tsx`**:
  - Automatically redirects customer browser to PhonePe checkout URL (`redirectUrl`) upon order creation.
  - Preserves COD and Direct UPI flows intact.
- **`TrackingScreen.tsx`**:
  - Added real-time "Verify with PhonePe" action button for customer order tracking.

#### C. Database Schema (`supabase_production_migration.sql`)
- Created `public.payment_transactions` table with indexes on `order_id` and `status` for audit logging and duplicate prevention.

#### D. Admin Console & Navigation Consolidation (`src/components/BottomNav.tsx`, `AdminPanel.tsx`)
- **Bottom Navigation (`BottomNav.tsx`)**:
  - Removed the redundant "Admin Settings" button from the main navigation bar.
  - Kept the single unified "Settings" (`id: 'account'`) tab, giving regular users and admins a clean entry point.
- **Unified Settings & Admin Console (`AdminPanel.tsx`)**:
  - Consolidated all administrative controls under a single tab: **"Settings & Admin ⚙️"** (`id: 'settings'`).
  - Integrated into this unified view:
    1. Master Admin Console Identity & Super Admin authorization card.
    2. Live Supabase Revenue & Order Count Dashboard Widget (D3 bar chart).
    3. Elevated Supabase Database & Server Diagnostics with on-demand connection testing.
    4. Cloud Integrations Health Card: Real-time diagnostics for WhatsApp Business Cloud API & PhonePe Payment Gateway.
    5. Payment Configuration & Cash on Delivery (COD) Manager with live toggle persisted to Supabase `app_settings`.
    6. Admin Operations & Quick Links to specialized modules (Dishes, PhonePe UPI Gateway, Promo Coupons, Franchise).
    7. Embedded Dishes & Catalog Management (`AdminCatalogManager`).

---

### 5. Verification & Test Results

- **`npm run lint` (`tsc --noEmit`)**: Clean — 0 errors.
- **`npm run build` (Vite & esbuild server compilation)**: Succeeded — production bundle generated cleanly.
- **Dev Server**: Running on port 3000.
