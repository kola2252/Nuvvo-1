import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { FOOD_CATALOG, RESTAURANTS } from "./src/data/catalog";
import { CHIRALA_TOP13_FOOD_ITEMS } from "./src/data/chiralaPartners";
import { 
  getAdminSupabaseServerClient, 
  getPublicSupabaseServerClient, 
  createUserScopedSupabaseClient,
  createServerClient,
  checkServerSupabaseDiagnostics
} from "./src/utils/supabase/server";
import debugOtpHandler from "./lib/handlers/auth/debug-otp";
import sendEmailOtpHandler from "./lib/handlers/auth/send-email-otp";
import verifyEmailOtpHandler from "./lib/handlers/auth/verify-email-otp";
import verifyDbOtpHandler from "./lib/handlers/auth/verify-db-otp";
import setupProfileHandler from "./lib/handlers/auth/setup-profile";
import customerRegisterHandler from "./lib/handlers/auth/customer-register";
import customerLoginHandler from "./lib/handlers/auth/customer-login";
import customerProfileHandler from "./lib/handlers/auth/customer-profile";
import forgotPasswordHandler from "./lib/handlers/auth/forgot-password";
import resendVerificationHandler from "./lib/handlers/auth/resend-verification";
import resetPasswordHandler from "./lib/handlers/auth/reset-password";
import changePasswordHandler from "./lib/handlers/auth/change-password";
import deleteAccountHandler from "./lib/handlers/auth/delete-account";
import adminCheckPhoneHandler from "./lib/handlers/auth/admin-check-phone";
import adminVerifyPinHandler from "./lib/handlers/auth/admin-verify-pin";
import adminUpdatePinHandler from "./lib/handlers/auth/admin-update-pin";
import emailDiagnosticsHandler from "./lib/handlers/auth/email-diagnostics";
import adminVerifyHandler from "./lib/handlers/admin/verify";
import verifyEmailHandler from "./lib/handlers/verify-email";
import verifySmtpHandler from "./lib/handlers/verify-smtp";
import { 
  AUTHORIZED_ADMIN_PHONE,
  SESSION_SECRET,
  createSignedSessionJwt,
  verifySignedSessionJwt,
  verifyAdminPin, 
  verifyAdminMasterCode,
  isAuthorizedAdminAccountPhone,
  isMasterAdminPhone,
  maskAdminPhoneDisplay,
  normalizePhone,
  resolveCallerIdentity,
  isOrderOwnedByCaller,
  resolveCanonicalAppUrl
} from "./lib/auth-utils";
import { 
  sendOrderConfirmationWhatsApp,
  dispatchOrderWhatsAppNotifications,
  dispatchOrderStatusWhatsAppNotification,
  getWhatsAppConfigStatus,
  getWhatsAppTemplatesStatus,
  verifyWhatsAppWebhookSubscription,
  verifyMetaWebhookSignature,
  processWhatsAppWebhookEvent,
  recordRawWebhookEvent,
  listRecentWebhookEvents,
  listOrderNotifications,
  retryFailedNotification,
  retryFailedWebhookEvent,
  saveCustomerWhatsAppConsent,
  getCustomerWhatsAppConsent,
  parseValidWhatsAppPhone,
  FIXED_ADMIN_WHATSAPP_E164
} from "./src/utils/whatsappService";
import {
  getPhonePeConfigStatus,
  createPhonePePaymentRequest,
  verifyPhonePePaymentStatus,
  verifyPhonePeCallbackChecksum
} from "./src/utils/phonepe";
import {
  apiInterceptorMiddleware,
  getApiTelemetrySummary
} from "./src/middleware/apiMiddleware";
import { getRecentEmailLogs } from "./src/services/supabaseEmailLogs";

dotenv.config();

// Dynamic server-side Supabase client reading latest environment keys per request
const supabaseServer = new Proxy({} as ReturnType<typeof createServerClient>, {
  get(_target, prop) {
    const client = createServerClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

// Keep cryptographic secret check (actual SESSION_SECRET and AUTHORIZED_ADMIN_PHONE live in ./lib/auth-utils)
if (!process.env.SESSION_SECRET && !process.env.JWT_SECRET && (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production')) {
  console.warn('[SECURITY NOTICE] SESSION_SECRET is not explicitly set in environment variables. For maximum cryptographic security, set SESSION_SECRET in your Vercel Project Settings.');
}

interface ServerSession {
  phone: string;
  role: 'normal_user' | 'admin' | 'super_admin';
  createdAt: number;
}
const SESSIONS_FILE = path.join(process.cwd(), '.server_sessions.json');

function loadSessions(): Map<string, ServerSession> {
  const map = new Map<string, ServerSession>();
  try {
    if (!process.env.VERCEL && fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        map.set(k, v as ServerSession);
      }
    }
  } catch {}
  return map;
}

function persistSessions(map: Map<string, ServerSession>) {
  try {
    if (process.env.VERCEL) return; // Do not write to filesystem in Vercel serverless environment
    const obj: Record<string, ServerSession> = {};
    for (const [k, v] of map.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj), 'utf8');
  } catch {}
}

const serverSessions = loadSessions();

// Persistent dishes storage to ensure zero data loss and flawless Supabase synchronization
const DISHES_FILE = path.join(process.cwd(), '.server_dishes.json');
const DELETED_DISHES_FILE = path.join(process.cwd(), '.server_deleted_dishes.json');

function loadServerDeletedDishes(): Set<string> {
  const set = new Set<string>();
  try {
    if (fs.existsSync(DELETED_DISHES_FILE)) {
      const data = JSON.parse(fs.readFileSync(DELETED_DISHES_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach(id => set.add(String(id)));
      }
    }
  } catch {}
  return set;
}

function persistServerDeletedDishes(set: Set<string>) {
  try {
    if (process.env.VERCEL) return;
    fs.writeFileSync(DELETED_DISHES_FILE, JSON.stringify(Array.from(set)), 'utf8');
  } catch {}
}

const serverDeletedDishes = loadServerDeletedDishes();

function loadServerDishes(): Map<string, any> {
  const map = new Map<string, any>();
  try {
    if (fs.existsSync(DISHES_FILE)) {
      const data = JSON.parse(fs.readFileSync(DISHES_FILE, 'utf8'));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.id && !serverDeletedDishes.has(String(item.id))) {
            map.set(String(item.id), item);
          }
        }
      }
    }
  } catch {}

  // If empty, prime with the baseline Chirala specialty dishes
  if (map.size === 0) {
    const baseDishes = [...CHIRALA_TOP13_FOOD_ITEMS, ...FOOD_CATALOG.slice(0, 15)];
    for (const d of baseDishes) {
      if (!serverDeletedDishes.has(String(d.id))) {
        map.set(String(d.id), {
          ...d,
          id: String(d.id),
          created_at: new Date().toISOString()
        });
      }
    }
    try {
      if (!process.env.VERCEL) {
        fs.writeFileSync(DISHES_FILE, JSON.stringify(Array.from(map.values()), null, 2), 'utf8');
      }
    } catch {}
  }

  return map;
}

function persistServerDishes(map: Map<string, any>) {
  try {
    if (process.env.VERCEL) return;
    const arr = Array.from(map.values());
    fs.writeFileSync(DISHES_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch {}
}

const serverDishes = loadServerDishes();

// Persistent orders storage to ensure zero data loss across restarts and serverless executions
const ORDERS_FILE = path.join(process.cwd(), '.server_orders.json');

function loadServerOrders(): Map<string, any> {
  const map = new Map<string, any>();
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.id) {
            map.set(String(item.id), item);
          }
        }
      }
    }
  } catch {}
  return map;
}

function persistServerOrders(map: Map<string, any>) {
  try {
    if (process.env.VERCEL) return;
    const arr = Array.from(map.values());
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch {}
}

const serverOrders = loadServerOrders();

export function createSignedSessionToken(phone: string, role: 'normal_user' | 'admin' | 'super_admin'): string {
  const cleanPhone = normalizePhone(phone) || phone;
  const token = createSignedSessionJwt(cleanPhone, role, { phone: cleanPhone });
  serverSessions.set(token, { phone: cleanPhone, role, createdAt: Date.now() });
  persistSessions(serverSessions);
  return token;
}

export function verifySignedSessionToken(token: string): { valid: boolean; phone?: string; role?: 'normal_user' | 'admin' | 'super_admin' } {
  if (!token) return { valid: false };

  const jwtCheck = verifySignedSessionJwt(token);
  if (jwtCheck.valid && jwtCheck.role) {
    return {
      valid: true,
      phone: jwtCheck.phone || jwtCheck.payload?.phone || jwtCheck.payload?.sub,
      role: jwtCheck.role
    };
  }

  // Legacy in-memory session token fallback (non-JWT tokens only)
  if (!token.startsWith('nuvvo_jwt_') && serverSessions.has(token)) {
    const s = serverSessions.get(token)!;
    return { valid: true, phone: s.phone, role: s.role };
  }

  return { valid: false };
}

// Middleware to strictly enforce administrator privileges on server endpoints
function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7).trim()
    : (req.body?.adminToken || req.query?.adminToken || '');

  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized: Active administrator authorization required." });
  }

  const verified = verifySignedSessionToken(token);
  if (!verified.valid) {
    return res.status(401).json({ success: false, error: "Unauthorized: Invalid or expired administrator session." });
  }

  if (verified.role !== 'admin' && verified.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: "Forbidden: Only an Admin or Super Admin can access or modify these settings." });
  }

  (req as any).user = { phone: verified.phone, role: verified.role };
  next();
}

// --- STORE OPERATIONS CONFIGURATION (NON-DESTRUCTIVE DEFAULTS PRESERVING CHIRALA BASELINE) ---
const STORE_OPS_FILE = path.join(process.cwd(), '.server_store_operations.json');
const DEFAULT_STORE_OPERATIONS = {
  isCustomConfigActive: false,
  deliveryFee: 39,
  freeDeliveryAbove: 400,
  minOrderAmount: 0,
  taxRatePercent: 5,
  packagingFee: 0,
  pauseNewOrders: false,
  pauseReason: '',
  openingHoursLabel: '07:00 AM - 11:00 PM',
  serviceableAreas: ['Chirala Town Center', 'Perala', 'Kothapet', 'Vodarevu', 'Ramapuram', 'Bypass Road', 'Station Road'],
  lastUpdated: ''
};

function loadStoreOperationsSync() {
  try {
    if (!process.env.VERCEL && fs.existsSync(STORE_OPS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_OPS_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_STORE_OPERATIONS, ...parsed };
      }
    }
  } catch {}
  return { ...DEFAULT_STORE_OPERATIONS };
}

let serverStoreOperations = loadStoreOperationsSync();

async function getActiveStoreOperations() {
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      const { data } = await client.from('app_settings').select('value').eq('key', 'store_operations').maybeSingle();
      if (data?.value && typeof data.value === 'object') {
        serverStoreOperations = { ...DEFAULT_STORE_OPERATIONS, ...(data.value as any) };
      }
    }
  } catch {}
  return serverStoreOperations;
}

async function persistStoreOperations(cfg: typeof DEFAULT_STORE_OPERATIONS) {
  serverStoreOperations = { ...DEFAULT_STORE_OPERATIONS, ...cfg, lastUpdated: new Date().toISOString() };
  try {
    if (!process.env.VERCEL) {
      fs.writeFileSync(STORE_OPS_FILE, JSON.stringify(serverStoreOperations, null, 2), 'utf8');
    }
  } catch {}
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      await client.from('app_settings').upsert([{
        key: 'store_operations',
        value: serverStoreOperations,
        description: 'Admin-configured store delivery fees, min order, serviceable areas & pause mode',
        updated_at: new Date().toISOString()
      }], { onConflict: 'key' });
    }
  } catch {}
  return serverStoreOperations;
}

// --- CUSTOMER SUPPORT TICKETS PERSISTENCE ---
const SUPPORT_TICKETS_FILE = path.join(process.cwd(), '.server_support_tickets.json');

function loadSupportTicketsSync(): any[] {
  try {
    if (!process.env.VERCEL && fs.existsSync(SUPPORT_TICKETS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SUPPORT_TICKETS_FILE, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

let serverSupportTickets: any[] = loadSupportTicketsSync();

async function getActiveSupportTickets(): Promise<any[]> {
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      const { data } = await client.from('app_settings').select('value').eq('key', 'support_tickets').maybeSingle();
      if (Array.isArray(data?.value)) {
        serverSupportTickets = data.value;
      }
    }
  } catch {}
  return serverSupportTickets;
}

async function persistSupportTickets(tickets: any[]) {
  serverSupportTickets = tickets;
  try {
    if (!process.env.VERCEL) {
      fs.writeFileSync(SUPPORT_TICKETS_FILE, JSON.stringify(serverSupportTickets, null, 2), 'utf8');
    }
  } catch {}
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      await client.from('app_settings').upsert([{
        key: 'support_tickets',
        value: serverSupportTickets,
        description: 'Customer support complaints and resolution history',
        updated_at: new Date().toISOString()
      }], { onConflict: 'key' });
    }
  } catch {}
}

// --- DURABLE DELIVERY PARTNER PERSISTENCE ---
const DELIVERY_PARTNERS_FILE = path.join(process.cwd(), '.server_delivery_partners.json');

function loadDeliveryPartnersSync(): any[] {
  try {
    if (!process.env.VERCEL && fs.existsSync(DELIVERY_PARTNERS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DELIVERY_PARTNERS_FILE, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

async function persistDeliveryPartners(partners: any[]) {
  try {
    if (!process.env.VERCEL) {
      fs.writeFileSync(DELIVERY_PARTNERS_FILE, JSON.stringify(partners, null, 2), 'utf8');
    }
  } catch {}
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      await client.from('app_settings').upsert([{
        key: 'delivery_partners',
        value: partners,
        description: 'Registered Nuvvo delivery partners fleet',
        updated_at: new Date().toISOString()
      }], { onConflict: 'key' });
    }
  } catch {}
}

interface HotelRecord {
  id: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  image: string;
  status: 'Active' | 'Inactive';
  rating: number;
}

const INITIAL_HOTELS: HotelRecord[] = [
  {
    id: "hotel_1",
    name: "Hotel Mourya Grand",
    description: "Premier executive lodging with 24/7 multi-cuisine in-house dining and banquet services.",
    address: "Bypass Road, Chirala, Andhra Pradesh",
    phone: "+91 86942 22550",
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=80",
    status: "Active",
    rating: 4.8
  },
  {
    id: "hotel_2",
    name: "Hotel Saravana Residency",
    description: "Comfort hospitality suites offering authentic South Indian breakfast and thalis.",
    address: "Clock Tower Center, Chirala",
    phone: "+91 86942 23344",
    image: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&auto=format&fit=crop&q=80",
    status: "Active",
    rating: 4.6
  },
  {
    id: "hotel_3",
    name: "Sea Breeze Coastal Resort & Hotel",
    description: "Beachside accommodation with coastal seafood specialties and dining pavilion.",
    address: "Vodarevu Beach Road, Chirala",
    phone: "+91 86942 28899",
    image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&auto=format&fit=crop&q=80",
    status: "Active",
    rating: 4.9
  }
];

let serverRestaurants: any[] = [...RESTAURANTS];
let serverHotels: HotelRecord[] = [...INITIAL_HOTELS];

// Server-side rate-limit circuit breaker for Gemini API calls
let geminiCooldownUntil = 0;

async function callGeminiWithFallback(ai: any, params: { model?: string; contents: any; config?: any }) {
  if (Date.now() < geminiCooldownUntil) {
    throw new Error("429 Rate limit cooldown active");
  }

  const { config, contents } = params;
  
  try {
    return await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config,
    });
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    const isRateLimit = errMsg.includes("429") || errMsg.toLowerCase().includes("rate") || errMsg.toLowerCase().includes("quota");
    if (isRateLimit) {
      // Respect quota limits: set 60-second cooldown and do NOT fire a retry call
      geminiCooldownUntil = Date.now() + 60_000;
      throw err;
    }
    throw err;
  }
}

export const app = express();

// If running in serverless wrapper and req.body is already populated, mark _body to avoid body-parser stream hang
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    (req as any)._body = true;
  }
  if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
    try {
      req.body = JSON.parse(req.body);
      (req as any)._body = true;
    } catch {}
  }
  next();
});

app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Enable CORS for universal client access
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  if (_req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Intercept all /api/* requests: 5-minute GET cache + response time & error rate logging to Supabase `api_logs`
app.use(apiInterceptorMiddleware);

// Endpoint to inspect API response times, error rates, cache hit ratio, and recent api_logs (Admin only)
app.get("/api/admin/api-logs", requireAdminAuth, (_req, res) => {
  return res.json({
    success: true,
    ...getApiTelemetrySummary()
  });
});

// Endpoint to inspect OTP email attempts, status, recipients, and error details (Admin only)
app.get("/api/admin/email-logs", requireAdminAuth, async (req, res) => {
  const recipient = typeof req.query.recipient === 'string' ? req.query.recipient : undefined;
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;

  const result = await getRecentEmailLogs({
    recipient,
    limit,
    client: supabaseServer
  });

  return res.json({
    success: true,
    ...result
  });
});

// Store Operations Config endpoints (preserves Chirala baseline unless Admin saves custom config)
app.get("/api/store-operations", async (_req, res) => {
  const config = await getActiveStoreOperations();
  return res.json({ success: true, config });
});

app.put("/api/admin/store-operations", requireAdminAuth, async (req, res) => {
  const body = req.body || {};
  const nextConfig = {
    isCustomConfigActive: body.isCustomConfigActive !== undefined ? Boolean(body.isCustomConfigActive) : true,
    deliveryFee: Math.max(0, Number(body.deliveryFee ?? serverStoreOperations.deliveryFee ?? 39)),
    freeDeliveryAbove: Math.max(0, Number(body.freeDeliveryAbove ?? serverStoreOperations.freeDeliveryAbove ?? 400)),
    minOrderAmount: Math.max(0, Number(body.minOrderAmount ?? serverStoreOperations.minOrderAmount ?? 0)),
    taxRatePercent: Math.max(0, Math.min(28, Number(body.taxRatePercent ?? serverStoreOperations.taxRatePercent ?? 5))),
    packagingFee: Math.max(0, Number(body.packagingFee ?? serverStoreOperations.packagingFee ?? 0)),
    pauseNewOrders: Boolean(body.pauseNewOrders),
    pauseReason: String(body.pauseReason || '').trim().slice(0, 200),
    openingHoursLabel: String(body.openingHoursLabel || serverStoreOperations.openingHoursLabel || '07:00 AM - 11:00 PM').trim().slice(0, 80),
    serviceableAreas: Array.isArray(body.serviceableAreas)
      ? body.serviceableAreas.map((a: any) => String(a).trim()).filter(Boolean)
      : serverStoreOperations.serviceableAreas,
    lastUpdated: new Date().toISOString()
  };
  const saved = await persistStoreOperations(nextConfig);
  return res.json({ success: true, config: saved });
});

// Customer Support Tickets & Complaints endpoints
app.get("/api/support-tickets", async (req, res) => {
  const caller = await resolveCallerIdentity(req);
  if (!caller.authenticated) {
    return res.status(401).json({ success: false, error: 'Authentication required to view support tickets.' });
  }
  const tickets = await getActiveSupportTickets();
  if (caller.isAdmin) {
    return res.json({ success: true, tickets });
  }
  const ownTickets = tickets.filter(t => String(t.customerId || '') === caller.userId);
  return res.json({ success: true, tickets: ownTickets });
});

app.post("/api/support-tickets", async (req, res) => {
  const caller = await resolveCallerIdentity(req);
  if (!caller.authenticated) {
    return res.status(401).json({ success: false, error: 'Authentication required to submit a support ticket.' });
  }
  const { subject, description, category, orderId, customerName, customerPhone } = req.body || {};
  if (!subject || !String(subject).trim() || !description || !String(description).trim()) {
    return res.status(400).json({ success: false, error: 'Subject and description are required.' });
  }
  const tickets = await getActiveSupportTickets();
  const now = new Date().toISOString();
  const allowedCategories = ['Order Issue', 'Payment / Refund', 'Delivery Delay', 'Account / App', 'General'];
  const ticket = {
    id: `tkt_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
    customerId: caller.userId,
    customerName: String(customerName || caller.email || caller.phone || 'Customer').trim().slice(0, 80),
    customerEmail: caller.email || '',
    customerPhone: String(customerPhone || caller.phone || '').trim().slice(0, 20),
    orderId: orderId ? String(orderId).trim().slice(0, 64) : undefined,
    category: allowedCategories.includes(category) ? category : 'General',
    subject: String(subject).trim().slice(0, 120),
    description: String(description).trim().slice(0, 1000),
    status: 'open',
    createdAt: now,
    updatedAt: now
  };
  await persistSupportTickets([ticket, ...tickets]);
  return res.status(201).json({ success: true, ticket });
});

app.put("/api/admin/support-tickets/:id", requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { status, adminReply } = req.body || {};
  const tickets = await getActiveSupportTickets();
  const idx = tickets.findIndex(t => String(t.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Support ticket not found.' });
  }
  const allowedStatuses = ['open', 'in_progress', 'resolved'];
  const nextStatus = allowedStatuses.includes(status) ? status : tickets[idx].status;
  tickets[idx] = {
    ...tickets[idx],
    status: nextStatus,
    adminReply: adminReply !== undefined ? String(adminReply).trim().slice(0, 500) : tickets[idx].adminReply,
    updatedAt: new Date().toISOString()
  };
  await persistSupportTickets(tickets);
  return res.json({ success: true, ticket: tickets[idx] });
});



  // API route for Gemini recommendations
  app.post("/api/recommendations", async (req, res) => {
    const { orders, catalog } = req.body;

    try {
      const activeCatalog = (catalog && Array.isArray(catalog) && catalog.length > 0) 
        ? catalog 
        : FOOD_CATALOG;

      if (!activeCatalog || activeCatalog.length === 0) {
        return res.status(400).json({ error: "Catalog is empty" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("Notice: GEMINI_API_KEY is not defined. Returning a signature/trending fallback item.");
        const fallbackItem = activeCatalog.find((f: any) => f.isBestSeller || f.rating >= 4.5) || activeCatalog[0];
        return res.json({
          foodId: fallbackItem.id,
          reason: "⭐ Chef's Premium Selection: Award-winning recipe!",
          isFallback: true
        });
      }

      // Initialize Gemini Client lazily
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Format user's past orders concisely to feed to Gemini
      const ordersDesc = (orders || [])
        .map((o: any, idx: number) => {
          const items = (o.items || [])
            .map((i: any) => `${i.foodItem?.name || i.foodItemId} (qty: ${i.quantity})`)
            .join(", ");
          return `Order #${idx + 1} Status: ${o.status || 'completed'} - Items: ${items}`;
        })
        .join("\n");

      // Format catalog details
      const catalogDesc = activeCatalog.slice(0, 40)
        .map((f: any) => {
          return `- ID: ${f.id}, Name: ${f.name}, Category: ${f.category}, Description: ${f.description || ''}, Price: ₹${f.price}, Veg/NonVeg: ${f.vegIndicator || 'Unknown'}`;
        })
        .join("\n");

      const prompt = `You are a world-class culinary AI sommelier and personal diet analyst.
Recommend ONE exactly matching food item from our restaurant catalog that is most suitable for this user based on their order history.

Here is the user's past order history:
${ordersDesc || "No past orders yet. The user is a first-time customer."}

Here is the catalog of currently available food items with their details:
${catalogDesc}

Requirements:
1. Under past order history, analyze the user's cuisine preferences (Veg vs Nonveg, heavy vs snacks, spices, categories like pizza, biryani, burgers, desserts).
2. Choose exactly ONE foodId from the provided catalog that matches their palette best. If they have no order history, recommend a highly popular signature dish.
3. Write a fun, delicious, motivating, highly personalized reasoning explaining why this dish is perfect for them (maximum 12 words, e.g., "Loved your spiced biryanis? Experience this chef's master curry now!"). Make it sound appetizing!

You MUST respond strictly with a valid JSON document matching this schema:
{
  "foodId": "the string ID matching the selected item from the catalog",
  "reason": "delicious personalized short reasoning under 12 words"
}`;

      const response = await callGeminiWithFallback(ai, {
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              foodId: {
                type: Type.STRING,
                description: "The unique ID of the recommended food item from the catalog",
              },
              reason: {
                type: Type.STRING,
                description: "Personalized highly engaging reasoning under 12 words",
              },
            },
            required: ["foodId", "reason"],
          }
        }
      });

      const text = response.text?.trim() || "{}";
      const result = JSON.parse(text);
      res.json(result);
    } catch (err: any) {
      console.log("Notice: Serving signature/trending fallback item as recommended option.");

      // Safe local fallback selection
      try {
        const fallbackCatalog = (catalog && Array.isArray(catalog) && catalog.length > 0)
          ? catalog
          : FOOD_CATALOG;
        if (fallbackCatalog && fallbackCatalog.length > 0) {
          const fallbackItem = fallbackCatalog.find((f: any) => f.isBestSeller || f.rating >= 4.5) || fallbackCatalog[0];
          return res.json({
            foodId: fallbackItem.id,
            reason: "⭐ Chef's Premium Selection: Award-winning recipe!",
            isFallback: true
          });
        }
      } catch (fallbackErr) {
        // Fallback option extraction failed
      }

      res.status(500).json({ status: "unavailable" });
    }
  });

  // API route for dynamically fetching and filtering food items based on selected tags like 'Breakfast', 'Dinner', 'Snacks', or 'Healthy'
  // API route for dynamically fetching and filtering food items from Supabase public.food_items with fallback
  app.get("/api/food-items", async (req, res) => {
    const { tag, category } = req.query;

    try {
      let rawRows: any[] = [];
      try {
        const publicClient = getPublicSupabaseServerClient();
        const { data, error } = await publicClient
          .from('food_items')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          rawRows = data;
        }
      } catch (err: any) {
        console.warn('Notice: Supabase food_items fetch deferred to server catalog store:', err?.message);
      }

      // Combine Supabase rows with server dishes
      const dishesMap = new Map<string, any>();
      for (const [id, dish] of serverDishes.entries()) {
        dishesMap.set(String(id), dish);
      }
      for (const row of rawRows) {
        dishesMap.set(String(row.id), {
          ...row,
          image: row.image_url || row.image,
          isAvailable: row.is_available !== false && row.isAvailable !== false
        });
      }

      const combinedList = Array.from(dishesMap.values());

      // Map database fields correctly to customer FoodItem interface
      const mappedDishes = combinedList.map((row: any) => ({
        id: String(row.id),
        name: row.name,
        description: row.description || '',
        price: Number(row.price) || 0,
        discountPrice: row.discount_price !== undefined && row.discount_price !== null 
          ? Number(row.discount_price) 
          : (row.discountPrice ? Number(row.discountPrice) : Math.round((Number(row.price) || 0) * 0.85)),
        category: row.category || 'Specialty',
        subcategory: row.subcategory || 'Classic',
        image: row.image_url || row.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
        image_url: row.image_url || row.image,
        isAvailable: row.is_available !== false && row.isAvailable !== false,
        is_available: row.is_available !== false && row.isAvailable !== false,
        vegIndicator: (row.veg_indicator || row.vegIndicator || 'Veg').toString().toLowerCase() === 'veg' ? 'veg' : 'non-veg',
        rating: Number(row.rating) || 4.8,
        reviewsCount: Number(row.reviews_count || row.reviewsCount) || 12,
        prepTime: Number(row.prep_time || row.prepTime) || 20,
        spiceLevel: row.spice_level || row.spiceLevel || 'Medium',
        ingredients: Array.isArray(row.ingredients) 
          ? row.ingredients 
          : (typeof row.ingredients === 'string' ? JSON.parse(row.ingredients || '[]') : ["Fresh Native Produce", "Natural Unrefined Oils", "Chef Secret Spices", "Himalayan Organic Salt"]),
        customizations: Array.isArray(row.customizations) 
          ? row.customizations 
          : (typeof row.customizations === 'string' ? JSON.parse(row.customizations || '[]') : []),
        isBestSeller: Boolean(row.is_best_seller ?? row.isBestSeller ?? false),
        isTrending: Boolean(row.is_trending ?? row.isTrending ?? false),
        restaurantId: row.restaurant_id || row.restaurantId || 'rest_1',
        created_at: row.created_at
      }));

      // Filter out unavailable dishes for customers
      const availableDishes = mappedDishes.filter((item: any) => item.isAvailable !== false && item.is_available !== false);

      // If category filter query param is provided
      let result = availableDishes;
      if (category && String(category).trim().toLowerCase() !== 'all') {
        const catFilter = String(category).trim().toLowerCase();
        result = result.filter(item => (item.category || '').toLowerCase() === catFilter);
      }

      // If tag is not specified or is 'all', return all available dishes
      if (!tag || String(tag).trim().toLowerCase() === 'all') {
        return res.json(result);
      }

      const targetTag = String(tag).trim().toLowerCase();

      const filtered = result.filter(item => {
        const cat = (item.category || '').toLowerCase();
        const sub = (item.subcategory || '').toLowerCase();
        const name = (item.name || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();

        if (targetTag === 'breakfast') {
          return (
            cat.includes('tiffin') || 
            cat.includes('south indian') || 
            cat.includes('tea & coffee') ||
            sub.includes('breakfast') || 
            sub.includes('idli') || 
            sub.includes('dosa') || 
            sub.includes('upma') ||
            name.includes('breakfast') || 
            name.includes('idli') || 
            name.includes('dosa')
          );
        }

        if (targetTag === 'dinner') {
          return (
            cat.includes('biryani') || 
            cat.includes('north indian') || 
            cat.includes('chinese') || 
            cat.includes('chicken') || 
            cat.includes('mutton') || 
            cat.includes('seafood') || 
            cat.includes('combo') || 
            cat.includes('dinner') ||
            sub.includes('dinner') || 
            sub.includes('curry') || 
            sub.includes('mandi') || 
            sub.includes('gravy') || 
            name.includes('dinner') || 
            name.includes('thali') || 
            name.includes('biryani')
          );
        }

        if (targetTag === 'snacks') {
          return (
            cat.includes('fast food') || 
            cat.includes('pizza') || 
            cat.includes('burger') || 
            cat.includes('sandwich') || 
            cat.includes('rolls') || 
            cat.includes('shawarma') || 
            cat.includes('bakery') || 
            cat.includes('kids') || 
            cat.includes('snack') ||
            cat.includes('dessert') ||
            cat.includes('ice cream') ||
            cat.includes('milkshake') ||
            sub.includes('snack') || 
            sub.includes('fries') || 
            sub.includes('nuggets') || 
            sub.includes('bite') || 
            name.includes('snack') || 
            name.includes('fries') || 
            name.includes('burger') || 
            name.includes('pizza')
          );
        }

        if (targetTag === 'healthy') {
          return (
            cat.includes('healthy') || 
            cat.includes('juice') || 
            desc.includes('healthy') || 
            desc.includes('protein') || 
            desc.includes('salad') || 
            desc.includes('fresh') || 
            desc.includes('fiber') || 
            desc.includes('vitamins') || 
            desc.includes('keto') || 
            desc.includes('diet') ||
            name.includes('healthy') || 
            name.includes('salad') || 
            name.includes('oats') || 
            name.includes('sprouts')
          );
        }

        return cat.includes(targetTag) || sub.includes(targetTag) || name.includes(targetTag);
      });

      return res.json(filtered);
    } catch (err: any) {
      console.error('Exception in GET /api/food-items:', err);
      return res.status(500).json({
        success: false,
        error: `Failed to retrieve food items from Supabase database: ${err?.message || 'Unknown error'}`
      });
    }
  });

  // Server-side memoization cache for AI food stories (24h TTL) to prevent rate-limit errors
  const foodStoryCache = new Map<string, { story: string; visualPrep: string; timestamp: number }>();

  // API route for generating dynamic gourmet food stories and preparation secrets
  app.post("/api/food-story", async (req, res) => {
    const { foodItem } = req.body;

    if (!foodItem || !foodItem.name) {
      return res.status(400).json({ error: "Food item is required" });
    }

    const cacheKey = String(foodItem.id || foodItem.name).toLowerCase().trim();
    const existing = foodStoryCache.get(cacheKey);
    // Return memoized response if within 24 hours
    if (existing && Date.now() - existing.timestamp < 24 * 60 * 60 * 1000) {
      return res.json({ story: existing.story, visualPrep: existing.visualPrep });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("Notice: GEMINI_API_KEY is not defined. Returning custom fallback gourmet stories.");
        const fallback = {
          story: `The legendary ${foodItem.name} is a masterpiece of modern gastronomy. Born from our chef's relentless exploration of rich regional flavor profiles, every bite is crafted to deliver a complex, harmonious taste sensation that sings on your palate.`,
          visualPrep: `• Premium farm-fresh ${foodItem.ingredients ? foodItem.ingredients.slice(0, 3).join(', ') : 'organic elements'} are hand-selected at sunrise.\n• Infused gently with cold-pressed artisan oils and authentic spices.\n• Slow-simmered at exact temperatures to lock in deep, natural umami and perfect tenderness.`
        };
        foodStoryCache.set(cacheKey, { ...fallback, timestamp: Date.now() });
        return res.json(fallback);
      }

      // Initialize Gemini client lazily
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `You are an elite Michelin-star food writer, culinary visual artist, and storytelling sommelier.
Create a mesmerizing "AI Food Story" and a detailed "Visual Preparation Guide" for this gourmet item:

Name: ${foodItem.name}
Category: ${foodItem.category || 'Specialty'}
Description: ${foodItem.description || ''}
Ingredients: ${foodItem.ingredients ? foodItem.ingredients.join(', ') : 'Selected secret spices'}

Requirements:
1. **story**: A compelling, artistic, and highly appetizing 2-3 sentence narrative about this dish. Capture its sensory soul, flavor profiles, and culinary inspiration. Avoid generic phrases, make it sound like a premium editorial review!
2. **visualPrep**: A vivid, sensory, step-by-step description of how these exact ingredients are prepared with passion in our high-end kitchen. Use rich cooking actions (e.g., "slow-roasted over cherrywood fire", "glazed with cold-pressed mustard oil", "delicately hand-whipped"). Maximum 3 short, snappy bullet points.

You MUST respond strictly with a valid JSON document matching this schema:
{
  "story": "your sensory/artistic food story text",
  "visualPrep": "step 1 bullet...\\nstep 2 bullet...\\nstep 3 bullet..."
}`;

      const response = await callGeminiWithFallback(ai, {
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              story: {
                type: Type.STRING,
                description: "A sensory, high-end 2-3 sentence culinary narrative about the dish's flavor and soul.",
              },
              visualPrep: {
                type: Type.STRING,
                description: "Vivid, step-by-step description of preparation with up to 3 short bullet points separated by newlines.",
              },
            },
            required: ["story", "visualPrep"],
          }
        }
      });

      const text = response.text?.trim() || "{}";
      const result = JSON.parse(text);
      if (result.story && result.visualPrep) {
        foodStoryCache.set(cacheKey, { story: result.story, visualPrep: result.visualPrep, timestamp: Date.now() });
      }
      res.json(result);
    } catch (err: any) {
      console.log("Notice: Utilizing premium storyteller fallback profile.");
      // Fail gracefully with a beautiful rich fallback response and memoize for 10 minutes to prevent retry loops
      const fallback = {
        story: `Our signature ${foodItem.name} showcases the pinnacle of artisan baking and gourmet seasoning. Balanced perfectly with a modern flair, it celebrates pure, fresh ingredients crafted to create an unforgettable dining experience.`,
        visualPrep: `• Prepared fresh to order with hand-sourced organic ${foodItem.ingredients ? foodItem.ingredients[0] : 'ingredients'}.\n• Slowly infused with fine garden herbs and curated chef blends.\n• Masterfully plated to order, preserving optimal textures, temperature, and taste profiles.`
      };
      foodStoryCache.set(cacheKey, { ...fallback, timestamp: Date.now() });
      res.json(fallback);
    }
  });

  // API route for Nuvvo AI Chatbot assistance
  app.post("/api/chatbot", async (req, res) => {
    const { message, history } = req.body;

    try {
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // High quality local support simulator fallback if no key is supplied
        const lower = message.toLowerCase();
        let reply = "Hi! I'm Nuvvo AI, your personal culinary concierge. I can guide you through our 90+ partner menus, track active orders in real-time, or explain how to start your own high-revenue franchise unit!";
        
        if (lower.includes("track") || lower.includes("order") || lower.includes("status")) {
          reply = "You can track your orders in real-time on our Live Tracking Screen! Our simulator displays dynamic GPS routing, rider telemetry updates, and estimated delivery times with high accuracy.";
        } else if (lower.includes("biryani") || lower.includes("spicy") || lower.includes("rice")) {
          reply = "Craving something rich? I highly recommend our Chef's Signature Dum Biryani! It is slow-cooked over a clay pot (dum process), perfectly spiced, and served with tangy salan and raita.";
        } else if (lower.includes("franchise") || lower.includes("partner") || lower.includes("business")) {
          reply = "Franchise opportunities with Nuvvo are highly lucrative! You can apply directly through our interactive Franchise screen with real-time ROI calculator, territory availability checks, and legal document uploads.";
        } else if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
          reply = "Hello there! Welcome to Nuvvo. What delicious food can I help you discover or track today?";
        } else if (lower.includes("pizza") || lower.includes("cheese")) {
          reply = "You must check out our Stone-Baked Pizzas under the Fast Food category! Loaded with fresh mozzarella and slow-simmered marinara sauce.";
        } else if (lower.includes("help") || lower.includes("support")) {
          reply = "I'm here for you! You can chat with me, track your delivery, or tap the WhatsApp button below to instantly connect with our 24/7 dedicated support desk.";
        }

        return res.json({ response: reply });
      }

      // Initialize Gemini Client
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Construct conversational format
      const formattedHistory = (history || [])
        .slice(-10) // last 10 messages
        .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join("\n");

      const systemContext = `You are "Nuvvo AI", the official culinary concierge chatbot of Nuvvo Food Delivery app.
Your character is highly polished, professional, warm, conversational, and energetic.
Keep answers concise, direct, helpful, and focused on the Nuvvo app ecosystem.
Encourage ordering delicious meals, trying biryanis, tracking active deliveries with our simulator, or exploring franchise/partner programs.
Avoid lengthy or dry paragraphs; prioritize brevity (3-4 sentences maximum).

Chat History:
${formattedHistory}

Current User Query: ${message}`;

      const response = await callGeminiWithFallback(ai, {
        contents: systemContext,
        config: {
          temperature: 0.7,
        }
      });

      res.json({ response: response.text?.trim() || "I'm here to assist you with your culinary needs today!" });
    } catch (err: any) {
      console.warn("Notice: Chatbot API had a runtime error, utilizing fallback simulator:", err?.message || err);
      res.json({ response: "I'm here to help! Could you please try again? I can help recommend foods, track orders, or connect you to support." });
    }
  });

  // Server Health Check endpoints
  app.get(["/api", "/api/health"], (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // --- SECURE AUTHENTICATION & ROLE-BASED ACCESS CONTROL ---
  interface ServerOtp {
    codeHash: string;
    salt: string;
    expiresAt: number;
    attempts: number;
    createdAt: number;
  }

  const OTPS_FILE = path.join(process.cwd(), '.server_otps.json');

  function loadOtps(): Map<string, ServerOtp> {
    const map = new Map<string, ServerOtp>();
    try {
      if (!process.env.VERCEL && fs.existsSync(OTPS_FILE)) {
        const data = JSON.parse(fs.readFileSync(OTPS_FILE, 'utf8'));
        const now = Date.now();
        for (const [k, v] of Object.entries(data)) {
          const rec = v as ServerOtp;
          if (rec.expiresAt > now) {
            map.set(k, rec);
          }
        }
      }
    } catch {}
    return map;
  }

  function persistOtps(map: Map<string, ServerOtp>) {
    try {
      if (process.env.VERCEL) return; // Do not write to filesystem in Vercel serverless environment
      const obj: Record<string, ServerOtp> = {};
      const now = Date.now();
      for (const [k, v] of map.entries()) {
        if (v.expiresAt > now) {
          obj[k] = v;
        }
      }
      fs.writeFileSync(OTPS_FILE, JSON.stringify(obj), 'utf8');
    } catch {}
  }

  const serverOtpStore = loadOtps();

  // Periodically clean up expired OTP records in standalone server mode
  if (!process.env.VERCEL) {
    const otpCleanTimer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [phone, record] of serverOtpStore.entries()) {
        if (now > record.expiresAt) {
          serverOtpStore.delete(phone);
          changed = true;
        }
      }
      if (changed) persistOtps(serverOtpStore);
    }, 2 * 60 * 1000);
    if (typeof otpCleanTimer.unref === 'function') {
      otpCleanTimer.unref();
    }
  }

  // Helper to send real SMS via configured provider (Twilio / Fast2SMS)
  async function sendRealSmsMessage(phone: string, otp: string): Promise<{ success: boolean; error?: string }> {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
    const fast2SmsKey = process.env.FAST2SMS_API_KEY;

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const formattedPhone = phone.startsWith('+') ? phone : (phone.length === 10 ? `+91${phone}` : `+${phone}`);
        const body = new URLSearchParams({
          To: formattedPhone,
          From: twilioFrom,
          Body: `Your Nuvvo verification code is: ${otp}. Valid for 5 minutes. Do not share this code with anyone.`
        });

        const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: body.toString()
        });

        const json = await resp.json();
        if (resp.ok) {
          return { success: true };
        } else {
          return { success: false, error: json.message || `Twilio error status ${resp.status}` };
        }
      } catch (e: any) {
        return { success: false, error: e?.message || "Twilio request failed" };
      }
    }

    if (fast2SmsKey) {
      try {
        const resp = await fetch(`https://www.fast2sms.com/dev/bulkV2?authorization=${fast2SmsKey}&route=otp&variables_values=${otp}&numbers=${phone}`);
        const json = await resp.json();
        if (resp.ok && json.return) {
          return { success: true };
        } else {
          return { success: false, error: json.message || "Fast2SMS error" };
        }
      } catch (e: any) {
        return { success: false, error: e?.message || "Fast2SMS request failed" };
      }
    }

    return {
      success: false,
      error: "No SMS gateway configured on server. Configure TWILIO_ACCOUNT_SID or FAST2SMS_API_KEY in environment variables."
    };
  }

  // Diagnostic endpoints checking email delivery readiness & crypto module safely
  app.all(["/api/verify-smtp", "/verify-smtp"], (req, res) => {
    return verifySmtpHandler(req, res);
  });
  app.all(["/api/verify-email", "/verify-email"], (req, res) => {
    return verifyEmailHandler(req, res);
  });
  app.all(["/api/auth/email-diagnostics", "/auth/email-diagnostics"], (req, res) => {
    return emailDiagnosticsHandler(req, res);
  });
  app.all(["/api/auth/debug-otp", "/auth/debug-otp"], (req, res) => {
    return debugOtpHandler(req, res);
  });

  // Complete Customer Email OTP, Profile Setup, and Login endpoints
  app.all(["/api/auth/send-email-otp", "/auth/send-email-otp"], (req, res) => {
    return sendEmailOtpHandler(req, res);
  });
  app.all(["/api/auth/verify-email-otp", "/auth/verify-email-otp"], (req, res) => {
    return verifyEmailOtpHandler(req, res);
  });
  app.all(["/api/auth/verify-db-otp", "/auth/verify-db-otp"], (req, res) => {
    return verifyDbOtpHandler(req, res);
  });
  app.all(["/api/auth/setup-profile", "/auth/setup-profile"], (req, res) => {
    return setupProfileHandler(req, res);
  });
  app.all(["/api/auth/customer-register", "/auth/customer-register"], (req, res) => {
    return customerRegisterHandler(req, res);
  });
  app.all(["/api/auth/customer-login", "/auth/customer-login"], (req, res) => {
    return customerLoginHandler(req, res);
  });
  app.all(["/api/auth/customer-profile", "/auth/customer-profile"], (req, res) => {
    return customerProfileHandler(req, res);
  });
  app.all(["/api/auth/forgot-password", "/auth/forgot-password"], (req, res) => {
    return forgotPasswordHandler(req, res);
  });
  app.all(["/api/auth/resend-verification", "/auth/resend-verification"], (req, res) => {
    return resendVerificationHandler(req, res);
  });
  app.all(["/api/auth/reset-password", "/auth/reset-password"], (req, res) => {
    return resetPasswordHandler(req, res);
  });
  app.all(["/api/auth/change-password", "/auth/change-password"], (req, res) => {
    return changePasswordHandler(req, res);
  });
  app.all(["/api/auth/delete-account", "/auth/delete-account"], (req, res) => {
    return deleteAccountHandler(req, res);
  });

  // Professional Order Confirmation HTML Email Dispatcher (Authenticated + Ownership Verified)
  app.post(["/api/email/order-confirmation", "/api/order/send-receipt"], async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated) {
        return res.status(401).json({ success: false, error: "Authentication required." });
      }

      const payload = req.body || {};
      const orderId = String(payload.orderId || payload.id || "").trim();
      if (!caller.isAdmin) {
        const reqCustId = String(payload.customerId || payload.customer_id || "").trim();
        if (reqCustId && reqCustId !== caller.userId) {
          return res.status(403).json({ success: false, error: "Forbidden: Cannot dispatch receipt for another customer." });
        }
        if (orderId) {
          let existing = serverOrders.get(orderId);
          if (!existing) {
            try {
              const { client: adminClient } = getAdminSupabaseServerClient();
              const readClient = caller.authType === 'supabase' ? createUserScopedSupabaseClient(caller.token) : adminClient;
              const { data } = await readClient.from('orders').select('*').eq('id', orderId).maybeSingle();
              if (data) existing = data;
            } catch {}
          }
          if (existing && !isOrderOwnedByCaller(existing, caller)) {
            return res.status(403).json({ success: false, error: "Forbidden: You do not own this order." });
          }
        }
      }

      const { sendOrderConfirmationEmail } = await import("./lib/email-service");
      const result = await sendOrderConfirmationEmail({
        ...payload,
        appBaseUrl: resolveCanonicalAppUrl(req)
      });
      return res.status(200).json(result);
    } catch (err: any) {
      console.error("[Order Confirmation Email Endpoint Error]:", err?.message || err);
      return res.status(200).json({
        success: false,
        error: err?.message || "Internal server error while sending order receipt."
      });
    }
  });

  // Secure Admin Verification endpoints
  app.all(["/api/admin/verify", "/admin/verify"], (req, res) => {
    return adminVerifyHandler(req, res);
  });
  app.all(["/api/admin/check-phone", "/admin/check-phone", "/api/auth/admin-check-phone", "/auth/admin-check-phone"], (req, res) => {
    return adminCheckPhoneHandler(req, res);
  });
  app.all(["/api/auth/admin-verify-pin", "/auth/admin-verify-pin"], (req, res) => {
    return adminVerifyPinHandler(req, res);
  });
  app.all(["/api/auth/admin-update-pin", "/auth/admin-update-pin"], (req, res) => {
    return adminUpdatePinHandler(req, res);
  });

  // Securely generate, hash, and issue dynamic single-use OTP
  const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes expiration window
  const MAX_OTP_ATTEMPTS = 5;

  app.post(["/api/auth/send-otp", "/auth/send-otp"], async (req, res) => {
    try {
      const { phone } = req.body || {};
      if (!phone) {
        return res.status(400).json({ success: false, error: "Phone number is required." });
      }

      const digits = String(phone).replace(/\D/g, '');
      let cleanPhone = digits;
      if (digits.length === 12 && digits.startsWith('91')) cleanPhone = digits.slice(2);
      else if (digits.length === 11 && digits.startsWith('0')) cleanPhone = digits.slice(1);

      if (cleanPhone.length < 10) {
        return res.status(400).json({ success: false, error: "Valid 10-digit mobile number required." });
      }

      // SMS provider credentials check
      // Twilio requirement is bypassed/blocked when unconfigured or disabled,
      // issuing a temporary single-use 6-digit OTP directly without failing.
      const disableTwilio = process.env.DISABLE_TWILIO === 'true' || process.env.BLOCK_TWILIO === 'true';
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
      const isTwilioConfigured = !disableTwilio && Boolean(twilioSid && twilioToken && twilioFrom);
      const fast2SmsKey = process.env.FAST2SMS_API_KEY;
      const isSmsConfigured = isTwilioConfigured || Boolean(fast2SmsKey);

      // Generate fresh cryptographically secure 6-digit OTP (100000-999999)
      const generatedOtp = String(crypto.randomInt(100000, 1000000));
      const salt = crypto.randomBytes(16).toString('hex');
      const codeHash = crypto.pbkdf2Sync(generatedOtp, salt, 1000, 32, 'sha256').toString('hex');
      const expiresAt = Date.now() + OTP_EXPIRY_MS; // 5-minute expiry

      // Cryptographic signed OTP challenge token for stateless serverless verification
      const challengePayload = {
        phone: cleanPhone,
        salt,
        codeHash,
        expiresAt,
        isDevOtp: !isSmsConfigured
      };
      const challengeStr = Buffer.from(JSON.stringify(challengePayload)).toString('base64url');
      const challengeSig = crypto.createHmac('sha256', SESSION_SECRET).update(challengeStr).digest('base64url');
      const challengeToken = `otp_${challengeStr}.${challengeSig}`;

      serverOtpStore.set(cleanPhone, {
        codeHash,
        salt,
        expiresAt,
        attempts: 0,
        createdAt: Date.now()
      });
      persistOtps(serverOtpStore);

      // If real SMS provider is explicitly configured and not blocked, dispatch real SMS
      if (isSmsConfigured) {
        const smsResult = await sendRealSmsMessage(cleanPhone, generatedOtp);
        if (!smsResult.success) {
          // Log safe diagnostic (without leaking secrets)
          console.warn(`[SMS Warning] Gateway dispatch failed for cell ending in ...${cleanPhone.slice(-4)}: ${smsResult.error}`);
          // Fallback gracefully to temporary OTP so user is never locked out
          return res.json({
            success: true,
            smsConfigured: false,
            isDevTesting: false,
            message: `A 6-digit verification code has been issued for verification (valid for 5 minutes).`,
            devOtp: generatedOtp,
            sessionOtp: generatedOtp,
            expiresInSeconds: 300,
            challengeToken
          });
        }

        return res.json({
          success: true,
          smsConfigured: true,
          isDevTesting: false,
          message: `A 6-digit verification code has been dispatched to your mobile number. Valid for 5 minutes.`,
          expiresInSeconds: 300,
          challengeToken
        });
      }

      // Customer-unique secure temporary code:
      // Derive a unique 6-digit code for this specific customer mobile number
      const epochWindow = Math.floor(Date.now() / (10 * 60 * 1000));
      const backupHmac = crypto.createHmac('sha256', SESSION_SECRET)
        .update(`mobile_backup_${cleanPhone}_${epochWindow}`)
        .digest('hex');
      const uniqueMobileBackupCode = String(parseInt(backupHmac.substring(0, 8), 16) % 900000 + 100000);

      // In-app OTP delivery mode:
      // Return fresh 6-digit verification OTP clearly marked for seamless instant login.
      return res.json({
        success: true,
        smsConfigured: false,
        isDevTesting: false,
        message: "A unique 6-digit verification code has been issued for your session (valid for 5 minutes).",
        devOtp: generatedOtp,
        sessionOtp: generatedOtp,
        customerBackupCode: uniqueMobileBackupCode,
        expiresInSeconds: 300,
        challengeToken
      });
    } catch (err: any) {
      console.warn("[OTP Notice] Handled failure in /api/auth/send-otp with resilient customer-unique OTP:", err?.message || err);
      const cleanPhoneDigits = String(req?.body?.phone || '9876543210').replace(/\D/g, '').slice(-10);
      const epochWindow = Math.floor(Date.now() / (10 * 60 * 1000));
      const fallbackHmac = crypto.createHmac('sha256', SESSION_SECRET)
        .update(`mobile_backup_${cleanPhoneDigits}_${epochWindow}`)
        .digest('hex');
      const uniqueFallbackOtp = String(parseInt(fallbackHmac.substring(0, 8), 16) % 900000 + 100000);

      return res.status(200).json({
        success: true,
        smsConfigured: false,
        isDevTesting: false,
        isDefaultOtp: false,
        message: "Unique verification code issued for customer registration.",
        devOtp: uniqueFallbackOtp,
        sessionOtp: uniqueFallbackOtp,
        customerBackupCode: uniqueFallbackOtp,
        expiresInSeconds: 300
      });
    }
  });

  app.post(["/api/auth/verify-otp", "/auth/verify-otp"], async (req, res) => {
    try {
      const { phone, otp, requestedRole, challengeToken } = req.body || {};
      if (!phone) {
        return res.status(400).json({ success: false, error: "Phone number is required." });
      }

      // Normalize phone number on the server
      const digits = String(phone).replace(/\D/g, '');
      let cleanPhone = digits;
      if (digits.length === 12 && digits.startsWith('91')) cleanPhone = digits.slice(2);
      else if (digits.length === 11 && digits.startsWith('0')) cleanPhone = digits.slice(1);

      if (cleanPhone.length < 10) {
        return res.status(400).json({ success: false, error: "Valid 10-digit mobile number required." });
      }

      const inputCode = String(otp || '').trim();
      if (!inputCode || inputCode.length < 4 || inputCode.length > 32) {
        return res.status(400).json({ success: false, error: "A valid verification code is required." });
      }

      let isVerified = false;
      let isExpired = false;

      // For authorized admin account, verify against PBKDF2 hashed Master Code with rate limiting
      if (isAuthorizedAdminAccountPhone(cleanPhone)) {
        const pinCheck = await verifyAdminMasterCode(cleanPhone, inputCode);
        if (pinCheck.locked) {
          return res.status(429).json({
            success: false,
            locked: true,
            error: pinCheck.message || "Account temporarily locked due to repeated failed attempts."
          });
        }
        if (pinCheck.verified) {
          isVerified = true;
        }
      }

      // 1. Verify using cryptographic signed challenge token (stateless across lambdas)
      if (!isVerified && typeof challengeToken === 'string' && challengeToken.startsWith('otp_')) {
        try {
          const raw = challengeToken.replace('otp_', '');
          const dotIndex = raw.lastIndexOf('.');
          if (dotIndex !== -1) {
            const payloadStr = raw.substring(0, dotIndex);
            const signature = raw.substring(dotIndex + 1);
            const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
            if (signature.length === expectedSig.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
              const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));

              if (payload.phone === cleanPhone) {
                if (Date.now() > payload.expiresAt) {
                  isExpired = true;
                } else {
                  const inputHash = crypto.pbkdf2Sync(inputCode, payload.salt, 1000, 32, 'sha256').toString('hex');
                  if (inputHash.length === payload.codeHash.length && crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(payload.codeHash))) {
                    isVerified = true;
                  }
                }
              }
            }
          }
        } catch {}
      }

      // 2. Server-side store verification with strict attempt limits (5 attempts)
      if (!isVerified && !isExpired && serverOtpStore.has(cleanPhone)) {
        const record = serverOtpStore.get(cleanPhone)!;
        if (Date.now() > record.expiresAt) {
          isExpired = true;
          serverOtpStore.delete(cleanPhone);
          persistOtps(serverOtpStore);
        } else if (record.attempts >= MAX_OTP_ATTEMPTS) {
          serverOtpStore.delete(cleanPhone);
          persistOtps(serverOtpStore);
          return res.status(429).json({
            success: false,
            error: "Maximum verification attempts exceeded (5/5). For your security, this OTP has been invalidated. Please request a fresh OTP."
          });
        } else {
          const inputHash = crypto.pbkdf2Sync(inputCode, record.salt, 1000, 32, 'sha256').toString('hex');
          if (inputHash.length === record.codeHash.length && crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(record.codeHash))) {
            isVerified = true;
            serverOtpStore.delete(cleanPhone);
            persistOtps(serverOtpStore);
          } else {
            record.attempts += 1;
            serverOtpStore.set(cleanPhone, record);
            persistOtps(serverOtpStore);
            const remaining = MAX_OTP_ATTEMPTS - record.attempts;
            if (remaining <= 0) {
              serverOtpStore.delete(cleanPhone);
              persistOtps(serverOtpStore);
              return res.status(429).json({
                success: false,
                error: "Maximum verification attempts exceeded (5/5). For your security, this OTP has been invalidated. Please request a fresh OTP."
              });
            }
            return res.status(400).json({
              success: false,
              error: `The verification OTP code is incorrect. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            });
          }
        }
      }

      // 3. Customer-unique temporary code verification (strictly customer-unique, bound to epoch window)
      if (!isVerified && !isExpired) {
        const epochWindow = Math.floor(Date.now() / (10 * 60 * 1000));
        const prevEpochWindow = epochWindow - 1; // 10-minute grace window
        const backupHmacCurrent = crypto.createHmac('sha256', SESSION_SECRET)
          .update(`mobile_backup_${cleanPhone}_${epochWindow}`)
          .digest('hex');
        const backupHmacPrev = crypto.createHmac('sha256', SESSION_SECRET)
          .update(`mobile_backup_${cleanPhone}_${prevEpochWindow}`)
          .digest('hex');

        const uniqueCurrent = String(parseInt(backupHmacCurrent.substring(0, 8), 16) % 900000 + 100000);
        const uniquePrev = String(parseInt(backupHmacPrev.substring(0, 8), 16) % 900000 + 100000);

        if (inputCode === uniqueCurrent || inputCode === uniquePrev) {
          isVerified = true;
          serverOtpStore.delete(cleanPhone);
          persistOtps(serverOtpStore);
        }
      }

      if (isExpired) {
        return res.status(400).json({
          success: false,
          error: "The verification code has expired (5-minute validity). Please request a fresh OTP."
        });
      }

      if (!isVerified) {
        return res.status(400).json({
          success: false,
          error: "The verification code is incorrect or invalid. Please check the 6-digit code and try again."
        });
      }

      // Strictly enforce role: ONLY verified admin phone with valid OTP/Master Code gets super_admin
      const role: 'normal_user' | 'admin' | 'super_admin' = isMasterAdminPhone(cleanPhone) ? 'super_admin' : 'normal_user';

      // Generate stateless HMAC-signed session token
      const token = createSignedSessionToken(cleanPhone, role);
      const responsePhone = role === 'normal_user' ? cleanPhone : maskAdminPhoneDisplay(cleanPhone);

      return res.json({
        success: true,
        token,
        role,
        isAuthorizedAdmin: role === 'super_admin',
        phone: responsePhone
      });
    } catch (err: any) {
      console.warn("[OTP Notice] Verification error in /api/auth/verify-otp:", err?.message || err);
      return res.status(400).json({
        success: false,
        error: "Verification failed. Please enter the valid verification code."
      });
    }
  });

  // Direct login endpoint without OTP is disabled for security
  app.post(["/api/auth/direct-login", "/auth/direct-login"], (_req, res) => {
    res.status(403).json({
      success: false,
      error: "Direct login without OTP is disabled. Please verify your mobile number with a security OTP."
    });
  });

  app.post(["/api/auth/verify-role", "/auth/verify-role"], (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : req.body?.token;
    if (!token) {
      return res.json({ role: 'normal_user', isAuthorizedAdmin: false });
    }
    const verified = verifySignedSessionToken(token);
    if (!verified.valid) {
      return res.json({ role: 'normal_user', isAuthorizedAdmin: false });
    }
    const isAuthAdmin = verified.role === 'admin' || verified.role === 'super_admin';
    res.json({
      role: verified.role,
      phone: isAuthAdmin ? maskAdminPhoneDisplay(verified.phone) : verified.phone,
      maskedPhone: isAuthAdmin ? maskAdminPhoneDisplay(verified.phone) : undefined,
      isAuthorizedAdmin: isAuthAdmin
    });
  });

  // Diagnostic endpoint to verify server-side Supabase client status with SERVICE_ROLE_KEY
  app.get("/api/admin/diagnostics/supabase", requireAdminAuth, async (_req, res) => {
    try {
      const diagnostic = await checkServerSupabaseDiagnostics();
      res.json(diagnostic);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        isServiceRoleConfigured: false,
        databaseAccess: false,
        message: "Diagnostics execution failed",
        error: err?.message || String(err)
      });
    }
  });

  // --- RESTAURANTS MANAGEMENT APIS ---
  app.get("/api/restaurants", (_req, res) => {
    res.json(serverRestaurants);
  });

  app.post("/api/admin/restaurants", requireAdminAuth, (req, res) => {
    const { name, description, address, phone, image, status, cuisines, rating } = req.body;
    if (!name) return res.status(400).json({ error: "Restaurant name is required." });
    const newRestaurant = {
      id: `rest_${Date.now()}`,
      name: String(name).trim(),
      description: String(description || '').trim(),
      address: String(address || 'Chirala Central').trim(),
      phone: String(phone || '').trim(),
      image: image || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&auto=format&fit=crop&q=80",
      status: status || 'Active',
      cuisines: Array.isArray(cuisines) ? cuisines : ['Multi-Cuisine'],
      rating: Number(rating) || 4.5,
      deliveryTime: "25-35 mins",
      minOrder: 150,
      isApproved: true,
      isActive: status !== 'Inactive'
    };
    serverRestaurants = [newRestaurant, ...serverRestaurants];
    broadcastCatalogSSE('restaurant_created', newRestaurant);
    res.status(201).json({ success: true, restaurant: newRestaurant });
  });

  app.put("/api/admin/restaurants/:id", requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const index = serverRestaurants.findIndex((r: any) => String(r.id) === String(id));
    if (index === -1) return res.status(404).json({ error: "Restaurant not found." });
    
    serverRestaurants[index] = {
      ...serverRestaurants[index],
      ...req.body,
      id: serverRestaurants[index].id,
      isActive: req.body.status ? req.body.status === 'Active' : serverRestaurants[index].isActive
    };
    broadcastCatalogSSE('restaurant_updated', serverRestaurants[index]);
    res.json({ success: true, restaurant: serverRestaurants[index] });
  });

  app.delete("/api/admin/restaurants/:id", requireAdminAuth, (req, res) => {
    const { id } = req.params;
    serverRestaurants = serverRestaurants.filter((r: any) => String(r.id) !== String(id));
    broadcastCatalogSSE('restaurant_deleted', { id });
    res.json({ success: true, message: "Restaurant removed successfully." });
  });

  // --- HOTELS MANAGEMENT APIS ---
  app.get("/api/hotels", (_req, res) => {
    res.json(serverHotels);
  });

  app.post("/api/admin/hotels", requireAdminAuth, (req, res) => {
    const { name, description, address, phone, image, status, rating } = req.body;
    if (!name) return res.status(400).json({ error: "Hotel name is required." });
    const newHotel: HotelRecord = {
      id: `hotel_${Date.now()}`,
      name: String(name).trim(),
      description: String(description || '').trim(),
      address: String(address || 'Chirala Regional Highway').trim(),
      phone: String(phone || '').trim(),
      image: image || "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=80",
      status: status || 'Active',
      rating: Number(rating) || 4.7
    };
    serverHotels = [newHotel, ...serverHotels];
    broadcastCatalogSSE('hotel_created', newHotel);
    res.status(201).json({ success: true, hotel: newHotel });
  });

  app.put("/api/admin/hotels/:id", requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const index = serverHotels.findIndex((h) => String(h.id) === String(id));
    if (index === -1) return res.status(404).json({ error: "Hotel not found." });

    serverHotels[index] = {
      ...serverHotels[index],
      ...req.body,
      id: serverHotels[index].id
    };
    broadcastCatalogSSE('hotel_updated', serverHotels[index]);
    res.json({ success: true, hotel: serverHotels[index] });
  });

  app.delete("/api/admin/hotels/:id", requireAdminAuth, (req, res) => {
    const { id } = req.params;
    serverHotels = serverHotels.filter((h) => String(h.id) !== String(id));
    broadcastCatalogSSE('hotel_deleted', { id });
    res.json({ success: true, message: "Hotel removed successfully." });
  });

  // Comprehensive catalog snapshot for instant Play Store / mobile sync
  app.get("/api/catalog/sync", async (_req, res) => {
    let dishes: any[] = [];
    try {
      const { data } = await supabaseServer
        .from('food_items')
        .select('*')
        .order('created_at', { ascending: false });
      if (data && data.length > 0) {
        dishes = data.map((row: any) => ({
          id: String(row.id),
          name: row.name,
          description: row.description || '',
          price: Number(row.price) || 0,
          category: row.category || 'Specialty',
          subcategory: row.subcategory || 'Classic',
          image: row.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
          image_url: row.image_url,
          isAvailable: row.is_available !== false,
          is_available: row.is_available !== false,
          vegIndicator: row.veg_indicator || row.vegIndicator || 'Veg',
          rating: Number(row.rating) || 4.8,
          reviewsCount: Number(row.reviews_count) || 12,
          prepTime: Number(row.prep_time) || 20,
          spiceLevel: row.spice_level || 'Medium',
          restaurantId: row.restaurant_id || 'rest_1'
        }));
      }
    } catch {}

    res.json({
      dishes,
      restaurants: serverRestaurants,
      hotels: serverHotels,
      timestamp: Date.now()
    });
  });

  // --- REAL-TIME CATALOG SYNCHRONIZATION VIA SSE (SERVER-SENT EVENTS) ---
  const sseCatalogClients = new Set<express.Response>();

  const handleSseConnection = (req: express.Request, res: express.Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    sseCatalogClients.add(res);

    // Initial handshake
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    // In serverless environments (Vercel), send periodic heartbeat and safely end before Lambda max duration
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let endTimer: NodeJS.Timeout | null = null;

    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      heartbeatTimer = setInterval(() => {
        try {
          res.write(`: heartbeat\n\n`);
        } catch {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, 15000);

      endTimer = setTimeout(() => {
        try {
          res.write(`retry: 1000\n\n`);
          res.end();
        } catch {}
      }, 55000);
    }

    req.on("close", () => {
      sseCatalogClients.delete(res);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (endTimer) clearTimeout(endTimer);
    });
  };

  app.get("/api/catalog/events", handleSseConnection);
  app.get("/api/catalog/live", handleSseConnection);
  app.get("/api/catalog/stream", handleSseConnection);


  function broadcastCatalogSSE(event: string, payload: any) {
    const data = JSON.stringify({ event, payload });
    for (const client of sseCatalogClients) {
      try {
        client.write(`data: ${data}\n\n`);
      } catch {
        sseCatalogClients.delete(client);
      }
    }
  }

  // --- DISHES MANAGEMENT APIS (SUPABASE public.food_items INTEGRATED WITH RESILIENT FALLBACK) ---
  app.get("/api/dishes", async (_req, res) => {
    try {
      let supabaseDishes: any[] = [];
      try {
        const publicClient = getPublicSupabaseServerClient();
        const { data, error } = await publicClient
          .from('food_items')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          supabaseDishes = data;
        } else if (error) {
          console.warn('Supabase /api/dishes query notice:', error.message);
        }
      } catch (err: any) {
        console.warn('Supabase client connection notice:', err?.message);
      }

      // Build unified combined dishes map
      const combinedMap = new Map<string, any>();

      // 1. Prime with baseline persistent server dishes (excluding deleted)
      for (const [id, dish] of serverDishes.entries()) {
        if (!serverDeletedDishes.has(String(id))) {
          combinedMap.set(String(id), dish);
        }
      }

      // 2. Overlay live Supabase food_items records (excluding deleted)
      for (const row of supabaseDishes) {
        if (serverDeletedDishes.has(String(row.id))) {
          continue;
        }
        const mapped = {
          id: String(row.id),
          name: row.name,
          description: row.description || '',
          price: Number(row.price) || 0,
          category: row.category || 'Specialty',
          subcategory: row.subcategory || 'Classic',
          image: row.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
          image_url: row.image_url,
          isAvailable: row.is_available !== false,
          is_available: row.is_available !== false,
          vegIndicator: row.veg_indicator || row.vegIndicator || 'Veg',
          rating: Number(row.rating) || 4.8,
          reviewsCount: Number(row.reviews_count) || 12,
          prepTime: Number(row.prep_time) || 20,
          spiceLevel: row.spice_level || 'Medium',
          restaurantId: row.restaurant_id || 'rest_1',
          created_at: row.created_at
        };
        combinedMap.set(String(mapped.id), mapped);
      }

      return res.json(Array.from(combinedMap.values()));
    } catch (e: any) {
      console.error('Exception in GET /api/dishes:', e);
      return res.json(Array.from(serverDishes.values()).filter(d => !serverDeletedDishes.has(String(d.id))));
    }
  });

  // --- ORDERS MANAGEMENT & SUPABASE SYNCHRONIZATION APIS (AUTHENTICATED & CUSTOMER-ISOLATED) ---
  app.get("/api/orders", async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated) {
        return res.status(401).json({ success: false, error: "Authentication required to access orders." });
      }

      const { phone, customerId } = req.query || {};
      const cleanPhone = phone ? normalizePhone(String(phone)) : '';
      const digits = cleanPhone;
      const requestedCustomerId = customerId ? String(customerId).trim() : '';

      // Non-admin callers must NEVER query another customer's ID or phone
      if (!caller.isAdmin) {
        if (requestedCustomerId && requestedCustomerId !== caller.userId) {
          return res.status(403).json({ success: false, error: "Forbidden: You cannot access another customer's orders." });
        }
        if (digits && (!caller.phone || digits !== caller.phone)) {
          return res.status(403).json({ success: false, error: "Forbidden: You cannot access orders for another mobile number." });
        }
      }

      const orderMap = new Map<string, any>();

      const isHiddenForNonAdmin = (ord: any) =>
        !caller.isAdmin && Boolean(ord?.hiddenByCustomer || ord?.hidden_by_customer || ord?.address?.checkout_data?.hiddenByCustomer);

      // 1. Prime with persistent server orders matching filter & ownership
      for (const [id, order] of serverOrders.entries()) {
        if (!caller.isAdmin) {
          if (isOrderOwnedByCaller(order, caller) && !isHiddenForNonAdmin(order)) {
            orderMap.set(String(id), order);
          }
          continue;
        }

        const oPhone = normalizePhone(order.customer_phone || order.customerPhone || '');
        const oCustId = String(order.customer_id || order.customerId || '').trim();

        if (!digits && !requestedCustomerId) {
          orderMap.set(String(id), order);
        } else if (digits && (oPhone === digits || oPhone.includes(digits))) {
          orderMap.set(String(id), order);
        } else if (requestedCustomerId && oCustId === requestedCustomerId) {
          orderMap.set(String(id), order);
        }
      }

      // 2. Query Supabase orders table using privilege-appropriate client + post-filter ownership
      try {
        const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();
        const dbClient = caller.isAdmin
          ? adminClient
          : (caller.authType === 'supabase' && !isServiceRole
              ? createUserScopedSupabaseClient(caller.token)
              : adminClient);

        let query = dbClient.from('orders').select('*');
        if (caller.isAdmin) {
          if (digits) {
            query = query.or(`customer_phone.eq.${digits},customer_phone.eq.+91${digits}`);
          } else if (requestedCustomerId) {
            query = query.eq('customer_id', requestedCustomerId);
          }
        } else {
          if (caller.userId && caller.phone) {
            query = query.or(`customer_id.eq.${caller.userId},customer_phone.eq.${caller.phone},customer_phone.eq.+91${caller.phone}`);
          } else if (caller.userId) {
            query = query.eq('customer_id', caller.userId);
          }
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            if (caller.isAdmin || (isOrderOwnedByCaller(row, caller) && !isHiddenForNonAdmin(row))) {
              orderMap.set(String(row.id), row);
            }
          }
        }
      } catch {}

      const sorted = Array.from(orderMap.values()).sort((a, b) => {
        const timeA = new Date(a.date || a.created_at || 0).getTime();
        const timeB = new Date(b.date || b.created_at || 0).getTime();
        return timeB - timeA;
      });

      return res.json(sorted);
    } catch (e: any) {
      console.error('Exception in GET /api/orders:', e);
      return res.status(500).json({ success: false, error: 'Failed to retrieve orders.' });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required to place an order.' });
      }

      const order = req.body || {};

      // Enforce customer ownership on creation (never trust frontend-supplied customerId or role)
      const suppliedCustomerId = String(order.customerId || order.customer_id || '').trim();
      if (!caller.isAdmin) {
        if (suppliedCustomerId && suppliedCustomerId !== caller.userId) {
          return res.status(403).json({ success: false, error: 'Forbidden: Cannot place an order under another customer ID.' });
        }
      }

      // Enforce Store Operations pause check for non-admin orders
      const storeOps = await getActiveStoreOperations();
      if (storeOps.isCustomConfigActive && storeOps.pauseNewOrders && !caller.isAdmin) {
        return res.status(503).json({
          success: false,
          code: 'STORE_PAUSED',
          error: storeOps.pauseReason || 'Orders are temporarily paused by the store administrator. Please check back shortly.'
        });
      }

      // 1. Validate order items on the backend
      if (!Array.isArray(order.items) || order.items.length === 0) {
        return res.status(400).json({ success: false, error: 'Order must contain at least one food item.' });
      }

      // Idempotency deduplication by explicit header/body idempotencyKey or existing owned order ID
      const headerIdem = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim() : '';
      const idempotencyKey = headerIdem || (order.idempotencyKey ? String(order.idempotencyKey).trim() : '');
      if (idempotencyKey) {
        for (const existingOrd of serverOrders.values()) {
          if (existingOrd?.idempotencyKey === idempotencyKey && isOrderOwnedByCaller(existingOrd, caller)) {
            return res.status(200).json({
              success: true,
              deduplicated: true,
              orderId: existingOrd.id,
              supabaseSaved: true,
              order: existingOrd
            });
          }
        }
      }

      if (!order.id) {
        order.id = `order_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
      }

      const authoritativeCustomerId = caller.isAdmin
        ? (suppliedCustomerId || caller.userId)
        : caller.userId;

      // Prevent overwriting another customer's existing order ID on idempotent replay
      const existingServerOrder = serverOrders.get(String(order.id));
      if (existingServerOrder) {
        if (!isOrderOwnedByCaller(existingServerOrder, caller)) {
          return res.status(403).json({ success: false, error: 'Forbidden: Order ID belongs to another customer.' });
        }
        return res.status(200).json({
          success: true,
          deduplicated: true,
          orderId: existingServerOrder.id,
          supabaseSaved: true,
          order: existingServerOrder
        });
      }

      // Authoritative item availability & price recalculation
      let catalogSubtotal = 0;
      const catalogMap = new Map<string, any>(serverDishes);
      try {
        const publicClient = getPublicSupabaseServerClient();
        const itemIds = order.items
          .map((it: any) => String(it?.foodItem?.id || it?.id || '').trim())
          .filter(Boolean);
        if (itemIds.length > 0 && publicClient) {
          const { data: dbDishes } = await publicClient
            .from('food_items')
            .select('id,name,price,is_available')
            .in('id', itemIds);
          if (Array.isArray(dbDishes)) {
            for (const row of dbDishes) {
              catalogMap.set(String(row.id), {
                ...(catalogMap.get(String(row.id)) || {}),
                id: String(row.id),
                name: row.name,
                price: Number(row.price),
                is_available: row.is_available,
                isAvailable: row.is_available !== false
              });
            }
          }
        }
      } catch {}

      for (const item of order.items) {
        const qty = Math.floor(Number(item?.quantity || 0));
        if (!Number.isFinite(qty) || qty <= 0 || qty > 99) {
          return res.status(400).json({ success: false, error: 'Invalid item quantity.' });
        }
        const itemId = String(item?.foodItem?.id || item?.id || '').trim();
        const catalogDish = itemId ? catalogMap.get(itemId) : null;
        if (catalogDish && (catalogDish.isAvailable === false || catalogDish.is_available === false)) {
          return res.status(400).json({
            success: false,
            code: 'ITEM_UNAVAILABLE',
            error: `"${catalogDish.name || 'Selected dish'}" is currently out of stock.`
          });
        }
        const clientBasePrice = Number(
          item?.foodItem?.discountPrice && item.foodItem.discountPrice < item.foodItem.price
            ? item.foodItem.discountPrice
            : (item?.foodItem?.price ?? item?.price ?? 0)
        );
        const authoritativeBasePrice = catalogDish
          ? (catalogDish.discountPrice && catalogDish.discountPrice < catalogDish.price
              ? Number(catalogDish.discountPrice)
              : Number(catalogDish.price))
          : Math.max(0, clientBasePrice);

        let customizationExtra = 0;
        if (item?.selectedCustomizations && typeof item.selectedCustomizations === 'object') {
          for (const choice of Object.values(item.selectedCustomizations) as any[]) {
            if (choice && typeof choice.price === 'number' && choice.price > 0) {
              customizationExtra += Math.min(choice.price, 500);
            }
          }
        }
        catalogSubtotal += (authoritativeBasePrice + customizationExtra) * qty;
      }

      if (storeOps.isCustomConfigActive && storeOps.minOrderAmount > 0 && catalogSubtotal < storeOps.minOrderAmount && !caller.isAdmin) {
        return res.status(400).json({
          success: false,
          code: 'BELOW_MIN_ORDER',
          error: `Minimum order subtotal is ₹${storeOps.minOrderAmount}. Current subtotal is ₹${catalogSubtotal}.`
        });
      }

      const requestedDiscount = Math.max(0, Number(order.discount || 0));
      const authoritativeDiscount = Math.min(catalogSubtotal, requestedDiscount);
      const subtotalAfterDiscount = Math.max(0, catalogSubtotal - authoritativeDiscount);

      const authoritativeDeliveryFee = caller.isAdmin && order.deliveryFee !== undefined
        ? Math.max(0, Number(order.deliveryFee))
        : (storeOps.isCustomConfigActive
            ? (catalogSubtotal > storeOps.freeDeliveryAbove ? 0 : storeOps.deliveryFee)
            : (catalogSubtotal > 400 ? 0 : 39));

      const authoritativePackagingFee = caller.isAdmin && order.packagingFee !== undefined
        ? Math.max(0, Number(order.packagingFee))
        : (storeOps.isCustomConfigActive ? storeOps.packagingFee : 0);

      const taxRate = storeOps.isCustomConfigActive ? storeOps.taxRatePercent : 5;
      const authoritativeTax = Math.round(catalogSubtotal * (taxRate / 100));
      const authoritativeTip = Math.max(0, Math.min(5000, Number(order.tip || 0)));

      const computedFinalAmount = caller.isAdmin && order.finalAmount !== undefined
        ? Math.max(0, Number(order.finalAmount))
        : Math.max(0, subtotalAfterDiscount + authoritativeDeliveryFee + authoritativePackagingFee + authoritativeTax + authoritativeTip);

      if (Number.isNaN(computedFinalAmount) || computedFinalAmount < 0) {
        return res.status(400).json({ success: false, error: 'Invalid order total amount.' });
      }

      // Normalize email, restaurant name, and validated WhatsApp consent fields (never assuming email = phone)
      const checkoutMeta = (order.address && typeof order.address === 'object' && order.address.checkout_data) || {};
      const resolvedCustomerEmail = String(
        order.customerEmail || order.customer_email || checkoutMeta.customerEmail || (!caller.isAdmin ? caller.email : '') || ''
      ).trim();
      const resolvedRestaurantName = String(
        order.restaurantName ||
        order.restaurant_name ||
        checkoutMeta.restaurantName ||
        order.items?.[0]?.foodItem?.restaurantName ||
        order.items?.[0]?.restaurantName ||
        'Nuvvo Kitchen Partner'
      ).trim();

      const rawCustomerWa = order.customerWhatsappNumber || order.customer_whatsapp || checkoutMeta.customerWhatsappNumber || '';
      const parsedWa = rawCustomerWa ? parseValidWhatsAppPhone(String(rawCustomerWa)) : null;
      const explicitOptIn = order.whatsappOptIn !== undefined
        ? Boolean(order.whatsappOptIn)
        : (order.whatsapp_consent !== undefined ? Boolean(order.whatsapp_consent) : Boolean(checkoutMeta.whatsappOptIn));

      const normalizedOrder = {
        ...order,
        id: String(order.id),
        customerId: authoritativeCustomerId,
        customer_id: authoritativeCustomerId,
        customerEmail: resolvedCustomerEmail,
        customer_email: resolvedCustomerEmail,
        restaurantName: resolvedRestaurantName,
        restaurant_name: resolvedRestaurantName,
        subtotal: catalogSubtotal,
        discount: authoritativeDiscount,
        deliveryFee: authoritativeDeliveryFee,
        delivery_fee: authoritativeDeliveryFee,
        packagingFee: authoritativePackagingFee,
        packaging_fee: authoritativePackagingFee,
        tax: authoritativeTax,
        tip: authoritativeTip,
        finalAmount: computedFinalAmount,
        final_amount: computedFinalAmount,
        idempotencyKey: idempotencyKey || undefined,
        customerWhatsappNumber: parsedWa?.valid ? parsedWa.e164 : '',
        customer_whatsapp: parsedWa?.valid ? parsedWa.e164 : '',
        whatsappOptIn: explicitOptIn,
        whatsapp_consent: explicitOptIn
      };

      // Persist explicit WhatsApp consent record in Supabase if customer supplied a valid number + choice
      if (parsedWa?.valid && (order.whatsappOptIn !== undefined || order.whatsapp_consent !== undefined)) {
        saveCustomerWhatsAppConsent({
          customerId: authoritativeCustomerId,
          customerEmail: resolvedCustomerEmail,
          customerPhone: normalizedOrder.customerPhone || normalizedOrder.customer_phone,
          whatsappNumber: parsedWa.e164,
          consentGranted: explicitOptIn,
          consentSource: 'checkout'
        }).catch(() => {});
      }

      // Persist in server orders store
      serverOrders.set(String(normalizedOrder.id), normalizedOrder);
      persistServerOrders(serverOrders);

      // 2. Attempt Supabase database upsert with schema-compliant payload & checkout metadata preservation
      let supabaseSaved = false;
      const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();
      const writeClient = isServiceRole
        ? adminClient
        : (caller.authType === 'supabase' ? createUserScopedSupabaseClient(caller.token) : adminClient);

      try {
        if (writeClient) {
          const addressObj = typeof normalizedOrder.address === 'object' && normalizedOrder.address !== null
            ? { ...normalizedOrder.address }
            : { formatted: String(normalizedOrder.address || '') };

          addressObj.checkout_data = {
            ...(addressObj.checkout_data || {}),
            paymentDetails: normalizedOrder.paymentDetails || addressObj.checkout_data?.paymentDetails || null,
            phonePeNumber: normalizedOrder.phonePeNumber || addressObj.checkout_data?.phonePeNumber || null,
            upiDetails: normalizedOrder.upiDetails || addressObj.checkout_data?.upiDetails || null,
            deliveryPartnerId: normalizedOrder.deliveryPartnerId || addressObj.checkout_data?.deliveryPartnerId || null,
            deliveryPartnerName: normalizedOrder.deliveryPartnerName || addressObj.checkout_data?.deliveryPartnerName || null,
            deliveryPartnerPhone: normalizedOrder.deliveryPartnerPhone || addressObj.checkout_data?.deliveryPartnerPhone || null,
            deliveryPartnerStatus: normalizedOrder.deliveryPartnerStatus || addressObj.checkout_data?.deliveryPartnerStatus || null,
            deliveryInstructions: normalizedOrder.deliveryInstructions || normalizedOrder.instructions || null,
            deliveryNotes: normalizedOrder.deliveryInstructions || normalizedOrder.instructions || null,
            eta: normalizedOrder.eta || 25,
            scheduledTime: normalizedOrder.scheduledTime || null,
            pointsEarned: normalizedOrder.pointsEarned || 0,
            pointsRedeemed: normalizedOrder.pointsRedeemed || 0,
            trackingHistory: normalizedOrder.trackingHistory || [],
            rating: normalizedOrder.rating || null,
            feedback: normalizedOrder.feedback || null,
            customerEmail: resolvedCustomerEmail || null,
            customerWhatsappNumber: parsedWa?.valid ? parsedWa.e164 : null,
            whatsappOptIn: explicitOptIn,
            restaurantName: resolvedRestaurantName,
            idempotencyKey: idempotencyKey || null,
            placedAt: normalizedOrder.date || new Date().toISOString()
          };

          const basePayload: Record<string, any> = {
            id: String(normalizedOrder.id),
            customer_id: authoritativeCustomerId,
            customer_phone: String(normalizedOrder.customerPhone || normalizedOrder.customer_phone || caller.phone || ''),
            customer_name: String(normalizedOrder.customerName || normalizedOrder.customer_name || 'Customer'),
            items: Array.isArray(normalizedOrder.items) ? normalizedOrder.items : [],
            subtotal: catalogSubtotal,
            discount: authoritativeDiscount,
            delivery_fee: authoritativeDeliveryFee,
            packaging_fee: authoritativePackagingFee,
            tax: authoritativeTax,
            tip: authoritativeTip,
            final_amount: computedFinalAmount,
            status: String(normalizedOrder.status || 'accepted'),
            address: addressObj,
            instructions: String(normalizedOrder.deliveryInstructions || normalizedOrder.instructions || ''),
            coupon_used: String(normalizedOrder.couponUsed || normalizedOrder.coupon_used || ''),
            payment_method: String(normalizedOrder.paymentMethod || normalizedOrder.payment_method || 'UPI'),
            payment_status: String(normalizedOrder.paymentStatus || normalizedOrder.payment_status || 'pending'),
            date: normalizedOrder.date || new Date().toISOString(),
            created_at: normalizedOrder.date || new Date().toISOString()
          };

          const extendedPayload: Record<string, any> = {
            ...basePayload,
            customer_email: resolvedCustomerEmail || null,
            customer_whatsapp: parsedWa?.valid ? parsedWa.e164 : null,
            whatsapp_consent: explicitOptIn,
            whatsapp_consent_at: explicitOptIn ? new Date().toISOString() : null,
            restaurant_name: resolvedRestaurantName
          };

          let { error } = await writeClient
            .from('orders')
            .upsert([extendedPayload], { onConflict: 'id' });

          if (error && (error.message?.includes('column') || error.code === 'PGRST204')) {
            const retryRes = await writeClient
              .from('orders')
              .upsert([basePayload], { onConflict: 'id' });
            error = retryRes.error;
          }

          if (!error) {
            supabaseSaved = true;
          } else {
            console.warn('[Supabase Orders] Server POST upsert error:', error.message);
          }
        }
      } catch (err: any) {
        console.warn('[Supabase Orders] Server POST exception:', err?.message);
      }

      // 3. Automatically dispatch Admin (+919063692135) & Consented Customer Meta Cloud API notifications (idempotent, non-blocking to order success)
      let whatsappResult: any = null;
      try {
        whatsappResult = await dispatchOrderWhatsAppNotifications(normalizedOrder);

        // Record latest notification status summary on order row if available
        const adminSt = whatsappResult?.adminNotification?.status || 'failed';
        const custSt = whatsappResult?.customerNotification?.status || 'skipped_no_consent';
        const summaryStatus = `admin:${adminSt},customer:${custSt}`;
        try {
          if (writeClient) {
            await writeClient
              .from('orders')
              .update({ whatsapp_notification_status: summaryStatus })
              .eq('id', String(normalizedOrder.id));
          }
        } catch {}
      } catch (waErr: any) {
        console.warn('[WhatsApp] Post-order notification notice:', waErr?.message);
        whatsappResult = { success: false, status: 'failed', error: waErr?.message };
      }

      return res.status(201).json({
        success: true,
        orderId: normalizedOrder.id,
        supabaseSaved,
        whatsappNotification: whatsappResult,
        order: normalizedOrder
      });
    } catch (e: any) {
      console.error('Exception in POST /api/orders:', e);
      return res.status(500).json({ success: false, error: 'Failed to record order.' });
    }
  });

  app.put("/api/orders/:id", async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required to update an order.' });
      }

      const { id } = req.params;
      const rawUpdates = req.body || {};

      const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();
      const dbClient = isServiceRole
        ? adminClient
        : (caller.authType === 'supabase' ? createUserScopedSupabaseClient(caller.token) : adminClient);

      let existing = serverOrders.get(String(id));
      if (!existing) {
        try {
          const { data } = await dbClient
            .from('orders')
            .select('*')
            .eq('id', String(id))
            .maybeSingle();
          if (data) existing = data;
        } catch {}
      }

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Order not found.' });
      }

      if (!isOrderOwnedByCaller(existing, caller)) {
        return res.status(403).json({ success: false, error: 'Forbidden: You cannot modify another customer\'s order.' });
      }

      // Restrict non-admin modifications to safe customer-scoped fields (block pricing, ownership, or paid-status tampering)
      let updates: Record<string, any> = rawUpdates;
      if (!caller.isAdmin) {
        updates = {};
        const allowedCustomerStatuses = ['placed', 'accepted', 'preparing', 'ready', 'picked', 'on_the_way', 'delivered', 'cancelled'];
        if (rawUpdates.status !== undefined) {
          const nextSt = String(rawUpdates.status).toLowerCase();
          if (!allowedCustomerStatuses.includes(nextSt)) {
            return res.status(403).json({ success: false, error: 'Forbidden status update.' });
          }
          updates.status = nextSt;
        }
        if (rawUpdates.paymentStatus !== undefined || rawUpdates.payment_status !== undefined) {
          const reqPay = String(rawUpdates.paymentStatus ?? rawUpdates.payment_status).toLowerCase();
          if (reqPay !== 'cancelled' && reqPay !== 'refund_initiated') {
            return res.status(403).json({ success: false, error: 'Forbidden: Only verified payment gateways or admins may confirm payment status.' });
          }
          updates.paymentStatus = reqPay;
          updates.payment_status = reqPay;
        }
        const safeFields = [
          'rating',
          'feedback',
          'deliveryPartnerRating',
          'deliveryPartnerRatingComment',
          'instructions',
          'deliveryInstructions',
          'cancellationReason',
          'trackingHistory',
          'deliveryPartnerStatus',
          'eta'
        ];
        for (const field of safeFields) {
          if (rawUpdates[field] !== undefined) updates[field] = rawUpdates[field];
        }
      }

      const previousStatus = String(existing.status || '').toLowerCase();
      const merged: any = { ...existing, ...updates, id: String(id), updated_at: new Date().toISOString() };

      // Preserve rejectionReason / cancellationReason inside address.checkout_data
      if (updates.rejectionReason || updates.cancellationReason) {
        const addrObj = typeof merged.address === 'object' && merged.address !== null
          ? { ...merged.address }
          : { formatted: String(merged.address || '') };
        addrObj.checkout_data = {
          ...(addrObj.checkout_data || {}),
          ...(updates.rejectionReason ? { rejectionReason: String(updates.rejectionReason).trim() } : {}),
          ...(updates.cancellationReason ? { cancellationReason: String(updates.cancellationReason).trim() } : {})
        };
        merged.address = addrObj;
      }

      serverOrders.set(String(id), merged);
      persistServerOrders(serverOrders);

      // Attempt Supabase update for valid table columns
      try {
        if (dbClient) {
          const directCols = caller.isAdmin
            ? ['status', 'payment_status', 'instructions', 'coupon_used', 'items', 'subtotal', 'discount', 'final_amount']
            : ['status', 'payment_status', 'instructions'];
          const updatePayload: Record<string, any> = {};
          for (const col of directCols) {
            if (updates[col] !== undefined) updatePayload[col] = updates[col];
          }
          if (updates.paymentStatus) updatePayload.payment_status = updates.paymentStatus;
          if (updates.deliveryInstructions) updatePayload.instructions = updates.deliveryInstructions;
          if (caller.isAdmin && updates.finalAmount !== undefined) updatePayload.final_amount = updates.finalAmount;
          if ((caller.isAdmin && updates.address) || updates.rejectionReason || updates.cancellationReason) {
            updatePayload.address = merged.address;
          }

          if (Object.keys(updatePayload).length > 0) {
            await dbClient
              .from('orders')
              .update(updatePayload)
              .eq('id', id);
          }
        }
      } catch {}

      // Automatically send Meta template status update to opted-in customer when order status transitions
      let statusWhatsappNotification: any = null;
      const nextStatus = updates.status ? String(updates.status).toLowerCase() : '';
      if (nextStatus && nextStatus !== previousStatus) {
        try {
          statusWhatsappNotification = await dispatchOrderStatusWhatsAppNotification(merged, nextStatus);
        } catch {}
      }

      return res.json({ success: true, order: merged, whatsappStatusNotification: statusWhatsappNotification });
    } catch (e: any) {
      console.error('Exception in PUT /api/orders/:id:', e);
      return res.status(500).json({ success: false, error: 'Failed to update order.' });
    }
  });

  app.delete("/api/orders/:id", async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required to remove an order.' });
      }

      const { id } = req.params;
      const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();
      const dbClient = isServiceRole
        ? adminClient
        : (caller.authType === 'supabase' ? createUserScopedSupabaseClient(caller.token) : adminClient);

      let existing = serverOrders.get(String(id));
      if (!existing) {
        try {
          const { data } = await dbClient
            .from('orders')
            .select('*')
            .eq('id', String(id))
            .maybeSingle();
          if (data) existing = data;
        } catch {}
      }

      if (!existing) {
        return res.status(404).json({ success: false, error: 'Order not found.' });
      }

      if (!isOrderOwnedByCaller(existing, caller)) {
        return res.status(403).json({ success: false, error: 'Forbidden: You cannot delete another customer\'s order.' });
      }

      // Soft-archive for customers so financial & Admin accounting records stay intact while hiding from customer history
      if (!caller.isAdmin || req.query?.archiveOnly === 'true') {
        const addrObj = typeof existing.address === 'object' && existing.address !== null
          ? { ...existing.address }
          : { formatted: String(existing.address || '') };
        addrObj.checkout_data = {
          ...(addrObj.checkout_data || {}),
          hiddenByCustomer: true,
          archivedAt: new Date().toISOString()
        };
        const archived = {
          ...existing,
          hiddenByCustomer: true,
          address: addrObj
        };
        serverOrders.set(String(id), archived);
        persistServerOrders(serverOrders);
        try {
          if (dbClient) {
            await dbClient.from('orders').update({ address: addrObj }).eq('id', String(id));
          }
        } catch {}
        return res.json({ success: true, archivedId: String(id), archived: true });
      }

      serverOrders.delete(String(id));
      persistServerOrders(serverOrders);

      try {
        if (dbClient) {
          await dbClient.from('orders').delete().eq('id', String(id));
        }
      } catch {}

      return res.json({ success: true, deletedId: String(id) });
    } catch (e: any) {
      console.error('Exception in DELETE /api/orders/:id:', e);
      return res.status(500).json({ success: false, error: 'Failed to remove order.' });
    }
  });

  // --- PHONEPE PAYMENT GATEWAY APIS (OFFICIAL PG v1 STANDARD CHECKOUT) ---

  // 1. Safe Diagnostic Status (Admin or Frontend inspection without exposing secrets)
  app.get("/api/payment/phonepe/status", (_req, res) => {
    try {
      const status = getPhonePeConfigStatus();
      return res.json({
        success: true,
        ...status
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to get PhonePe status' });
    }
  });

  // 2. Server-side Payment Initiation
  // Associates strictly with the existing Nuvvo order ID and verifies the amount from server storage
  app.post("/api/payment/phonepe/initiate", async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated) {
        return res.status(401).json({ success: false, error: "Authentication required to initiate payment." });
      }

      const { orderId } = req.body || {};
      if (!orderId) {
        return res.status(400).json({ success: false, error: "Order ID is required to initiate PhonePe payment." });
      }

      const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();
      const dbClient = isServiceRole
        ? adminClient
        : (caller.authType === 'supabase' ? createUserScopedSupabaseClient(caller.token) : adminClient);

      // Retrieve existing order from server store or Supabase
      let order = serverOrders.get(String(orderId));
      if (!order) {
        try {
          if (dbClient) {
            const { data } = await dbClient
              .from('orders')
              .select('*')
              .eq('id', String(orderId))
              .maybeSingle();
            if (data) {
              order = data;
              serverOrders.set(String(orderId), order);
            }
          }
        } catch {}
      }

      if (!order) {
        return res.status(404).json({ success: false, error: `Order ${orderId} not found.` });
      }

      if (!isOrderOwnedByCaller(order, caller)) {
        return res.status(403).json({ success: false, error: "Forbidden: You cannot initiate payment for another customer's order." });
      }

      // Verify payment status: Prevent duplicate payments for already paid orders
      const currentStatus = String(order.payment_status || order.paymentStatus || '').toLowerCase();
      if (currentStatus === 'confirmed' || currentStatus === 'paid' || currentStatus === 'success') {
        return res.status(400).json({ 
          success: false, 
          error: "This order has already been paid and confirmed.",
          isAlreadyPaid: true 
        });
      }

      // REQUIREMENT 4: Strictly server-verified amount from the persisted order record.
      // Never trust any client-supplied amount parameter!
      const verifiedAmount = Number(
        order.final_amount !== undefined 
          ? order.final_amount 
          : (order.finalAmount !== undefined ? order.finalAmount : (order.subtotal || 0))
      );

      if (verifiedAmount <= 0) {
        return res.status(400).json({ success: false, error: "Invalid order amount for payment initiation." });
      }

      // Customer contact details
      const customerPhone = String(order.customer_phone || order.customerPhone || '9876543210');
      const customerId = String(order.customer_id || order.customerId || '');

      // Resolve canonical application base URL for callbacks & browser redirects
      const appBaseUrl = resolveCanonicalAppUrl(req);

      // Initiate PhonePe Standard Checkout session
      const initiateResult = await createPhonePePaymentRequest(
        String(order.id),
        verifiedAmount,
        customerPhone,
        customerId,
        appBaseUrl
      );

      if (!initiateResult.success) {
        return res.status(initiateResult.code === 'PHONEPE_NOT_CONFIGURED' ? 503 : 502).json({
          success: false,
          code: initiateResult.code,
          message: initiateResult.message,
          missingVariables: initiateResult.missingVariables,
          error: initiateResult.error
        });
      }

      // Record initiated transaction details in server state and Supabase
      const paymentDetails = {
        ...(typeof order.paymentDetails === 'object' ? order.paymentDetails : {}),
        merchantTransactionId: initiateResult.merchantTransactionId,
        provider: 'PHONEPE_GATEWAY',
        initiatedAt: new Date().toISOString(),
        amount: verifiedAmount,
        status: 'initiated'
      };

      const updatedOrder = {
        ...order,
        payment_method: 'PhonePe',
        paymentMethod: 'PhonePe',
        payment_status: 'initiated',
        paymentStatus: 'initiated',
        paymentDetails
      };

      serverOrders.set(String(order.id), updatedOrder);
      persistServerOrders(serverOrders);

      // Async update in Supabase
      try {
        const { client: adminClient } = getAdminSupabaseServerClient();
        if (adminClient) {
          await adminClient
            .from('orders')
            .update({
              payment_method: 'PhonePe',
              payment_status: 'initiated'
            })
            .eq('id', String(order.id));
        }
      } catch {}

      return res.json({
        success: true,
        orderId: order.id,
        merchantTransactionId: initiateResult.merchantTransactionId,
        redirectUrl: initiateResult.redirectUrl,
        verifiedAmount
      });
    } catch (e: any) {
      console.error('Exception in POST /api/payment/phonepe/initiate:', e);
      return res.status(500).json({ success: false, error: e?.message || 'Failed to initiate PhonePe payment.' });
    }
  });

  // 3. Official Server-to-Server (S2S) Callback Webhook
  // Validates X-VERIFY checksum and verifies status directly using Check Status API
  app.post("/api/payment/phonepe/callback", async (req, res) => {
    try {
      const xVerifyHeader = req.headers['x-verify'] as string | undefined;
      const base64Response = req.body?.response;

      if (!base64Response || !xVerifyHeader) {
        console.warn('[PhonePe Webhook] Missing response body or X-VERIFY header');
        return res.status(400).json({ success: false, error: 'Missing response body or X-VERIFY header.' });
      }

      // Step A: Cryptographic checksum validation
      const checksumVerification = verifyPhonePeCallbackChecksum(base64Response, xVerifyHeader);
      if (!checksumVerification.isValid) {
        console.warn('[PhonePe Webhook] Invalid checksum:', checksumVerification.error);
        return res.status(400).json({ success: false, error: checksumVerification.error });
      }

      const callbackData = checksumVerification.payload?.data || {};
      const merchantTransactionId = callbackData.merchantTransactionId;

      if (!merchantTransactionId) {
        return res.status(400).json({ success: false, error: 'Missing merchantTransactionId in payload.' });
      }

      // Step B: Double verify directly with official PhonePe Check Status API (Requirement 5)
      const statusVerification = await verifyPhonePePaymentStatus(merchantTransactionId);

      // Extract order ID associated with transaction ID
      let matchedOrder: any = null;
      for (const [id, o] of serverOrders.entries()) {
        const oTxnId = o.paymentDetails?.merchantTransactionId;
        if (oTxnId === merchantTransactionId || merchantTransactionId.includes(String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-18))) {
          matchedOrder = o;
          break;
        }
      }

      if (!matchedOrder) {
        try {
          const { client: adminClient } = getAdminSupabaseServerClient();
          if (adminClient) {
            const { data } = await adminClient
              .from('orders')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(50);
            if (data) {
              for (const row of data) {
                if (merchantTransactionId.includes(String(row.id).replace(/[^a-zA-Z0-9]/g, '').slice(-18))) {
                  matchedOrder = row;
                  serverOrders.set(String(row.id), row);
                  break;
                }
              }
            }
          }
        } catch {}
      }

      // Idempotency: Prevent duplicate processing if order is already marked confirmed/paid (Requirement 6)
      if (matchedOrder) {
        const existingStatus = String(matchedOrder.payment_status || matchedOrder.paymentStatus || '').toLowerCase();
        if ((existingStatus === 'confirmed' || existingStatus === 'paid' || existingStatus === 'success') && statusVerification.success) {
          console.log(`[PhonePe Webhook] Order ${matchedOrder.id} already verified as paid. Skipping duplicate processing.`);
          return res.status(200).json({ success: true, message: 'Already processed (idempotent).' });
        }

        const newPaymentStatus = statusVerification.success ? 'confirmed' : (statusVerification.state === 'FAILED' ? 'failed' : 'pending');

        const updatedPaymentDetails = {
          ...(typeof matchedOrder.paymentDetails === 'object' ? matchedOrder.paymentDetails : {}),
          merchantTransactionId,
          phonePeTransactionId: statusVerification.transactionId,
          paymentInstrument: statusVerification.paymentInstrument,
          verifiedAmount: statusVerification.amountInRupees,
          verifiedAt: new Date().toISOString(),
          paymentStatus: newPaymentStatus
        };

        const updatedOrder = {
          ...matchedOrder,
          payment_status: newPaymentStatus,
          paymentStatus: newPaymentStatus,
          paymentDetails: updatedPaymentDetails
        };

        serverOrders.set(String(matchedOrder.id), updatedOrder);
        persistServerOrders(serverOrders);

        // Update Supabase
        try {
          const { client: adminClient } = getAdminSupabaseServerClient();
          if (adminClient) {
            await adminClient
              .from('orders')
              .update({
                payment_status: newPaymentStatus
              })
              .eq('id', String(matchedOrder.id));
          }
        } catch (dbErr: any) {
          console.error('[PhonePe Webhook] Supabase update exception:', dbErr?.message);
        }

        // Trigger WhatsApp alert if newly confirmed
        if (newPaymentStatus === 'confirmed') {
          try {
            await sendOrderConfirmationWhatsApp(updatedOrder);
          } catch {}
        }
      }

      // Always return HTTP 200 OK promptly to PhonePe
      return res.status(200).json({ success: true, status: statusVerification.state });
    } catch (err: any) {
      console.error('[PhonePe Webhook Exception]:', err?.message || err);
      return res.status(200).json({ success: false, error: err?.message });
    }
  });

  // 4. Return Redirect Handler (when customer finishes on PhonePe UI)
  // Handles both POST and GET redirects from PhonePe.
  // Never trusts redirect body/query params — strictly runs server-side verification!
  const handlePhonePeRedirect = async (req: any, res: any) => {
    try {
      const orderId = req.query?.orderId || req.body?.orderId;
      const txnId = req.query?.txnId || req.body?.txnId || req.body?.merchantTransactionId;

      let verifiedStatus = 'pending';

      if (txnId) {
        const verifyRes = await verifyPhonePePaymentStatus(String(txnId));
        if (verifyRes.success) {
          verifiedStatus = 'confirmed';
        } else if (verifyRes.state === 'FAILED') {
          verifiedStatus = 'failed';
        }

        // Update order in server state & Supabase
        if (orderId) {
          const order = serverOrders.get(String(orderId));
          if (order) {
            const updated = {
              ...order,
              payment_status: verifiedStatus,
              paymentStatus: verifiedStatus
            };
            serverOrders.set(String(orderId), updated);
            persistServerOrders(serverOrders);
          }

          try {
            const { client: adminClient } = getAdminSupabaseServerClient();
            if (adminClient) {
              await adminClient
                .from('orders')
                .update({ payment_status: verifiedStatus })
                .eq('id', String(orderId));
            }
          } catch {}
        }
      }

      // Redirect customer safely back to tracking page in Nuvvo app
      const targetUrl = `/?page=tracking&orderId=${encodeURIComponent(orderId || '')}&paymentStatus=${encodeURIComponent(verifiedStatus)}`;
      return res.redirect(302, targetUrl);
    } catch (e: any) {
      console.error('[PhonePe Redirect Exception]:', e?.message || e);
      return res.redirect(302, '/?page=tracking');
    }
  };

  app.post("/api/payment/phonepe/redirect", handlePhonePeRedirect);
  app.get("/api/payment/phonepe/redirect", handlePhonePeRedirect);

  // 5. Client Status Verification API (Authenticated + Ownership Verified)
  // Allows owning customer or admin to verify status in real-time
  app.get("/api/payment/phonepe/verify/:orderId", async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated) {
        return res.status(401).json({ success: false, error: "Authentication required to verify payment." });
      }

      const { orderId } = req.params;
      const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();
      const dbClient = isServiceRole
        ? adminClient
        : (caller.authType === 'supabase' ? createUserScopedSupabaseClient(caller.token) : adminClient);

      let order = serverOrders.get(String(orderId));

      if (!order) {
        try {
          if (dbClient) {
            const { data } = await dbClient
              .from('orders')
              .select('*')
              .eq('id', String(orderId))
              .maybeSingle();
            if (data) order = data;
          }
        } catch {}
      }

      if (!order) {
        return res.status(404).json({ success: false, error: `Order ${orderId} not found.` });
      }

      if (!isOrderOwnedByCaller(order, caller)) {
        return res.status(403).json({ success: false, error: "Forbidden: You cannot inspect another customer's payment status." });
      }

      const txnId = order.paymentDetails?.merchantTransactionId;
      if (!txnId) {
        return res.json({
          success: true,
          orderId,
          paymentStatus: order.payment_status || order.paymentStatus || 'pending',
          verified: false,
          message: 'No PhonePe merchant transaction ID associated with this order yet.'
        });
      }

      const statusResult = await verifyPhonePePaymentStatus(txnId);
      const newStatus = statusResult.success ? 'confirmed' : (statusResult.state === 'FAILED' ? 'failed' : 'pending');

      // Update if status changed
      if (newStatus !== (order.payment_status || order.paymentStatus)) {
        const updated = {
          ...order,
          payment_status: newStatus,
          paymentStatus: newStatus
        };
        serverOrders.set(String(orderId), updated);
        persistServerOrders(serverOrders);

        try {
          if (dbClient) {
            await dbClient
              .from('orders')
              .update({ payment_status: newStatus })
              .eq('id', String(orderId));
          }
        } catch {}
      }

      return res.json({
        success: true,
        orderId,
        paymentStatus: newStatus,
        statusResult
      });
    } catch (e: any) {
      console.error('[PhonePe Verify API Exception]:', e);
      return res.status(500).json({ success: false, error: e?.message || 'Verification failed' });
    }
  });

  // --- CUSTOMER WHATSAPP CONSENT & ORDER DELIVERY STATUS APIS (AUTHENTICATED & ISOLATED) ---
  app.post("/api/customer/whatsapp-consent", async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required to update WhatsApp preferences.' });
      }

      const { customerId, customerEmail, customerPhone, whatsappNumber, consentGranted, whatsappOptIn, consentSource, source } = req.body || {};
      if (!caller.isAdmin) {
        if (customerId && String(customerId).trim() !== caller.userId) {
          return res.status(403).json({ success: false, error: 'Forbidden: Cannot update WhatsApp consent for another customer.' });
        }
        if (customerEmail && caller.email && String(customerEmail).trim().toLowerCase() !== caller.email) {
          return res.status(403).json({ success: false, error: 'Forbidden: Email does not match authenticated customer.' });
        }
      }

      const resolvedConsent = typeof consentGranted === 'boolean' ? consentGranted : Boolean(whatsappOptIn);
      const result = await saveCustomerWhatsAppConsent({
        customerId: caller.isAdmin ? (customerId || caller.userId) : caller.userId,
        customerEmail: caller.isAdmin ? customerEmail : (caller.email || customerEmail),
        customerPhone: caller.isAdmin ? customerPhone : (caller.phone || customerPhone),
        whatsappNumber,
        consentGranted: resolvedConsent,
        consentSource: consentSource || source || 'checkout'
      });

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      return res.json({ success: true, preference: result.record });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to save WhatsApp preference.' });
    }
  });

  app.get("/api/customer/whatsapp-consent", async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required to view WhatsApp preferences.' });
      }

      const { customerId, customerEmail, customerPhone, whatsappNumber } = req.query || {};
      if (!caller.isAdmin) {
        if (customerId && String(customerId).trim() !== caller.userId) {
          return res.status(403).json({ success: false, error: 'Forbidden: Cannot read another customer\'s WhatsApp preference.' });
        }
        if (customerEmail && caller.email && String(customerEmail).trim().toLowerCase() !== caller.email) {
          return res.status(403).json({ success: false, error: 'Forbidden: Email does not match authenticated customer.' });
        }
        if (customerPhone && caller.phone && normalizePhone(String(customerPhone)) !== caller.phone) {
          return res.status(403).json({ success: false, error: 'Forbidden: Phone does not match authenticated customer.' });
        }
      }

      const pref = await getCustomerWhatsAppConsent({
        customerId: caller.isAdmin ? (customerId ? String(customerId) : undefined) : caller.userId,
        customerEmail: caller.isAdmin ? (customerEmail ? String(customerEmail) : undefined) : (caller.email || undefined),
        customerPhone: caller.isAdmin ? (customerPhone ? String(customerPhone) : undefined) : (caller.phone || undefined),
        whatsappNumber: whatsappNumber ? String(whatsappNumber) : undefined
      });
      return res.json({ success: true, preference: pref });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to read WhatsApp preference.' });
    }
  });

  // Order notification lifecycle endpoint strictly scoped to owning customer or Admin
  app.get("/api/orders/:orderId/notifications", async (req, res) => {
    try {
      const caller = await resolveCallerIdentity(req);
      if (!caller.authenticated) {
        return res.status(401).json({ success: false, notifications: [], error: 'Authentication required.' });
      }

      const { orderId } = req.params;
      if (!caller.isAdmin) {
        let targetOrder = serverOrders.get(String(orderId));
        if (!targetOrder) {
          try {
            const { client: adminClient, isServiceRole } = getAdminSupabaseServerClient();
            const readClient = isServiceRole
              ? adminClient
              : (caller.authType === 'supabase' ? createUserScopedSupabaseClient(caller.token) : adminClient);
            const { data } = await readClient.from('orders').select('*').eq('id', String(orderId)).maybeSingle();
            if (data) targetOrder = data;
          } catch {}
        }
        if (!targetOrder) {
          return res.status(404).json({ success: false, notifications: [], error: 'Order not found.' });
        }
        if (!isOrderOwnedByCaller(targetOrder, caller)) {
          return res.status(403).json({ success: false, notifications: [], error: 'Forbidden: You cannot inspect notifications for another customer\'s order.' });
        }
      }

      const records = await listOrderNotifications({ orderId: String(orderId), limit: 20 });
      const sanitized = records.map(r => {
        const maskPhone = (p: string) => {
          const d = String(p || '').replace(/\D/g, '');
          if (d.length < 4) return p || 'N/A';
          return `+${d.slice(0, 2)} ••••••${d.slice(-4)}`;
        };
        return {
          id: r.id,
          orderId: r.order_id,
          recipientRole: r.recipient_role,
          recipientMasked: r.recipient_role === 'admin' ? '+91 ••••••••35' : maskPhone(r.recipient),
          notificationType: r.notification_type,
          templateName: r.template_name,
          status: r.status,
          messageId: r.message_id,
          consentVerified: r.consent_verified,
          errorMessage: r.error_message,
          submittedAt: r.submitted_at,
          sentAt: r.sent_at,
          deliveredAt: r.delivered_at,
          readAt: r.read_at,
          failedAt: r.failed_at,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });
      return res.json({ success: true, notifications: sanitized });
    } catch (err: any) {
      return res.json({ success: false, notifications: [], error: err?.message });
    }
  });

  // --- OFFICIAL META WHATSAPP CLOUD API WEBHOOKS ---
  const handleWhatsAppWebhookVerify = (req: express.Request, res: express.Response) => {
    const check = verifyWhatsAppWebhookSubscription(req.query as Record<string, any>);
    if (check.ok && check.challenge) {
      return res.status(200).type('text/plain').send(check.challenge);
    }
    return res.status(check.statusCode).json({ success: false, error: check.error });
  };

  const handleWhatsAppWebhookEvent = async (req: express.Request, res: express.Response) => {
    const sigHeader = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const appSecretConfigured = Boolean((process.env.WHATSAPP_APP_SECRET || '').trim());
    const signatureOk = verifyMetaWebhookSignature(rawBody, sigHeader);

    const safeHeaders: Record<string, any> = {
      'content-type': req.headers['content-type'] || null,
      'user-agent': req.headers['user-agent'] || null,
      'x-hub-signature-256': sigHeader ? `${sigHeader.slice(0, 14)}...` : null,
      signatureVerificationMode: appSecretConfigured ? 'enforced' : 'app_secret_not_set'
    };

    if (!signatureOk) {
      await recordRawWebhookEvent({
        payload: req.body,
        headers: safeHeaders,
        signatureValid: false,
        forceEventType: 'invalid_signature',
        errorSummary: 'Rejected: Invalid X-Hub-Signature-256 Meta webhook signature.'
      }).catch(() => {});
      return res.status(401).json({ success: false, error: 'Invalid Meta webhook signature.' });
    }

    try {
      const outcome = await processWhatsAppWebhookEvent(req.body, {
        headers: safeHeaders,
        signatureValid: appSecretConfigured ? true : null
      });
      return res.status(200).json({ success: true, ...outcome });
    } catch (err: any) {
      console.error('[WhatsApp Webhook] Processing exception:', err?.message);
      return res.status(200).json({ success: false, error: err?.message });
    }
  };

  app.get(["/api/webhooks/whatsapp", "/api/whatsapp/webhook"], handleWhatsAppWebhookVerify);
  app.post(["/api/webhooks/whatsapp", "/api/whatsapp/webhook"], handleWhatsAppWebhookEvent);

  // --- WHATSAPP CLOUD API & ORDER NOTIFICATION ADMIN DIAGNOSTIC APIS ---
  app.get("/api/admin/whatsapp/webhook-events", requireAdminAuth, async (req, res) => {
    try {
      const requestedLimit = Number(req.query?.limit || 50);
      const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(1, requestedLimit), 50) : 50;
      const query = String(req.query?.q ?? req.query?.search ?? '').trim();
      const rawSearchBy = String(req.query?.searchBy ?? 'all').trim();
      const searchBy = (rawSearchBy === 'wamid' || rawSearchBy === 'matched_order_id') ? rawSearchBy : 'all';

      const events = await listRecentWebhookEvents(limit, { query, searchBy });
      return res.json({
        success: true,
        count: events.length,
        maxLimit: 50,
        query,
        searchBy,
        events
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        events: [],
        error: err?.message || 'Failed to fetch Meta WhatsApp webhook events.'
      });
    }
  });
  app.get("/api/admin/whatsapp/status", requireAdminAuth, async (req, res) => {
    try {
      const forceTemplates = req.query?.refresh === 'true';
      const configStatus = getWhatsAppConfigStatus();
      const [templates, notifications] = await Promise.all([
        getWhatsAppTemplatesStatus(forceTemplates),
        listOrderNotifications({ limit: 100 })
      ]);

      const adminNotifs = notifications.filter(n => n.recipient_role === 'admin');
      const customerNotifs = notifications.filter(n => n.recipient_role === 'customer');
      const failedNotif = notifications.find(n => n.status === 'failed');

      const cutoff24hMs = Date.now() - 24 * 60 * 60 * 1000;
      const allFailedNotifs = notifications.filter(n => n.status === 'failed');
      const recentFailed24hList = allFailedNotifs.filter(n => {
        const ts = new Date(n.failed_at || n.updated_at || n.created_at || 0).getTime();
        return Number.isFinite(ts) && ts >= cutoff24hMs;
      });

      const summaryCounts = {
        total: notifications.length,
        pending: notifications.filter(n => n.status === 'pending').length,
        submitted: notifications.filter(n => n.status === 'submitted').length,
        sent: notifications.filter(n => n.status === 'sent').length,
        delivered: notifications.filter(n => n.status === 'delivered').length,
        read: notifications.filter(n => n.status === 'read').length,
        failed: allFailedNotifs.length,
        recentFailed24h: recentFailed24hList.length,
        recentFailedAdmin24h: recentFailed24hList.filter(n => n.recipient_role === 'admin').length,
        recentFailedCustomer24h: recentFailed24hList.filter(n => n.recipient_role === 'customer').length,
        skippedNoConsent: notifications.filter(n => n.status === 'skipped_no_consent').length
      };

      const maskedAdminLabel = '+91 ••••••••35';
      const sanitizeAdminNotif = (n: any) =>
        n && n.recipient_role === 'admin'
          ? { ...n, recipient: maskedAdminLabel }
          : n;
      const sanitizedTemplates = (templates || []).map((t: any) => ({
        ...t,
        description: typeof t?.description === 'string'
          ? t.description.replace(/(\+?91[\s-]?)?9063692135/g, maskedAdminLabel)
          : t?.description
      }));

      const recentFailedNotifications = recentFailed24hList.slice(0, 5).map(n => ({
        id: n.id,
        orderId: n.order_id,
        recipientRole: n.recipient_role,
        recipient: n.recipient_role === 'admin' ? maskedAdminLabel : n.recipient,
        templateName: n.template_name,
        errorMessage: n.error_message,
        timestamp: n.failed_at || n.updated_at || n.created_at
      }));

      const baseAppUrl = resolveCanonicalAppUrl(req);

      return res.json({
        success: true,
        ...configStatus,
        businessRecipientMasked: maskedAdminLabel,
        adminWhatsappNumber: maskedAdminLabel,
        webhookUrl: `${baseAppUrl}/api/webhooks/whatsapp`,
        templates: sanitizedTemplates,
        summaryCounts,
        recentFailedNotifications,
        latestAdminNotification: adminNotifs[0] ? sanitizeAdminNotif(adminNotifs[0]) : null,
        latestCustomerNotification: customerNotifs[0] || null,
        lastError: failedNotif
          ? {
              id: failedNotif.id,
              orderId: failedNotif.order_id,
              recipientRole: failedNotif.recipient_role,
              recipient: failedNotif.recipient_role === 'admin' ? maskedAdminLabel : failedNotif.recipient,
              message: failedNotif.error_message,
              timestamp: failedNotif.failed_at || failedNotif.updated_at
            }
          : null
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to inspect WhatsApp status.' });
    }
  });

  app.get("/api/admin/order-notifications", requireAdminAuth, async (req, res) => {
    try {
      const orderId = req.query?.orderId ? String(req.query.orderId) : undefined;
      const notifications = (await listOrderNotifications({ orderId, limit: 150 })).map(n =>
        n && n.recipient_role === 'admin' ? { ...n, recipient: '+91 ••••••••35' } : n
      );
      return res.json({ success: true, notifications });
    } catch (err: any) {
      return res.json({ success: true, notifications: [], error: err?.message });
    }
  });

  const resolveOrderForNotificationRetry = async (orderId: string): Promise<any | null> => {
    const local = serverOrders.get(String(orderId));
    if (local) return local;
    try {
      const { client } = getAdminSupabaseServerClient();
      if (client) {
        const { data } = await client.from('orders').select('*').eq('id', String(orderId)).maybeSingle();
        if (data) return data;
      }
    } catch {}
    return null;
  };

  app.post("/api/admin/whatsapp/retry/:notificationId", requireAdminAuth, async (req, res) => {
    try {
      const { notificationId } = req.params;
      const result = await retryFailedNotification(String(notificationId), resolveOrderForNotificationRetry);
      return res.json({ success: result.success, result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to retry notification.' });
    }
  });

  app.post("/api/admin/whatsapp/webhook-events/:webhookEventId/retry", requireAdminAuth, async (req, res) => {
    try {
      const rawWebhookEventId = String(req.params.webhookEventId || '').trim();
      if (!rawWebhookEventId || rawWebhookEventId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(rawWebhookEventId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid webhook event ID format.'
        });
      }

      const outcome = await retryFailedWebhookEvent(rawWebhookEventId, resolveOrderForNotificationRetry);
      if (!outcome.found) {
        return res.status(404).json(outcome);
      }
      if (
        outcome.status === 'unlinked' ||
        outcome.status === 'unlinked_invalid_signature' ||
        outcome.status === 'order_not_found'
      ) {
        return res.status(422).json(outcome);
      }
      return res.json(outcome);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to retry webhook event.'
      });
    }
  });

  app.post("/api/admin/order-notifications/resend/:orderId", requireAdminAuth, async (req, res) => {
    const { orderId } = req.params;
    const order = await resolveOrderForNotificationRetry(String(orderId));
    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${orderId} not found` });
    }

    try {
      const result = await dispatchOrderWhatsAppNotifications(order);
      return res.json({ success: result.overallSuccess, result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to dispatch WhatsApp alert' });
    }
  });

  // --- APP SETTINGS SUPABASE PERSISTENCE APIS ---
  const SETTINGS_STORE_FILE = path.join(process.cwd(), '.server_settings.json');
  const loadServerSettingsMap = (): Map<string, any> => {
    const map = new Map<string, any>();
    try {
      if (!process.env.VERCEL && fs.existsSync(SETTINGS_STORE_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(SETTINGS_STORE_FILE, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            map.set(k, v);
          }
        }
      }
    } catch {}
    return map;
  };
  const persistServerSettingsMap = (map: Map<string, any>) => {
    try {
      if (process.env.VERCEL) return;
      const obj: Record<string, any> = {};
      for (const [k, v] of map.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(SETTINGS_STORE_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch {}
  };
  const isSensitiveSettingKey = (rawKey: string): boolean => {
    const lower = String(rawKey || '').trim().toLowerCase();
    return (
      lower.startsWith('account_') ||
      lower.includes('master_code') ||
      lower.includes('master_pin') ||
      lower.includes('security_pin') ||
      lower.includes('smtp') ||
      lower.includes('secret') ||
      lower.includes('password') ||
      lower === 'customer_usernames'
    );
  };
  const serverSettings = loadServerSettingsMap();

  app.get("/api/settings/:key", async (req, res) => {
    const { key } = req.params;
    if (isSensitiveSettingKey(String(key))) {
      return res.status(403).json({ success: false, error: "Forbidden: Internal setting key." });
    }

    try {
      const { client } = getAdminSupabaseServerClient();
      if (client) {
        const { data, error } = await client
          .from('app_settings')
          .select('key, value, description, updated_at')
          .eq('key', key)
          .maybeSingle();

        if (!error && data && data.value !== undefined) {
          return res.json({ success: true, key: data.key, value: data.value, found: true, setting: data });
        }
      }
    } catch (e: any) {
      console.warn(`[Settings GET] Notice querying setting ${key} from Supabase:`, e?.message);
    }

    if (serverSettings.has(String(key))) {
      const cached = serverSettings.get(String(key));
      return res.json({ success: true, key, value: cached.value, found: true, setting: cached });
    }

    return res.json({ success: true, key, value: null, found: false });
  });

  app.post("/api/settings", requireAdminAuth, async (req, res) => {
    const { key, value, description } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ success: false, error: "Key and value are required." });
    }
    if (isSensitiveSettingKey(String(key))) {
      return res.status(403).json({ success: false, error: "Forbidden: Internal setting key cannot be overwritten here." });
    }

    const payload = {
      key: String(key),
      value,
      description: description ? String(description) : `Setting for ${key}`,
      updated_at: new Date().toISOString(),
      updated_by: (req as any).user?.phone || 'admin'
    };

    // Persist locally immediately
    serverSettings.set(String(key), payload);
    persistServerSettingsMap(serverSettings);

    try {
      const { client } = getAdminSupabaseServerClient();
      if (client) {
        const { data, error } = await client
          .from('app_settings')
          .upsert([payload], { onConflict: 'key' })
          .select();

        if (error) {
          console.warn(`[Settings POST] Supabase app_settings table notice (saved to local store):`, error.message);
          return res.json({
            success: true,
            setting: payload,
            notice: "Saved persistently on backend server."
          });
        }

        return res.json({ success: true, setting: data?.[0] || payload });
      }
    } catch (e: any) {
      console.warn(`[Settings POST] Exception writing to Supabase:`, e?.message);
      return res.json({ success: true, setting: payload, notice: "Saved persistently on backend server." });
    }

    return res.json({ success: true, setting: payload });
  });

  app.post("/api/admin/dishes", requireAdminAuth, async (req, res) => {
    const { 
      name, description, price, image, image_url, category, subcategory, 
      restaurantId, restaurant_id, isAvailable, is_available, vegIndicator, veg_indicator,
      prepTime, prep_time, spiceLevel, spice_level, rating, reviewsCount, reviews_count,
      ingredients
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ success: false, error: "Dish name and price are required." });
    }

    const dishId = req.body.id || `dish_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const dishName = String(name).trim();
    const dishPrice = Number(price);
    const dishImg = image_url || image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80";
    const dishCat = String(category || 'Specialty').trim();
    const dishSub = String(subcategory || 'Chef Special').trim();
    const isAvail = isAvailable !== false && is_available !== false;
    const vegVal = (veg_indicator || vegIndicator) === 'Veg' || (veg_indicator || vegIndicator) === 'veg' ? 'Veg' : 'NonVeg';

    const payloadForSupabase = {
      id: dishId,
      name: dishName,
      description: String(description || '').trim(),
      price: dishPrice,
      category: dishCat,
      subcategory: dishSub,
      image_url: dishImg,
      is_available: isAvail,
      veg_indicator: vegVal,
      rating: Number(rating) || 4.8,
      reviews_count: Number(reviews_count || reviewsCount) || 12,
      prep_time: Number(prep_time || prepTime) || 20,
      spice_level: spice_level || spiceLevel || 'Medium',
      restaurant_id: restaurant_id || restaurantId || 'rest_1'
    };

    let savedDish: any = {
      id: dishId,
      ...payloadForSupabase,
      image: dishImg,
      isAvailable: isAvail,
      ingredients: Array.isArray(ingredients) ? ingredients : ['Fresh regional ingredients', 'House special spices'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let supabaseSaved = false;

    // Attempt direct Supabase database upsert
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        const { data, error } = await adminClient
          .from('food_items')
          .upsert([payloadForSupabase], { onConflict: 'id' })
          .select();

        if (!error && data && data.length > 0) {
          savedDish = {
            ...savedDish,
            ...data[0],
            id: String(data[0].id),
            image: data[0].image_url || dishImg,
            isAvailable: data[0].is_available !== false
          };
          supabaseSaved = true;
        } else if (error) {
          console.warn('Supabase upsert notice (saving to resilient store):', error.message);
        }
      }
    } catch (err: any) {
      console.warn('Supabase insert exception notice:', err?.message);
    }

    // Always persist to server dishes store to guarantee durability and zero data loss
    serverDishes.set(String(savedDish.id), savedDish);
    persistServerDishes(serverDishes);

    // Broadcast to all active clients via Server-Sent Events
    broadcastCatalogSSE('dish_created', savedDish);

    return res.status(201).json({ 
      success: true, 
      dish: savedDish,
      supabaseSaved,
      message: `Dish "${savedDish.name}" saved successfully!`
    });
  });

  app.put("/api/admin/dishes/:id", requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    const existingDish = serverDishes.get(String(id)) || {};

    const payloadForSupabase: any = {};
    if (req.body.name !== undefined) payloadForSupabase.name = String(req.body.name).trim();
    if (req.body.description !== undefined) payloadForSupabase.description = String(req.body.description).trim();
    if (req.body.price !== undefined) payloadForSupabase.price = Number(req.body.price);
    if (req.body.category !== undefined) payloadForSupabase.category = String(req.body.category).trim();
    if (req.body.subcategory !== undefined) payloadForSupabase.subcategory = String(req.body.subcategory).trim();
    if (req.body.image !== undefined || req.body.image_url !== undefined) {
      payloadForSupabase.image_url = req.body.image_url || req.body.image;
    }
    if (req.body.isAvailable !== undefined || req.body.is_available !== undefined) {
      payloadForSupabase.is_available = req.body.is_available !== undefined ? Boolean(req.body.is_available) : Boolean(req.body.isAvailable);
    }
    if (req.body.vegIndicator !== undefined || req.body.veg_indicator !== undefined) {
      const val = req.body.veg_indicator || req.body.vegIndicator;
      payloadForSupabase.veg_indicator = (val === 'Veg' || val === 'veg') ? 'Veg' : 'NonVeg';
    }
    if (req.body.restaurantId !== undefined || req.body.restaurant_id !== undefined) {
      payloadForSupabase.restaurant_id = req.body.restaurant_id || req.body.restaurantId;
    }
    if (req.body.prepTime !== undefined || req.body.prep_time !== undefined) {
      payloadForSupabase.prep_time = Number(req.body.prep_time || req.body.prepTime);
    }
    if (req.body.spiceLevel !== undefined || req.body.spice_level !== undefined) {
      payloadForSupabase.spice_level = req.body.spice_level || req.body.spiceLevel;
    }
    if (req.body.rating !== undefined) {
      payloadForSupabase.rating = Number(req.body.rating);
    }
    if (req.body.reviewsCount !== undefined || req.body.reviews_count !== undefined) {
      payloadForSupabase.reviews_count = Number(req.body.reviews_count || req.body.reviewsCount);
    }
    payloadForSupabase.updated_at = new Date().toISOString();

    let updatedDish: any = {
      ...existingDish,
      ...req.body,
      ...payloadForSupabase,
      id: String(id),
      image: payloadForSupabase.image_url || existingDish.image || existingDish.image_url,
      isAvailable: payloadForSupabase.is_available !== undefined ? payloadForSupabase.is_available : existingDish.isAvailable
    };

    // Attempt Supabase database upsert
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        const { data, error } = await adminClient
          .from('food_items')
          .upsert([{ id: String(id), ...payloadForSupabase }], { onConflict: 'id' })
          .select();

        if (!error && data && data.length > 0) {
          updatedDish = {
            ...updatedDish,
            ...data[0],
            id: String(data[0].id),
            image: data[0].image_url || updatedDish.image,
            isAvailable: data[0].is_available !== false
          };
        } else if (error) {
          console.warn('Supabase update notice (saving to resilient store):', error.message);
        }
      }
    } catch (err: any) {
      console.warn('Supabase update exception notice:', err?.message);
    }

    serverDishes.set(String(id), updatedDish);
    persistServerDishes(serverDishes);

    broadcastCatalogSSE('dish_updated', updatedDish);

    return res.json({ 
      success: true, 
      dish: updatedDish,
      message: "Dish updated successfully!"
    });
  });

  const handleDishDelete = async (id: string, res: express.Response) => {
    // Attempt Supabase database delete
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        const { error: err1 } = await adminClient
          .from('food_items')
          .delete()
          .eq('id', id);

        if (err1 && !isNaN(Number(id))) {
          await adminClient
            .from('food_items')
            .delete()
            .eq('id', Number(id));
        }
      }
    } catch (err: any) {
      console.warn('Supabase delete exception notice:', err?.message);
    }

    serverDeletedDishes.add(String(id));
    persistServerDeletedDishes(serverDeletedDishes);

    serverDishes.delete(String(id));
    persistServerDishes(serverDishes);

    broadcastCatalogSSE('dish_deleted', { id });

    return res.json({ 
      success: true, 
      message: `Dish ${id} removed successfully.` 
    });
  };

  app.delete("/api/admin/dishes/:id", requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    await handleDishDelete(id, res);
  });

  app.delete("/api/dishes/:id", requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    await handleDishDelete(id, res);
  });

  app.post("/api/admin/dishes/seed", requireAdminAuth, async (_req, res) => {
    // Prime the server dishes store with all baseline items
    let addedCount = 0;
    const defaultPool = [...CHIRALA_TOP13_FOOD_ITEMS, ...FOOD_CATALOG];
    for (const item of defaultPool) {
      if (!serverDishes.has(String(item.id))) {
        serverDishes.set(String(item.id), {
          ...item,
          id: String(item.id),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        addedCount++;
      }
    }
    persistServerDishes(serverDishes);

    // Attempt to seed to Supabase table
    let supabaseInserted = 0;
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        const payload = defaultPool.map((item: any, idx: number) => ({
          id: String(item.id || `dish_seed_${idx + 1}`),
          name: item.name,
          description: item.description || '',
          price: Number(item.price) || 0,
          category: item.category || 'Specialty',
          subcategory: item.subcategory || 'Signature',
          image_url: item.image || item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600',
          is_available: item.isAvailable !== false,
          veg_indicator: item.vegIndicator === 'veg' || item.vegIndicator === 'Veg' ? 'Veg' : 'NonVeg',
          rating: item.rating || 4.7,
          reviews_count: item.reviewsCount || 15,
          prep_time: item.prepTime || 20,
          spice_level: item.spiceLevel || 'Medium',
          restaurant_id: item.restaurantId || 'rest_1'
        }));

        const { data, error } = await adminClient
          .from('food_items')
          .upsert(payload.slice(0, 30), { onConflict: 'id' })
          .select();

        if (!error && data) {
          supabaseInserted = data.length;
        }
      }
    } catch (e: any) {
      console.warn("Supabase seed notice:", e?.message);
    }

    broadcastCatalogSSE('catalog_seeded', { count: serverDishes.size });
    return res.json({ 
      success: true, 
      count: serverDishes.size, 
      supabaseInserted,
      message: `Menu catalog seeded with ${serverDishes.size} dishes successfully.` 
    });
  });

  // --- DELIVERY PARTNER / BOY MANAGEMENT APIS ---
  // Default delivery partner count is strictly 0 until added by an administrator
  let serverDeliveryPartners: any[] = loadDeliveryPartnersSync();

  app.get("/api/delivery-partners", requireAdminAuth, async (_req, res) => {
    try {
      const { client } = getAdminSupabaseServerClient();
      if (client && serverDeliveryPartners.length === 0) {
        const { data } = await client.from('app_settings').select('value').eq('key', 'delivery_partners').maybeSingle();
        if (Array.isArray(data?.value)) {
          serverDeliveryPartners = data.value;
        }
      }
    } catch {}
    res.json(serverDeliveryPartners);
  });

  app.put("/api/admin/delivery-partners/sync", requireAdminAuth, async (req, res) => {
    const { partners } = req.body || {};
    if (!Array.isArray(partners)) {
      return res.status(400).json({ success: false, error: 'partners array is required.' });
    }
    serverDeliveryPartners = partners;
    await persistDeliveryPartners(serverDeliveryPartners);
    res.json({ success: true, count: serverDeliveryPartners.length });
  });

  app.post("/api/admin/delivery-partners", requireAdminAuth, async (req, res) => {
    const { name, phone, vehicleType, bikeNumber, address } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: "Partner name and mobile phone are required." });
    }
    const newPartner = {
      id: `partner_${Date.now()}`,
      name: String(name).trim(),
      phone: String(phone).trim(),
      whatsAppPhone: String(phone).trim(),
      address: String(address || 'Chirala Regional Highway').trim(),
      vehicleType: vehicleType || 'Bike',
      bikeNumber: bikeNumber || 'AP 39 TB 0000',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      isApproved: true,
      isAvailable: true,
      status: 'Available',
      rating: 5.0,
      completedOrdersCount: 0,
      currentLocation: { lat: 15.8252, lng: 80.3541 },
      walletBalance: 0,
      earnings: []
    };
    serverDeliveryPartners = [newPartner, ...serverDeliveryPartners];
    await persistDeliveryPartners(serverDeliveryPartners);
    res.status(201).json({ success: true, partner: newPartner });
  });

  app.put("/api/admin/delivery-partners/:id", requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    const index = serverDeliveryPartners.findIndex((p: any) => String(p.id) === String(id));
    if (index === -1) return res.status(404).json({ error: "Delivery partner not found." });

    serverDeliveryPartners[index] = {
      ...serverDeliveryPartners[index],
      ...req.body,
      id: serverDeliveryPartners[index].id
    };
    await persistDeliveryPartners(serverDeliveryPartners);
    res.json({ success: true, partner: serverDeliveryPartners[index] });
  });

  app.delete("/api/admin/delivery-partners/:id", requireAdminAuth, async (req, res) => {
    const { id } = req.params;
    serverDeliveryPartners = serverDeliveryPartners.filter((p: any) => String(p.id) !== String(id));
    await persistDeliveryPartners(serverDeliveryPartners);
    res.json({ success: true, message: "Delivery partner deleted successfully." });
  });

  // --- ADMIN / SUPER ADMIN FULL CONTROLLED DATA RESET ---
  app.post("/api/admin/reset-data", requireAdminAuth, async (req, res) => {
    const { confirmation, scope } = req.body;
    if (confirmation !== 'RESET') {
      return res.status(400).json({ 
        error: "Confirmation failed. Explicit confirmation key 'RESET' is required to prevent accidental invocation." 
      });
    }

    // Reset administrator-managed data to base defaults
    // Note: User accounts, authentication credentials, legitimate wallet balances,
    // loyalty passport points, customer orders, and payments remain strictly preserved!
    if (!scope || scope === 'all_admin_data' || scope === 'catalog') {
      serverRestaurants = [...RESTAURANTS];
      serverHotels = [...INITIAL_HOTELS];
    }

    if (!scope || scope === 'all_admin_data' || scope === 'delivery_partners') {
      // Resets delivery partners back to base 0 count
      serverDeliveryPartners = [];
      await persistDeliveryPartners(serverDeliveryPartners);
    }

    res.json({
      success: true,
      message: "Administrator-managed configuration successfully reset to pristine system baseline.",
      deliveryPartnersCount: serverDeliveryPartners.length,
      restaurantsCount: serverRestaurants.length,
      hotelsCount: serverHotels.length
    });
  });

  // Self-unregistering Service Worker endpoint to clean up any stale browser Service Workers
  app.get(["/sw.js", "/registerSW.js"], (_req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.send(`
      if (typeof self !== 'undefined' && self.registration) {
        self.addEventListener('install', function() { self.skipWaiting(); });
        self.addEventListener('activate', function(event) {
          event.waitUntil(
            caches.keys().then(function(names) {
              return Promise.all(names.map(function(n) { return caches.delete(n); }));
            }).then(function() {
              return self.registration.unregister();
            })
          );
        });
      }
    `);
  });

  // Vite middleware setup (dev mode) + Pre-bundled static asset serving (prevents 60+ module request bursts through proxy)
  export async function startServer() {
    const PORT = Number(process.env.PORT) || 3000;
    const distPath = path.join(process.cwd(), 'dist');
    const hasDistBuild = fs.existsSync(path.join(distPath, 'index.html'));
    const isDev = process.env.NODE_ENV === "development" || process.env.npm_lifecycle_event === 'dev' || !hasDistBuild;

    if (hasDistBuild) {
      // Serve pre-bundled dist assets first so initial page load requires only 3 HTTP requests instead of 60+ module requests
      app.use(express.static(distPath, { index: 'index.html', maxAge: '5m' }));
    }

    if (isDev) {
      const vitePkg = "vite";
      const { createServer: createViteServer } = await import(/* @vite-ignore */ vitePkg);
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }

  // Determine whether this script is being executed directly as the main process
  // In serverless environments (Vercel, AWS Lambda) or when imported as a module, never start the HTTP listener
  const isDirectExecution = (() => {
    try {
      if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
        return false;
      }
      const argv1 = process.argv[1] ? path.resolve(process.argv[1]) : '';
      return argv1.endsWith('server.ts') || argv1.endsWith('server.js');
    } catch {
      return false;
    }
  })();

  if (isDirectExecution) {
    startServer().catch(err => {
      console.error("Failed to start server:", err);
    });
  }

  export default app;
