/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NUVVO — Official Meta WhatsApp Cloud API Notification Service
 *
 * Features:
 * - Strict server-side Meta Graph API integration (v21.0+ configurable via WHATSAPP_GRAPH_API_VERSION)
 * - Fixed Admin alert recipient (+919063692135) on every new order
 * - Verified & consented Customer WhatsApp number resolution (never assumes email = phone or phone = consent)
 * - Transactional Outbox + Idempotency Key deduplication preventing duplicate alerts on API retries
 * - 7 Meta-approved template definitions + live WABA template approval status sync
 * - Full delivery lifecycle tracking: pending -> submitted -> sent -> delivered -> read | failed
 * - Meta webhook subscription verification & event processing (delivery statuses + STOP opt-out)
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getAdminSupabaseServerClient } from '../utils/supabase/server.ts';

export const FIXED_ADMIN_WHATSAPP_RAW = '9063692135';
export const FIXED_ADMIN_WHATSAPP_E164 = '+919063692135';
export const FIXED_ADMIN_WHATSAPP_DIGITS = '919063692135';

export type NotificationLifecycleStatus =
  | 'pending'
  | 'submitted'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'skipped_no_consent'
  | 'duplicate_skipped';

export type NotificationType =
  | 'admin_new_order'
  | 'customer_order_confirmation'
  | 'order_accepted'
  | 'order_preparing'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_cancelled';

export interface WhatsAppTemplateDefinition {
  key: NotificationType;
  label: string;
  recipientRole: 'admin' | 'customer';
  templateName: string;
  category: 'UTILITY';
  language: string;
  description: string;
  parameterLabels: string[];
}

export const WHATSAPP_TEMPLATE_DEFINITIONS: WhatsAppTemplateDefinition[] = [
  {
    key: 'admin_new_order',
    label: 'Admin New Order Notification',
    recipientRole: 'admin',
    templateName: process.env.WHATSAPP_TEMPLATE_ADMIN_NEW_ORDER || 'nuvvo_admin_new_order',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent automatically to +919063692135 whenever a new order is placed.',
    parameterLabels: [
      'Order ID',
      'Customer Name',
      'Customer Phone',
      'Customer Email',
      'Restaurant Name',
      'Food Items & Quantities & Item Prices',
      'Total Amount',
      'Payment Method & Payment Status',
      'Delivery Address',
      'Order Time'
    ]
  },
  {
    key: 'customer_order_confirmation',
    label: 'Customer Order Confirmation',
    recipientRole: 'customer',
    templateName: process.env.WHATSAPP_TEMPLATE_CUSTOMER_CONFIRMATION || 'nuvvo_customer_order_confirmation',
    category: 'UTILITY',
    language: 'en',
    description: 'Sent automatically to opted-in customers upon successful order placement.',
    parameterLabels: [
      'Customer Name',
      'Order ID',
      'Restaurant Name',
      'Ordered Food Items & Quantities',
      'Total Amount',
      'Payment Method & Payment Status',
      'Delivery Address',
      'Current Order Status'
    ]
  },
  {
    key: 'order_accepted',
    label: 'Order Accepted',
    recipientRole: 'customer',
    templateName: process.env.WHATSAPP_TEMPLATE_ORDER_ACCEPTED || 'nuvvo_order_accepted',
    category: 'UTILITY',
    language: 'en',
    description: 'Notifies opted-in customer when the restaurant accepts the order.',
    parameterLabels: ['Customer Name', 'Order ID', 'Restaurant Name', 'Current Order Status']
  },
  {
    key: 'order_preparing',
    label: 'Preparing',
    recipientRole: 'customer',
    templateName: process.env.WHATSAPP_TEMPLATE_ORDER_PREPARING || 'nuvvo_order_preparing',
    category: 'UTILITY',
    language: 'en',
    description: 'Notifies opted-in customer when kitchen starts preparing food.',
    parameterLabels: ['Customer Name', 'Order ID', 'Restaurant Name', 'Ordered Food Items']
  },
  {
    key: 'order_out_for_delivery',
    label: 'Out for Delivery',
    recipientRole: 'customer',
    templateName: process.env.WHATSAPP_TEMPLATE_ORDER_OUT_FOR_DELIVERY || 'nuvvo_order_out_for_delivery',
    category: 'UTILITY',
    language: 'en',
    description: 'Notifies opted-in customer when rider picks up and is en route.',
    parameterLabels: ['Customer Name', 'Order ID', 'Delivery Partner & Phone', 'Delivery Address']
  },
  {
    key: 'order_delivered',
    label: 'Delivered',
    recipientRole: 'customer',
    templateName: process.env.WHATSAPP_TEMPLATE_ORDER_DELIVERED || 'nuvvo_order_delivered',
    category: 'UTILITY',
    language: 'en',
    description: 'Notifies opted-in customer when order is delivered.',
    parameterLabels: ['Customer Name', 'Order ID', 'Restaurant Name', 'Total Amount']
  },
  {
    key: 'order_cancelled',
    label: 'Cancelled',
    recipientRole: 'customer',
    templateName: process.env.WHATSAPP_TEMPLATE_ORDER_CANCELLED || 'nuvvo_order_cancelled',
    category: 'UTILITY',
    language: 'en',
    description: 'Notifies opted-in customer when order is cancelled.',
    parameterLabels: ['Customer Name', 'Order ID', 'Payment Status / Refund Info']
  }
];

export interface WhatsAppTemplateStatusItem extends WhatsAppTemplateDefinition {
  approvalStatus: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'MISSING_ON_META' | 'NOT_CONFIGURED';
  metaTemplateId?: string;
  rejectedReason?: string;
  source: 'meta_graph_api' | 'local_definition';
}

export interface OrderNotificationRecord {
  id: string;
  order_id: string;
  channel: 'whatsapp';
  recipient: string;
  recipient_role: 'admin' | 'customer';
  notification_type: NotificationType;
  template_name: string;
  status: NotificationLifecycleStatus;
  idempotency_key: string;
  attempt_count: number;
  consent_verified: boolean;
  message_id: string | null;
  payload: any;
  response_payload: any;
  webhook_events: any[];
  error_message: string | null;
  submitted_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerWhatsAppConsentRecord {
  id: string;
  customer_id?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  whatsapp_number: string; // E.164 +91XXXXXXXXXX
  consent_granted: boolean;
  consent_source: string;
  consent_timestamp: string | null;
  opt_out_timestamp: string | null;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppConfigStatus {
  isConfigured: boolean;
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  hasBusinessAccountId: boolean;
  hasVerifyToken: boolean;
  graphApiVersion: string;
  hasExplicitGraphVersion: boolean;
  adminWhatsappNumber: string;
  businessRecipientMasked: string;
  phoneNumberIdMasked: string;
  businessAccountIdMasked: string;
  missingVars: string[];
  requiredSetupSteps: string[];
}

export interface WhatsAppDispatchResult {
  success: boolean;
  status: NotificationLifecycleStatus;
  deduplicated?: boolean;
  notificationId?: string;
  messageId?: string;
  orderId: string;
  recipientRole: 'admin' | 'customer';
  recipient?: string;
  templateName?: string;
  error?: string;
  timestamp: string;
}

export interface DualOrderDispatchResult {
  orderId: string;
  adminNotification: WhatsAppDispatchResult;
  customerNotification: WhatsAppDispatchResult;
  overallSuccess: boolean;
  timestamp: string;
}

export interface RawWebhookEventRecord {
  id: string;
  received_at: string;
  event_type: 'status' | 'message' | 'opt_out' | 'mixed' | 'invalid_signature' | 'unknown';
  signature_valid: boolean | null;
  wamid: string | null;
  status_summary: string | null;
  phone_number_id: string | null;
  recipient_or_sender: string | null;
  matched_notification_id: string | null;
  matched_order_id: string | null;
  processed_statuses: number;
  processed_opt_outs: number;
  error_summary: string | null;
  raw_headers: Record<string, any>;
  raw_payload: any;
}

// Durable local mirrors (safe fallback when Supabase tables aren't yet migrated or service role is absent; disabled in read-only Vercel runtime)
const OUTBOX_FILE = path.join(process.cwd(), '.server_whatsapp_outbox.json');
const CONSENTS_FILE = path.join(process.cwd(), '.server_whatsapp_consents.json');
const WEBHOOK_EVENTS_FILE = path.join(process.cwd(), '.server_whatsapp_webhook_events.json');

const inMemoryOutbox = new Map<string, OrderNotificationRecord>();
const inMemoryConsents = new Map<string, CustomerWhatsAppConsentRecord>();
const inMemoryWebhookEvents = new Map<string, RawWebhookEventRecord>();
const inFlightIdempotencyKeys = new Set<string>();

let cachedMetaTemplates: { fetchedAt: number; items: Map<string, { id?: string; status: string; rejected_reason?: string }> } | null = null;

function loadLocalStores() {
  if (inMemoryOutbox.size === 0) {
    try {
      if (fs.existsSync(OUTBOX_FILE)) {
        const arr = JSON.parse(fs.readFileSync(OUTBOX_FILE, 'utf8'));
        if (Array.isArray(arr)) {
          for (const rec of arr) {
            if (rec?.id) inMemoryOutbox.set(rec.id, rec);
          }
        }
      }
    } catch {}
  }
  if (inMemoryConsents.size === 0) {
    try {
      if (fs.existsSync(CONSENTS_FILE)) {
        const arr = JSON.parse(fs.readFileSync(CONSENTS_FILE, 'utf8'));
        if (Array.isArray(arr)) {
          for (const rec of arr) {
            if (rec?.id) inMemoryConsents.set(rec.id, rec);
          }
        }
      }
    } catch {}
  }
  if (inMemoryWebhookEvents.size === 0) {
    try {
      if (fs.existsSync(WEBHOOK_EVENTS_FILE)) {
        const arr = JSON.parse(fs.readFileSync(WEBHOOK_EVENTS_FILE, 'utf8'));
        if (Array.isArray(arr)) {
          for (const rec of arr) {
            if (rec?.id) inMemoryWebhookEvents.set(rec.id, rec);
          }
        }
      }
    } catch {}
  }
}

function persistLocalOutbox() {
  try {
    if (process.env.VERCEL) return;
    const arr = Array.from(inMemoryOutbox.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 500);
    fs.writeFileSync(OUTBOX_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch {}
}

function persistLocalConsents() {
  try {
    if (process.env.VERCEL) return;
    const arr = Array.from(inMemoryConsents.values());
    fs.writeFileSync(CONSENTS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch {}
}

function persistLocalWebhookEvents() {
  try {
    if (process.env.VERCEL) return;
    const arr = Array.from(inMemoryWebhookEvents.values())
      .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
      .slice(0, 100);
    fs.writeFileSync(WEBHOOK_EVENTS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch {}
}

loadLocalStores();

/**
 * Validates and normalizes phone numbers into Meta WhatsApp Cloud API format.
 * Explicitly rejects emails or non-phone values.
 */
export function parseValidWhatsAppPhone(input?: string | null): {
  valid: boolean;
  e164: string; // "+919063692135"
  digits: string; // "919063692135" (required by Meta Cloud API `to`)
  local10: string;
  reason?: string;
} {
  if (!input || typeof input !== 'string') {
    return { valid: false, e164: '', digits: '', local10: '', reason: 'No WhatsApp mobile number provided.' };
  }

  const trimmed = input.trim();
  if (trimmed.includes('@')) {
    return { valid: false, e164: '', digits: '', local10: '', reason: 'Email address cannot be used as a WhatsApp number.' };
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) {
    return { valid: false, e164: '', digits: '', local10: '', reason: 'WhatsApp number must contain digits.' };
  }

  // Strip leading 0 if 11 digits starting with 0 (e.g. 09876543210)
  const normalizedInput = digitsOnly.length === 11 && digitsOnly.startsWith('0')
    ? digitsOnly.slice(1)
    : digitsOnly;

  // 10-digit Indian mobile number
  if (normalizedInput.length === 10) {
    if (!/^[6-9]\d{9}$/.test(normalizedInput)) {
      return { valid: false, e164: '', digits: '', local10: '', reason: 'Invalid 10-digit Indian mobile number.' };
    }
    return {
      valid: true,
      e164: `+91${normalizedInput}`,
      digits: `91${normalizedInput}`,
      local10: normalizedInput
    };
  }

  // 12-digit Indian number with 91 prefix
  if (normalizedInput.length === 12 && normalizedInput.startsWith('91')) {
    const local10 = normalizedInput.slice(2);
    if (!/^[6-9]\d{9}$/.test(local10)) {
      return { valid: false, e164: '', digits: '', local10: '', reason: 'Invalid Indian mobile number with +91 prefix.' };
    }
    return {
      valid: true,
      e164: `+${normalizedInput}`,
      digits: normalizedInput,
      local10
    };
  }

  // General international E.164 fallback (10-15 digits)
  if (normalizedInput.length >= 10 && normalizedInput.length <= 15) {
    return {
      valid: true,
      e164: `+${normalizedInput}`,
      digits: normalizedInput,
      local10: normalizedInput.slice(-10)
    };
  }

  return {
    valid: false,
    e164: '',
    digits: '',
    local10: '',
    reason: 'WhatsApp number must be a valid 10-digit mobile or E.164 international number.'
  };
}

export function normalizeWhatsAppPhoneNumber(phone: string): string {
  const parsed = parseValidWhatsAppPhone(phone);
  return parsed.valid ? parsed.digits : String(phone || '').replace(/\D/g, '');
}

/**
 * Returns live Meta WhatsApp Cloud API credential configuration status without exposing secrets.
 */
export function getWhatsAppConfigStatus(): WhatsAppConfigStatus {
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const businessAccountId = (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim();
  const verifyToken = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
  const explicitVersion = (process.env.WHATSAPP_GRAPH_API_VERSION || '').trim();
  const graphApiVersion = explicitVersion || 'v21.0';

  const missing: string[] = [];
  if (!token) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!phoneId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!businessAccountId) missing.push('WHATSAPP_BUSINESS_ACCOUNT_ID');
  if (!verifyToken) missing.push('WHATSAPP_VERIFY_TOKEN');

  const maskId = (val: string) => {
    if (!val || val.length <= 4) return val ? '••••' : 'Not configured';
    return `${val.slice(0, 4)}••••${val.slice(-4)}`;
  };

  const requiredSetupSteps: string[] = [];
  if (!token || !phoneId || !businessAccountId) {
    requiredSetupSteps.push(
      'Create/verify Meta Business Portfolio and WhatsApp Business Account (WABA) in Meta Business Suite.',
      'Register and verify a business phone number in WhatsApp Manager and copy WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_ACCOUNT_ID.',
      'Create a Permanent System User Access Token with whatsapp_business_messaging and whatsapp_business_management permissions and set WHATSAPP_ACCESS_TOKEN.'
    );
  }
  if (!verifyToken) {
    requiredSetupSteps.push(
      'Set WHATSAPP_VERIFY_TOKEN and register https://<your-domain>/api/webhooks/whatsapp in Meta Developer App -> WhatsApp -> Configuration (subscribe to "messages").'
    );
  }
  requiredSetupSteps.push(
    'Submit and obtain Meta APPROVED status for the 7 UTILITY templates (nuvvo_admin_new_order, nuvvo_customer_order_confirmation, nuvvo_order_accepted, nuvvo_order_preparing, nuvvo_order_out_for_delivery, nuvvo_order_delivered, nuvvo_order_cancelled).'
  );

  return {
    isConfigured: Boolean(token && phoneId && businessAccountId && verifyToken),
    hasAccessToken: Boolean(token),
    hasPhoneNumberId: Boolean(phoneId),
    hasBusinessAccountId: Boolean(businessAccountId),
    hasVerifyToken: Boolean(verifyToken),
    graphApiVersion,
    hasExplicitGraphVersion: Boolean(explicitVersion),
    adminWhatsappNumber: FIXED_ADMIN_WHATSAPP_E164,
    businessRecipientMasked: '+91 ••••••2135',
    phoneNumberIdMasked: maskId(phoneId),
    businessAccountIdMasked: maskId(businessAccountId),
    missingVars: missing,
    requiredSetupSteps
  };
}

/**
 * Fetches genuine template approval statuses from Meta Graph API when credentials exist.
 * Never fakes APPROVAL status when Meta API or WABA ID is missing.
 */
export async function getWhatsAppTemplatesStatus(forceRefresh = false): Promise<WhatsAppTemplateStatusItem[]> {
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const wabaId = (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim();
  const version = (process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0').trim();

  if (!token || !wabaId) {
    return WHATSAPP_TEMPLATE_DEFINITIONS.map(def => ({
      ...def,
      approvalStatus: 'NOT_CONFIGURED',
      source: 'local_definition'
    }));
  }

  const cacheFresh = cachedMetaTemplates && Date.now() - cachedMetaTemplates.fetchedAt < 60_000;
  let metaMap = cacheFresh ? cachedMetaTemplates!.items : null;

  if (!metaMap || forceRefresh) {
    metaMap = new Map();
    try {
      const url = `https://graph.facebook.com/${version}/${wabaId}/message_templates?fields=id,name,status,rejected_reason&limit=100`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const json = await resp.json().catch(() => null);
      if (resp.ok && Array.isArray(json?.data)) {
        for (const tpl of json.data) {
          if (tpl?.name) {
            metaMap.set(String(tpl.name), {
              id: tpl.id ? String(tpl.id) : undefined,
              status: String(tpl.status || 'PENDING').toUpperCase(),
              rejected_reason: tpl.rejected_reason ? String(tpl.rejected_reason) : undefined
            });
          }
        }
        cachedMetaTemplates = { fetchedAt: Date.now(), items: metaMap };
      }
    } catch (err: any) {
      console.warn('[WhatsApp Templates] Meta Graph API template check warning:', err?.message);
    }
  }

  return WHATSAPP_TEMPLATE_DEFINITIONS.map(def => {
    const found = metaMap?.get(def.templateName);
    if (!found) {
      return {
        ...def,
        approvalStatus: metaMap && metaMap.size > 0 ? 'MISSING_ON_META' : 'NOT_CONFIGURED',
        source: metaMap && metaMap.size > 0 ? 'meta_graph_api' : 'local_definition'
      };
    }

    const normalizedStatus = (['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'].includes(found.status)
      ? found.status
      : 'PENDING') as WhatsAppTemplateStatusItem['approvalStatus'];

    return {
      ...def,
      approvalStatus: normalizedStatus,
      metaTemplateId: found.id,
      rejectedReason: found.rejected_reason,
      source: 'meta_graph_api'
    };
  });
}

export function formatOrderDateTimeIST(dateString?: string): string {
  try {
    const d = dateString ? new Date(dateString) : new Date();
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: true
    }).format(d);
  } catch {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  }
}

function sanitizeTemplateParam(val: string | number | undefined | null, maxLen = 900): string {
  const str = String(val ?? 'N/A')
    .replace(/[\r\n\t]+/g, ', ')
    .replace(/\s{4,}/g, ' ')
    .trim();
  if (!str) return 'N/A';
  return str.length > maxLen ? `${str.slice(0, maxLen - 3)}...` : str;
}

function formatPaymentStatusLabel(order: any): string {
  const method = String(order.paymentMethod || order.payment_method || 'UPI').toUpperCase();
  const status = String(order.paymentStatus || order.payment_status || 'pending').toUpperCase();

  if (status === 'CONFIRMED' || status === 'SUCCESS' || status === 'PAID') {
    return 'PAID (Confirmed)';
  }
  if (method.includes('COD') || method.includes('DELIVERY')) {
    return status === 'CANCELLED' ? 'Cancelled' : 'Pending (Pay on Delivery)';
  }
  if (status === 'FAILED') return 'Payment Failed';
  if (status === 'REFUND_INITIATED') return 'Refund Initiated';
  if (status === 'AWAITING_CONFIRMATION') return 'Awaiting Verification';
  return status || 'Pending';
}

function formatOrderStatusLabel(status?: string): string {
  const s = String(status || 'accepted').toLowerCase();
  if (s === 'accepted') return 'Order Accepted';
  if (s === 'preparing') return 'Preparing in Kitchen';
  if (s === 'picked' || s === 'on_the_way') return 'Out for Delivery';
  if (s === 'delivered') return 'Delivered';
  if (s === 'cancelled') return 'Cancelled';
  return s.toUpperCase();
}

function extractAddressString(order: any): string {
  if (!order?.address) return 'Chirala Regional Delivery';
  if (typeof order.address === 'string') return order.address;
  const a = order.address;
  if (a.fullAddress && String(a.fullAddress).trim()) return String(a.fullAddress).trim();
  const parts = [
    a.houseNumber || a.flatNo,
    a.streetName || a.street,
    a.locality || a.area,
    a.landmark ? `Near ${a.landmark}` : '',
    a.city || 'Chirala',
    a.pincode || ''
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : (a.formatted || 'Chirala Delivery');
}

function extractOrderContext(order: any) {
  const orderId = String(order.id || '');
  const shortOrderId = orderId.replace(/^order_/, '').slice(-10).toUpperCase() || orderId;
  const customerName = String(order.customerName || order.customer_name || 'Customer').trim();
  const customerPhone = String(order.customerPhone || order.customer_phone || 'Not provided').trim();
  const customerEmail = String(
    order.customerEmail ||
    order.customer_email ||
    order.address?.checkout_data?.customerEmail ||
    'Not provided'
  ).trim();

  const items = Array.isArray(order.items) ? order.items : [];
  const restaurantName = String(
    order.restaurantName ||
    order.restaurant_name ||
    items[0]?.foodItem?.restaurantName ||
    items[0]?.restaurantName ||
    order.address?.checkout_data?.restaurantName ||
    'Nuvvo Kitchen Partner'
  ).trim();

  const adminItemsSummary = items.map((it: any, idx: number) => {
    const name = it.foodItem?.name || it.name || `Item ${idx + 1}`;
    const qty = Number(it.quantity || 1);
    const unitPrice = Number(it.foodItem?.discountPrice || it.foodItem?.price || it.price || 0);
    const lineTotal = unitPrice * qty;
    return `${qty}x ${name} @ ₹${unitPrice} = ₹${lineTotal}`;
  }).join(' | ') || 'Standard Menu Order';

  const customerItemsSummary = items.map((it: any, idx: number) => {
    const name = it.foodItem?.name || it.name || `Item ${idx + 1}`;
    const qty = Number(it.quantity || 1);
    return `${qty}x ${name}`;
  }).join(', ') || 'Standard Menu Order';

  const finalAmount = Number(order.finalAmount !== undefined ? order.finalAmount : (order.final_amount || 0));
  const paymentMethod = String(order.paymentMethod || order.payment_method || 'UPI');
  const paymentStatus = formatPaymentStatusLabel(order);
  const deliveryAddress = extractAddressString(order);
  const orderTime = `${formatOrderDateTimeIST(order.date || order.created_at)} IST`;
  const currentStatusLabel = formatOrderStatusLabel(order.status);

  return {
    orderId,
    shortOrderId,
    customerName,
    customerPhone,
    customerEmail,
    restaurantName,
    adminItemsSummary,
    customerItemsSummary,
    totalAmountFormatted: `₹${finalAmount}`,
    paymentMethod,
    paymentStatus,
    deliveryAddress,
    orderTime,
    currentStatusLabel
  };
}

/**
 * Generates readable Admin New Order Notification summary text (for logs/audit + preview).
 */
export function buildAdminOrderNotificationSummary(order: any): string {
  const ctx = extractOrderContext(order);
  return [
    'New Nuvvo Order Received',
    `Order ID: ${ctx.orderId}`,
    `Customer Name: ${ctx.customerName}`,
    `Customer Phone: ${ctx.customerPhone}`,
    `Customer Email: ${ctx.customerEmail}`,
    `Restaurant Name: ${ctx.restaurantName}`,
    `Food Items, Quantities & Item Prices: ${ctx.adminItemsSummary}`,
    `Total Amount: ${ctx.totalAmountFormatted}`,
    `Payment Method: ${ctx.paymentMethod}`,
    `Payment Status: ${ctx.paymentStatus}`,
    `Delivery Address: ${ctx.deliveryAddress}`,
    `Order Time: ${ctx.orderTime}`
  ].join('\n');
}

/**
 * Generates readable Customer Order Confirmation summary text (for logs/audit + preview).
 */
export function buildCustomerOrderConfirmationSummary(order: any): string {
  const ctx = extractOrderContext(order);
  return [
    'Nuvvo Order Confirmation',
    `Customer Name: ${ctx.customerName}`,
    `Order ID: ${ctx.orderId}`,
    `Restaurant Name: ${ctx.restaurantName}`,
    `Ordered Food Items & Quantities: ${ctx.customerItemsSummary}`,
    `Total Amount: ${ctx.totalAmountFormatted}`,
    `Payment Method: ${ctx.paymentMethod}`,
    `Payment Status: ${ctx.paymentStatus}`,
    `Delivery Address: ${ctx.deliveryAddress}`,
    `Current Order Status: ${ctx.currentStatusLabel}`
  ].join('\n');
}

export const buildStructuredOrderMessage = buildAdminOrderNotificationSummary;

/**
 * Builds official Meta Cloud API `template` payload for each notification type.
 */
function buildMetaTemplateRequestPayload(
  recipientDigits: string,
  notificationType: NotificationType,
  order: any
) {
  const def = WHATSAPP_TEMPLATE_DEFINITIONS.find(t => t.key === notificationType)!;
  const ctx = extractOrderContext(order);

  let bodyParams: string[] = [];

  if (notificationType === 'admin_new_order') {
    bodyParams = [
      ctx.orderId,
      ctx.customerName,
      ctx.customerPhone,
      ctx.customerEmail,
      ctx.restaurantName,
      ctx.adminItemsSummary,
      ctx.totalAmountFormatted,
      `${ctx.paymentMethod} (${ctx.paymentStatus})`,
      ctx.deliveryAddress,
      ctx.orderTime
    ];
  } else if (notificationType === 'customer_order_confirmation') {
    bodyParams = [
      ctx.customerName,
      ctx.orderId,
      ctx.restaurantName,
      ctx.customerItemsSummary,
      ctx.totalAmountFormatted,
      `${ctx.paymentMethod} (${ctx.paymentStatus})`,
      ctx.deliveryAddress,
      ctx.currentStatusLabel
    ];
  } else if (notificationType === 'order_accepted') {
    bodyParams = [ctx.customerName, ctx.orderId, ctx.restaurantName, 'Order Accepted'];
  } else if (notificationType === 'order_preparing') {
    bodyParams = [ctx.customerName, ctx.orderId, ctx.restaurantName, ctx.customerItemsSummary];
  } else if (notificationType === 'order_out_for_delivery') {
    const riderInfo = order.deliveryPartnerName
      ? `${order.deliveryPartnerName}${order.deliveryPartnerPhone ? ` (+91 ${order.deliveryPartnerPhone})` : ''}`
      : 'Assigned Nuvvo Delivery Partner';
    bodyParams = [ctx.customerName, ctx.orderId, riderInfo, ctx.deliveryAddress];
  } else if (notificationType === 'order_delivered') {
    bodyParams = [ctx.customerName, ctx.orderId, ctx.restaurantName, ctx.totalAmountFormatted];
  } else {
    bodyParams = [ctx.customerName, ctx.orderId, ctx.paymentStatus];
  }

  return {
    templateName: def.templateName,
    requestBody: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientDigits,
      type: 'template',
      template: {
        name: def.templateName,
        language: { code: def.language },
        components: [
          {
            type: 'body',
            parameters: bodyParams.map(val => ({
              type: 'text',
              text: sanitizeTemplateParam(val)
            }))
          }
        ]
      }
    }
  };
}

/**
 * Persists or updates a notification record in both local outbox store and Supabase `order_notifications`.
 */
async function saveOutboxRecord(record: OrderNotificationRecord): Promise<void> {
  inMemoryOutbox.set(record.id, record);
  persistLocalOutbox();

  try {
    const { client } = getAdminSupabaseServerClient();
    if (!client) return;

    const fullRow: Record<string, any> = {
      id: record.id,
      order_id: record.order_id,
      channel: 'whatsapp',
      recipient: record.recipient,
      recipient_role: record.recipient_role,
      notification_type: record.notification_type,
      template_name: record.template_name,
      status: record.status,
      idempotency_key: record.idempotency_key,
      attempt_count: record.attempt_count,
      consent_verified: record.consent_verified,
      message_id: record.message_id,
      payload: record.payload,
      response_payload: record.response_payload,
      webhook_events: record.webhook_events,
      error_message: record.error_message,
      submitted_at: record.submitted_at,
      sent_at: record.sent_at,
      delivered_at: record.delivered_at,
      read_at: record.read_at,
      failed_at: record.failed_at,
      created_at: record.created_at,
      updated_at: record.updated_at
    };

    const { error } = await client
      .from('order_notifications')
      .upsert([fullRow], { onConflict: 'id' });

    // Graceful fallback if table hasn't been altered with extended columns yet
    if (error && (error.message?.includes('column') || error.code === 'PGRST204')) {
      await client.from('order_notifications').upsert([{
        id: record.id,
        order_id: record.order_id,
        channel: 'whatsapp',
        recipient: record.recipient,
        status: record.status,
        message_id: record.message_id,
        payload: {
          ...(record.payload || {}),
          recipient_role: record.recipient_role,
          notification_type: record.notification_type,
          template_name: record.template_name,
          idempotency_key: record.idempotency_key,
          attempt_count: record.attempt_count,
          consent_verified: record.consent_verified
        },
        response_payload: record.response_payload,
        error_message: record.error_message,
        created_at: record.created_at,
        updated_at: record.updated_at
      }], { onConflict: 'id' });
    }
  } catch (err: any) {
    console.warn('[WhatsApp Outbox] Supabase persistence notice:', err?.message);
  }
}

async function findExistingByIdempotencyKey(idempotencyKey: string): Promise<OrderNotificationRecord | null> {
  // 1. Check in-memory outbox
  for (const rec of inMemoryOutbox.values()) {
    if (rec.idempotency_key === idempotencyKey) {
      return rec;
    }
  }

  // 2. Check Supabase order_notifications
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      const { data, error } = await client
        .from('order_notifications')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        const row = data[0] as OrderNotificationRecord;
        inMemoryOutbox.set(row.id, row);
        return row;
      }
    }
  } catch {}

  return null;
}

/**
 * Customer WhatsApp Number & Explicit Consent storage/lookup (Supabase + durable mirror).
 * Never assumes email is WhatsApp number and never assumes entering phone = consent.
 */
export async function saveCustomerWhatsAppConsent(input: {
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  whatsappNumber: string;
  consentGranted: boolean;
  consentSource?: string;
}): Promise<{ success: boolean; record?: CustomerWhatsAppConsentRecord; error?: string }> {
  const parsed = parseValidWhatsAppPhone(input.whatsappNumber);
  if (!parsed.valid) {
    return { success: false, error: parsed.reason || 'Invalid WhatsApp mobile number.' };
  }

  const now = new Date().toISOString();
  const cleanEmail = input.customerEmail && input.customerEmail.includes('@')
    ? input.customerEmail.trim().toLowerCase()
    : null;
  const cleanPhone = input.customerPhone ? parseValidWhatsAppPhone(input.customerPhone).local10 || input.customerPhone.replace(/\D/g, '') : null;

  // Check if an existing preference record exists for this customer/WhatsApp number so STOP opt-outs update the original record
  const existingMatch = await getCustomerWhatsAppConsent({
    customerId: input.customerId,
    customerEmail: cleanEmail || undefined,
    customerPhone: cleanPhone || undefined,
    whatsappNumber: parsed.e164
  });

  const prefId = existingMatch?.id || (
    input.customerId
      ? `wa_pref_${String(input.customerId).replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : (cleanEmail
        ? `wa_pref_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`
        : `wa_pref_${parsed.digits}`)
  );

  const record: CustomerWhatsAppConsentRecord = {
    id: prefId,
    customer_id: input.customerId ? String(input.customerId) : (existingMatch?.customer_id || null),
    customer_email: cleanEmail || existingMatch?.customer_email || null,
    customer_phone: cleanPhone || existingMatch?.customer_phone || null,
    whatsapp_number: parsed.e164,
    consent_granted: Boolean(input.consentGranted),
    consent_source: input.consentSource || 'checkout',
    consent_timestamp: input.consentGranted ? now : (existingMatch?.consent_timestamp || null),
    opt_out_timestamp: !input.consentGranted ? now : null,
    verified: Boolean(input.consentGranted),
    created_at: existingMatch?.created_at || inMemoryConsents.get(prefId)?.created_at || now,
    updated_at: now
  };

  inMemoryConsents.set(prefId, record);

  // If explicitly opting out (e.g. STOP webhook), revoke any other linked records for the same WhatsApp number in memory
  if (!input.consentGranted) {
    for (const [k, rec] of inMemoryConsents.entries()) {
      if (rec.whatsapp_number === parsed.e164 || (cleanPhone && rec.customer_phone === cleanPhone)) {
        inMemoryConsents.set(k, {
          ...rec,
          consent_granted: false,
          consent_source: input.consentSource || 'webhook_opt_out',
          opt_out_timestamp: now,
          updated_at: now
        });
      }
    }
  }
  persistLocalConsents();

  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      const { error } = await client
        .from('customer_whatsapp_preferences')
        .upsert([record], { onConflict: 'id' });
      if (error && error.code !== 'PGRST205') {
        console.warn('[WhatsApp Consent] Supabase upsert notice:', error.message);
      }
    }
  } catch (err: any) {
    console.warn('[WhatsApp Consent] Exception:', err?.message);
  }

  return { success: true, record };
}

export async function getCustomerWhatsAppConsent(lookup: {
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  whatsappNumber?: string;
}): Promise<CustomerWhatsAppConsentRecord | null> {
  const emailNorm = lookup.customerEmail?.trim().toLowerCase();
  const parsedWa = lookup.whatsappNumber ? parseValidWhatsAppPhone(lookup.whatsappNumber) : null;
  const parsedPhone = lookup.customerPhone ? parseValidWhatsAppPhone(lookup.customerPhone) : null;

  // 1. Check Supabase first for cross-device accuracy
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      const filters: string[] = [];
      if (lookup.customerId) filters.push(`customer_id.eq.${lookup.customerId}`);
      if (emailNorm) filters.push(`customer_email.eq.${emailNorm}`);
      if (parsedWa?.valid) filters.push(`whatsapp_number.eq.${parsedWa.e164}`);
      if (parsedPhone?.valid) filters.push(`customer_phone.eq.${parsedPhone.local10}`);

      if (filters.length > 0) {
        const { data, error } = await client
          .from('customer_whatsapp_preferences')
          .select('*')
          .or(filters.join(','))
          .order('updated_at', { ascending: false })
          .limit(1);

        if (!error && Array.isArray(data) && data.length > 0) {
          const row = data[0] as CustomerWhatsAppConsentRecord;
          inMemoryConsents.set(row.id, row);
          return row;
        }
      }
    }
  } catch {}

  // 2. Fallback to durable local mirror (ordered by updated_at desc so latest consent/opt-out wins)
  loadLocalStores();
  const sortedLocal = Array.from(inMemoryConsents.values()).sort(
    (a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
  );
  for (const rec of sortedLocal) {
    if (lookup.customerId && rec.customer_id === lookup.customerId) return rec;
    if (emailNorm && rec.customer_email === emailNorm) return rec;
    if (parsedWa?.valid && rec.whatsapp_number === parsedWa.e164) return rec;
    if (parsedPhone?.valid && rec.customer_phone === parsedPhone.local10) return rec;
  }

  return null;
}

/**
 * Resolves customer WhatsApp recipient & validates explicit consent.
 * Strictly requires consent_granted === true and a valid non-email phone number.
 */
async function resolveConsentedCustomerRecipient(order: any): Promise<{
  eligible: boolean;
  e164?: string;
  digits?: string;
  reason?: string;
}> {
  const explicitWa = order.customerWhatsappNumber || order.customer_whatsapp || order.address?.whatsappNumber;
  const explicitConsent = order.whatsappOptIn !== undefined ? order.whatsappOptIn : order.whatsapp_consent;

  // Look up persisted Supabase preference if available
  const savedPref = await getCustomerWhatsAppConsent({
    customerId: order.customerId || order.customer_id,
    customerEmail: order.customerEmail || order.customer_email,
    customerPhone: order.customerPhone || order.customer_phone,
    whatsappNumber: explicitWa
  });

  // Explicit opt-out on order or stored preference ALWAYS blocks sending
  if (explicitConsent === false) {
    return {
      eligible: false,
      reason: 'Customer did not grant WhatsApp notification consent during checkout.'
    };
  }
  if (savedPref && savedPref.consent_granted === false && explicitConsent !== true) {
    return {
      eligible: false,
      reason: 'Customer opted out of WhatsApp order notifications.'
    };
  }

  // Must have explicit opt-in consent (either passed from verified consent state or stored consent_granted = true)
  const isConsented = explicitConsent === true || savedPref?.consent_granted === true;
  if (!isConsented) {
    return {
      eligible: false,
      reason: 'Customer WhatsApp opt-in consent has not been granted. Entering a phone number alone does not grant messaging consent.'
    };
  }

  const candidateNumber = explicitWa || savedPref?.whatsapp_number;
  const parsed = parseValidWhatsAppPhone(candidateNumber);
  if (!parsed.valid) {
    return {
      eligible: false,
      reason: parsed.reason || 'Customer WhatsApp mobile number is missing or invalid.'
    };
  }

  return {
    eligible: true,
    e164: parsed.e164,
    digits: parsed.digits
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientMetaError(httpStatus: number, responseJson: any): boolean {
  if (httpStatus >= 500 || httpStatus === 429) return true;
  const code = Number(responseJson?.error?.code || 0);
  // Meta transient error codes (rate limits / temporary service unavailability)
  return [1, 2, 4, 17, 130429, 131016, 131048, 131056].includes(code);
}

/**
 * Sends a single idempotent WhatsApp Cloud API notification using the Transactional Outbox pattern.
 */
async function executeSingleOutboxNotification(params: {
  order: any;
  recipientRole: 'admin' | 'customer';
  recipientE164: string;
  recipientDigits: string;
  notificationType: NotificationType;
  consentVerified: boolean;
  existingRecordToRetry?: OrderNotificationRecord;
}): Promise<WhatsAppDispatchResult> {
  const {
    order,
    recipientRole,
    recipientE164,
    recipientDigits,
    notificationType,
    consentVerified,
    existingRecordToRetry
  } = params;

  const orderId = String(order.id || '');
  const now = new Date().toISOString();
  const idempotencyKey = existingRecordToRetry?.idempotency_key ||
    `${orderId}::${notificationType}::${recipientRole}::${recipientDigits}`;

  // 1. Concurrency lock & duplicate prevention
  if (inFlightIdempotencyKeys.has(idempotencyKey)) {
    return {
      success: true,
      status: 'duplicate_skipped',
      orderId,
      recipientRole,
      recipient: recipientE164,
      timestamp: now
    };
  }

  if (!existingRecordToRetry) {
    const existing = await findExistingByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        success: ['pending', 'submitted', 'sent', 'delivered', 'read'].includes(existing.status),
        status: 'duplicate_skipped',
        deduplicated: true,
        notificationId: existing.id,
        messageId: existing.message_id || undefined,
        orderId,
        recipientRole,
        recipient: recipientE164,
        templateName: existing.template_name,
        error: existing.error_message || undefined,
        timestamp: now
      };
    }
  }

  inFlightIdempotencyKeys.add(idempotencyKey);

  try {
    const { templateName, requestBody } = buildMetaTemplateRequestPayload(
      recipientDigits,
      notificationType,
      order
    );

    const recordId = existingRecordToRetry?.id ||
      `wa_${recipientRole}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const record: OrderNotificationRecord = existingRecordToRetry
      ? {
          ...existingRecordToRetry,
          status: 'pending',
          attempt_count: (existingRecordToRetry.attempt_count || 1) + 1,
          error_message: null,
          updated_at: now
        }
      : {
          id: recordId,
          order_id: orderId,
          channel: 'whatsapp',
          recipient: recipientE164,
          recipient_role: recipientRole,
          notification_type: notificationType,
          template_name: templateName,
          status: 'pending',
          idempotency_key: idempotencyKey,
          attempt_count: 1,
          consent_verified: consentVerified,
          message_id: null,
          payload: {
            templateName,
            recipientE164,
            previewText: recipientRole === 'admin'
              ? buildAdminOrderNotificationSummary(order)
              : buildCustomerOrderConfirmationSummary(order),
            requestBody
          },
          response_payload: null,
          webhook_events: [],
          error_message: null,
          submitted_at: null,
          sent_at: null,
          delivered_at: null,
          read_at: null,
          failed_at: null,
          created_at: now,
          updated_at: now
        };

    // Persist 'pending' outbox entry before external HTTP call
    await saveOutboxRecord(record);

    // 2. Check Meta WhatsApp Cloud API credentials (never fake success if unconfigured)
    const token = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
    const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    const version = (process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0').trim();

    if (!token || !phoneId) {
      const missing: string[] = [];
      if (!token) missing.push('WHATSAPP_ACCESS_TOKEN');
      if (!phoneId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
      if (!(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim()) {
        missing.push('WHATSAPP_BUSINESS_ACCOUNT_ID');
      }

      const errMsg = `Meta WhatsApp Cloud API is not configured (${missing.join(', ')} missing). Notification marked Failed — configure credentials in server environment variables.`;
      record.status = 'failed';
      record.error_message = errMsg;
      record.failed_at = new Date().toISOString();
      record.updated_at = record.failed_at;
      await saveOutboxRecord(record);

      return {
        success: false,
        status: 'failed',
        notificationId: record.id,
        orderId,
        recipientRole,
        recipient: recipientE164,
        templateName,
        error: errMsg,
        timestamp: record.failed_at
      };
    }

    // 3. Call Official Meta Graph API with safe retry-on-transient-failure (max 3 attempts)
    const graphUrl = `https://graph.facebook.com/${version}/${phoneId}/messages`;
    const maxAttempts = 3;
    let lastError = 'Unknown WhatsApp Cloud API error';
    let lastResponseJson: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        record.attempt_count = (existingRecordToRetry?.attempt_count || 0) + attempt;
        await sleep(attempt === 2 ? 600 : 1500);
      }

      try {
        const resp = await fetch(graphUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        const respJson = await resp.json().catch(() => null);
        lastResponseJson = respJson;

        if (resp.ok && respJson?.messages?.[0]?.id) {
          const wamid = String(respJson.messages[0].id);
          const submittedAt = new Date().toISOString();

          record.status = 'submitted';
          record.message_id = wamid;
          record.response_payload = respJson;
          record.error_message = null;
          record.submitted_at = submittedAt;
          record.updated_at = submittedAt;
          await saveOutboxRecord(record);

          console.log(`[WhatsApp Cloud API] ${recipientRole.toUpperCase()} notification submitted for order ${orderId} to ${recipientE164}. WAMID: ${wamid}`);

          return {
            success: true,
            status: 'submitted',
            notificationId: record.id,
            messageId: wamid,
            orderId,
            recipientRole,
            recipient: recipientE164,
            templateName,
            timestamp: submittedAt
          };
        }

        const errDetail = respJson?.error?.message || respJson?.message || `HTTP ${resp.status} ${resp.statusText}`;
        const errCode = respJson?.error?.code ? ` (Code ${respJson.error.code})` : '';
        lastError = `Meta API error${errCode}: ${errDetail}`;

        // Do NOT retry permanent client/policy/template errors
        if (!isTransientMetaError(resp.status, respJson)) {
          break;
        }
      } catch (netErr: any) {
        lastError = `Network error contacting Meta Graph API: ${netErr?.message || netErr}`;
      }
    }

    const failedAt = new Date().toISOString();
    record.status = 'failed';
    record.response_payload = lastResponseJson;
    record.error_message = lastError;
    record.failed_at = failedAt;
    record.updated_at = failedAt;
    await saveOutboxRecord(record);

    console.error(`[WhatsApp Cloud API] Failed ${recipientRole} notification for order ${orderId}: ${lastError}`);

    return {
      success: false,
      status: 'failed',
      notificationId: record.id,
      orderId,
      recipientRole,
      recipient: recipientE164,
      templateName,
      error: lastError,
      timestamp: failedAt
    };
  } finally {
    inFlightIdempotencyKeys.delete(idempotencyKey);
  }
}

/**
 * Automatically dispatches BOTH Admin (+919063692135) and Consented Customer notifications
 * after a valid order is saved. Failure of one NEVER cancels the order or blocks the other.
 */
export async function dispatchOrderWhatsAppNotifications(order: any): Promise<DualOrderDispatchResult> {
  const orderId = String(order?.id || '');
  const now = new Date().toISOString();

  // Admin notification (fixed number +919063692135)
  const adminRecipientRaw = (process.env.WHATSAPP_BUSINESS_RECIPIENT || process.env.ADMIN_PHONE || FIXED_ADMIN_WHATSAPP_RAW).trim();
  const parsedAdmin = parseValidWhatsAppPhone(adminRecipientRaw);
  const adminDigits = parsedAdmin.valid ? parsedAdmin.digits : FIXED_ADMIN_WHATSAPP_DIGITS;
  const adminE164 = parsedAdmin.valid ? parsedAdmin.e164 : FIXED_ADMIN_WHATSAPP_E164;

  const adminPromise = executeSingleOutboxNotification({
    order,
    recipientRole: 'admin',
    recipientE164: adminE164,
    recipientDigits: adminDigits,
    notificationType: 'admin_new_order',
    consentVerified: true
  });

  // Customer confirmation (requires verified/consented WhatsApp mobile number)
  const customerPromise = (async (): Promise<WhatsAppDispatchResult> => {
    const eligibility = await resolveConsentedCustomerRecipient(order);
    if (!eligibility.eligible || !eligibility.digits || !eligibility.e164) {
      const skipIdempotency = `${orderId}::customer_order_confirmation::customer::consent_missing`;
      const existingSkip = await findExistingByIdempotencyKey(skipIdempotency);

      if (!existingSkip) {
        const skipRecord: OrderNotificationRecord = {
          id: `wa_cust_skip_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
          order_id: orderId,
          channel: 'whatsapp',
          recipient: order.customerWhatsappNumber || order.customer_whatsapp || 'Not Consented',
          recipient_role: 'customer',
          notification_type: 'customer_order_confirmation',
          template_name: 'nuvvo_customer_order_confirmation',
          status: 'skipped_no_consent',
          idempotency_key: skipIdempotency,
          attempt_count: 1,
          consent_verified: false,
          message_id: null,
          payload: { reason: eligibility.reason },
          response_payload: null,
          webhook_events: [],
          error_message: eligibility.reason || 'Consent not granted.',
          submitted_at: null,
          sent_at: null,
          delivered_at: null,
          read_at: null,
          failed_at: null,
          created_at: now,
          updated_at: now
        };
        await saveOutboxRecord(skipRecord);
      }

      return {
        success: false,
        status: 'skipped_no_consent',
        orderId,
        recipientRole: 'customer',
        error: eligibility.reason,
        timestamp: now
      };
    }

    return executeSingleOutboxNotification({
      order,
      recipientRole: 'customer',
      recipientE164: eligibility.e164,
      recipientDigits: eligibility.digits,
      notificationType: 'customer_order_confirmation',
      consentVerified: true
    });
  })();

  const [adminSettled, customerSettled] = await Promise.allSettled([adminPromise, customerPromise]);

  const adminResult: WhatsAppDispatchResult = adminSettled.status === 'fulfilled'
    ? adminSettled.value
    : {
        success: false,
        status: 'failed',
        orderId,
        recipientRole: 'admin',
        recipient: adminE164,
        error: adminSettled.reason?.message || 'Unexpected admin dispatch failure',
        timestamp: new Date().toISOString()
      };

  const customerResult: WhatsAppDispatchResult = customerSettled.status === 'fulfilled'
    ? customerSettled.value
    : {
        success: false,
        status: 'failed',
        orderId,
        recipientRole: 'customer',
        error: customerSettled.reason?.message || 'Unexpected customer dispatch failure',
        timestamp: new Date().toISOString()
      };

  return {
    orderId,
    adminNotification: adminResult,
    customerNotification: customerResult,
    overallSuccess: adminResult.success || customerResult.success,
    timestamp: new Date().toISOString()
  };
}

/**
 * Automatically sends status lifecycle updates (`accepted`, `preparing`, `picked`/`on_the_way`, `delivered`, `cancelled`)
 * to opted-in customers using Meta-approved status templates, idempotently per status transition.
 */
export async function dispatchOrderStatusWhatsAppNotification(
  order: any,
  newStatus: string
): Promise<WhatsAppDispatchResult | null> {
  const s = String(newStatus || '').toLowerCase();
  let notificationType: NotificationType | null = null;
  if (s === 'accepted') notificationType = 'order_accepted';
  else if (s === 'preparing') notificationType = 'order_preparing';
  else if (s === 'picked' || s === 'on_the_way') notificationType = 'order_out_for_delivery';
  else if (s === 'delivered') notificationType = 'order_delivered';
  else if (s === 'cancelled') notificationType = 'order_cancelled';

  if (!notificationType) return null;

  const eligibility = await resolveConsentedCustomerRecipient(order);
  if (!eligibility.eligible || !eligibility.digits || !eligibility.e164) {
    return {
      success: false,
      status: 'skipped_no_consent',
      orderId: String(order.id || ''),
      recipientRole: 'customer',
      error: eligibility.reason,
      timestamp: new Date().toISOString()
    };
  }

  return executeSingleOutboxNotification({
    order,
    recipientRole: 'customer',
    recipientE164: eligibility.e164,
    recipientDigits: eligibility.digits,
    notificationType,
    consentVerified: true
  });
}

/**
 * Verifies Meta Webhook subscription handshake (GET /api/webhooks/whatsapp).
 */
export function verifyWhatsAppWebhookSubscription(query: Record<string, any>): {
  ok: boolean;
  statusCode: number;
  challenge?: string;
  error?: string;
} {
  const mode = String(query['hub.mode'] || '');
  const token = String(query['hub.verify_token'] || '');
  const challenge = String(query['hub.challenge'] || '');
  const configuredToken = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();

  if (!configuredToken) {
    return { ok: false, statusCode: 503, error: 'WHATSAPP_VERIFY_TOKEN is not configured on the server.' };
  }

  if (mode === 'subscribe' && token === configuredToken && challenge) {
    return { ok: true, statusCode: 200, challenge };
  }

  return { ok: false, statusCode: 403, error: 'Webhook verification token mismatch.' };
}

/**
 * Validates optional Meta X-Hub-Signature-256 webhook signature when WHATSAPP_APP_SECRET is configured.
 */
export function verifyMetaWebhookSignature(rawBody: Buffer | string | undefined, signatureHeader?: string): boolean {
  const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!appSecret) return true; // Only enforce when WHATSAPP_APP_SECRET is provided
  if (!rawBody || !signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function saveRawWebhookEventRecord(record: RawWebhookEventRecord): Promise<void> {
  inMemoryWebhookEvents.set(record.id, record);
  // Keep in-memory ring bounded to 100 latest entries
  if (inMemoryWebhookEvents.size > 100) {
    const oldest = Array.from(inMemoryWebhookEvents.values())
      .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
    for (let i = 0; i < oldest.length - 100; i++) {
      inMemoryWebhookEvents.delete(oldest[i].id);
    }
  }
  persistLocalWebhookEvents();

  try {
    const { client } = getAdminSupabaseServerClient();
    if (!client) return;
    const { error } = await client
      .from('whatsapp_webhook_events')
      .upsert([record], { onConflict: 'id' });
    if (error && error.code !== 'PGRST205') {
      console.warn('[WhatsApp Webhook Log] Supabase upsert notice:', error.message);
    }
  } catch (err: any) {
    console.warn('[WhatsApp Webhook Log] Exception saving raw webhook event:', err?.message);
  }
}

/**
 * Records a raw incoming Meta webhook payload for troubleshooting (even when signature verification fails).
 */
export async function recordRawWebhookEvent(params: {
  payload: any;
  headers?: Record<string, any>;
  signatureValid: boolean | null;
  forceEventType?: RawWebhookEventRecord['event_type'];
  errorSummary?: string | null;
}): Promise<RawWebhookEventRecord> {
  const payload = params.payload && typeof params.payload === 'object' ? params.payload : { raw: params.payload ?? null };
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  let hasStatuses = false;
  let hasMessages = false;
  let firstWamid: string | null = null;
  let firstPhoneId: string | null = null;
  let firstPeer: string | null = null;
  const statusesList: string[] = [];
  const errorsList: string[] = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      if (!firstPhoneId && value?.metadata?.phone_number_id) {
        firstPhoneId = String(value.metadata.phone_number_id);
      }
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      if (statuses.length > 0) hasStatuses = true;
      for (const st of statuses) {
        if (!firstWamid && st?.id) firstWamid = String(st.id);
        if (!firstPeer && st?.recipient_id) firstPeer = String(st.recipient_id);
        if (st?.status) statusesList.push(String(st.status).toLowerCase());
        if (Array.isArray(st?.errors)) {
          for (const e of st.errors) {
            errorsList.push(`[${e?.code || 'ERR'}] ${e?.title || e?.message || 'Delivery failed'}`);
          }
        }
      }
      const messages = Array.isArray(value.messages) ? value.messages : [];
      if (messages.length > 0) hasMessages = true;
      for (const msg of messages) {
        if (!firstWamid && msg?.id) firstWamid = String(msg.id);
        if (!firstPeer && msg?.from) firstPeer = String(msg.from);
      }
    }
  }

  let detectedType: RawWebhookEventRecord['event_type'] = params.forceEventType || 'unknown';
  if (!params.forceEventType) {
    if (hasStatuses && hasMessages) detectedType = 'mixed';
    else if (hasStatuses) detectedType = 'status';
    else if (hasMessages) detectedType = 'message';
  }

  const record: RawWebhookEventRecord = {
    id: `wh_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    received_at: new Date().toISOString(),
    event_type: detectedType,
    signature_valid: params.signatureValid,
    wamid: firstWamid,
    status_summary: statusesList.length > 0 ? Array.from(new Set(statusesList)).join(', ') : (hasMessages ? 'inbound_message' : null),
    phone_number_id: firstPhoneId,
    recipient_or_sender: firstPeer,
    matched_notification_id: null,
    matched_order_id: null,
    processed_statuses: 0,
    processed_opt_outs: 0,
    error_summary: params.errorSummary || (errorsList.length > 0 ? errorsList.join('; ') : null),
    raw_headers: params.headers || {},
    raw_payload: payload
  };

  await saveRawWebhookEventRecord(record);
  return record;
}

export type WebhookEventSearchScope = 'all' | 'wamid' | 'matched_order_id';

function extractWebhookPayloadWamids(payload: any): string[] {
  const wamids: string[] = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        if (st?.id) wamids.push(String(st.id));
      }
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        if (msg?.id) wamids.push(String(msg.id));
      }
    }
  }
  return wamids;
}

function matchesWebhookEventSearch(
  ev: RawWebhookEventRecord,
  query: string,
  searchBy: WebhookEventSearchScope = 'all'
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const wamidCandidates = [
    ev.wamid || '',
    ...extractWebhookPayloadWamids(ev.raw_payload)
  ]
    .filter(Boolean)
    .map(v => v.toLowerCase());

  const orderIdVal = (ev.matched_order_id || '').toLowerCase();
  const matchesWamid = wamidCandidates.some(w => w.includes(q));
  const matchesOrderId = orderIdVal.includes(q);

  if (searchBy === 'wamid') {
    return matchesWamid;
  }
  if (searchBy === 'matched_order_id') {
    return matchesOrderId;
  }

  if (matchesWamid || matchesOrderId) return true;
  return [
    ev.id,
    ev.matched_notification_id || '',
    ev.recipient_or_sender || '',
    ev.status_summary || '',
    ev.error_summary || ''
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/**
 * Retrieves the last N (max 50) raw Meta WhatsApp webhook events for Admin debugging,
 * optionally filtered by wamid or matched_order_id.
 */
export async function listRecentWebhookEvents(
  limit: number = 50,
  options?: {
    query?: string;
    searchBy?: WebhookEventSearchScope;
  }
): Promise<RawWebhookEventRecord[]> {
  loadLocalStores();
  const capped = Math.min(Math.max(1, Number(limit) || 50), 50);
  const query = String(options?.query || '').trim();
  const searchBy: WebhookEventSearchScope =
    options?.searchBy === 'wamid' || options?.searchBy === 'matched_order_id'
      ? options.searchBy
      : 'all';

  const merged = new Map<string, RawWebhookEventRecord>();

  for (const rec of inMemoryWebhookEvents.values()) {
    merged.set(rec.id, rec);
  }

  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      if (query) {
        const escapedPattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
        const queries: Promise<any>[] = [];

        if (searchBy === 'all' || searchBy === 'wamid') {
          queries.push(
            Promise.resolve(
              client
                .from('whatsapp_webhook_events')
                .select('*')
                .ilike('wamid', escapedPattern)
                .order('received_at', { ascending: false })
                .limit(capped)
            )
          );
        }
        if (searchBy === 'all' || searchBy === 'matched_order_id') {
          queries.push(
            Promise.resolve(
              client
                .from('whatsapp_webhook_events')
                .select('*')
                .ilike('matched_order_id', escapedPattern)
                .order('received_at', { ascending: false })
                .limit(capped)
            )
          );
        }
        if (searchBy === 'all') {
          queries.push(
            Promise.resolve(
              client
                .from('whatsapp_webhook_events')
                .select('*')
                .order('received_at', { ascending: false })
                .limit(capped)
            )
          );
        }

        const results = await Promise.all(queries);
        for (const res of results) {
          if (!res?.error && Array.isArray(res?.data)) {
            for (const row of res.data as RawWebhookEventRecord[]) {
              merged.set(row.id, row);
            }
          }
        }
      } else {
        const { data, error } = await client
          .from('whatsapp_webhook_events')
          .select('*')
          .order('received_at', { ascending: false })
          .limit(capped);

        if (!error && Array.isArray(data)) {
          for (const row of data as RawWebhookEventRecord[]) {
            merged.set(row.id, row);
          }
        }
      }
    }
  } catch {}

  const allSorted = Array.from(merged.values())
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());

  const filtered = query
    ? allSorted.filter(ev => matchesWebhookEventSearch(ev, query, searchBy))
    : allSorted;

  return filtered.slice(0, capped);
}

/**
 * Processes incoming Meta Cloud API webhook events:
 * - Persists the raw webhook event for Admin troubleshooting (last 50+)
 * - Status callbacks (`sent`, `delivered`, `read`, `failed`) matched by `wamid`
 * - Inbound customer messages (processes STOP / UNSUBSCRIBE / OPT OUT per WhatsApp compliance)
 */
export async function processWhatsAppWebhookEvent(
  payload: any,
  context?: {
    headers?: Record<string, any>;
    signatureValid?: boolean | null;
  }
): Promise<{
  processedStatuses: number;
  processedOptOuts: number;
  webhookEventId: string;
}> {
  const rawRecord = await recordRawWebhookEvent({
    payload,
    headers: context?.headers,
    signatureValid: context?.signatureValid ?? null
  });

  let processedStatuses = 0;
  let processedOptOuts = 0;
  let matchedNotificationId: string | null = null;
  let matchedOrderId: string | null = null;
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};

      // 1. Delivery status events (sent, delivered, read, failed)
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        const wamid = st?.id ? String(st.id) : '';
        const newStatus = String(st?.status || '').toLowerCase();
        if (!wamid || !['sent', 'delivered', 'read', 'failed'].includes(newStatus)) continue;

        const eventTs = st.timestamp
          ? new Date(Number(st.timestamp) * 1000).toISOString()
          : new Date().toISOString();

        const webhookErrMsg = Array.isArray(st.errors) && st.errors.length > 0
          ? st.errors.map((e: any) => `[${e.code || 'ERR'}] ${e.title || e.message || 'Delivery failed'}`).join('; ')
          : null;

        // Locate matching notification record in memory or Supabase
        let target: OrderNotificationRecord | undefined;
        for (const rec of inMemoryOutbox.values()) {
          if (rec.message_id === wamid) {
            target = rec;
            break;
          }
        }

        if (!target) {
          try {
            const { client } = getAdminSupabaseServerClient();
            if (client) {
              const { data } = await client
                .from('order_notifications')
                .select('*')
                .eq('message_id', wamid)
                .limit(1);
              if (Array.isArray(data) && data.length > 0) {
                target = data[0] as OrderNotificationRecord;
              }
            }
          } catch {}
        }

        if (target) {
          if (!matchedNotificationId) matchedNotificationId = target.id;
          if (!matchedOrderId) matchedOrderId = target.order_id;

          const rank: Record<string, number> = {
            pending: 0,
            submitted: 1,
            sent: 2,
            delivered: 3,
            read: 4,
            failed: 5
          };
          const currentRank = rank[target.status] ?? 0;
          const nextRank = rank[newStatus] ?? 0;

          if (newStatus === 'failed' || nextRank >= currentRank) {
            target.status = newStatus as NotificationLifecycleStatus;
          }
          if (newStatus === 'sent' && !target.sent_at) target.sent_at = eventTs;
          if (newStatus === 'delivered' && !target.delivered_at) target.delivered_at = eventTs;
          if (newStatus === 'read' && !target.read_at) target.read_at = eventTs;
          if (newStatus === 'failed') {
            target.failed_at = eventTs;
            if (webhookErrMsg) target.error_message = webhookErrMsg;
          }
          target.webhook_events = [
            ...(Array.isArray(target.webhook_events) ? target.webhook_events : []),
            { status: newStatus, timestamp: eventTs, errors: st.errors || null }
          ];
          target.updated_at = new Date().toISOString();
          await saveOutboxRecord(target);
          processedStatuses++;
        }
      }

      // 2. Inbound customer STOP / UNSUBSCRIBE opt-out handling
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        const from = msg?.from ? String(msg.from) : '';
        const textBody = String(msg?.text?.body || '').trim().toUpperCase();
        if (from && ['STOP', 'UNSUBSCRIBE', 'OPTOUT', 'OPT OUT', 'CANCEL ALERTS'].includes(textBody)) {
          const parsed = parseValidWhatsAppPhone(from);
          if (parsed.valid) {
            await saveCustomerWhatsAppConsent({
              whatsappNumber: parsed.e164,
              customerPhone: parsed.local10,
              consentGranted: false,
              consentSource: 'webhook_opt_out'
            });
            processedOptOuts++;
          }
        }
      }
    }
  }

  // Update the logged webhook event with match / processing outcome
  if (processedStatuses > 0 || processedOptOuts > 0 || matchedNotificationId) {
    rawRecord.processed_statuses = processedStatuses;
    rawRecord.processed_opt_outs = processedOptOuts;
    rawRecord.matched_notification_id = matchedNotificationId;
    rawRecord.matched_order_id = matchedOrderId;
    if (processedOptOuts > 0) {
      rawRecord.event_type = rawRecord.event_type === 'status' ? 'mixed' : 'opt_out';
      rawRecord.status_summary = rawRecord.status_summary
        ? `${rawRecord.status_summary}, opt_out`
        : 'opt_out';
    }
    await saveRawWebhookEventRecord(rawRecord);
  }

  return { processedStatuses, processedOptOuts, webhookEventId: rawRecord.id };
}

/**
 * Safely retries ONLY a failed notification without creating duplicate rows or resending sent messages.
 */
export async function retryFailedNotification(
  notificationId: string,
  orderResolver: (orderId: string) => Promise<any | null>
): Promise<WhatsAppDispatchResult> {
  let target = inMemoryOutbox.get(notificationId);
  if (!target) {
    try {
      const { client } = getAdminSupabaseServerClient();
      if (client) {
        const { data } = await client
          .from('order_notifications')
          .select('*')
          .eq('id', notificationId)
          .maybeSingle();
        if (data) target = data as OrderNotificationRecord;
      }
    } catch {}
  }

  if (!target) {
    return {
      success: false,
      status: 'failed',
      orderId: '',
      recipientRole: 'admin',
      error: 'Notification record not found.',
      timestamp: new Date().toISOString()
    };
  }

  if (['submitted', 'sent', 'delivered', 'read'].includes(target.status)) {
    return {
      success: true,
      status: 'duplicate_skipped',
      notificationId: target.id,
      messageId: target.message_id || undefined,
      orderId: target.order_id,
      recipientRole: target.recipient_role,
      recipient: target.recipient,
      timestamp: new Date().toISOString()
    };
  }

  const order = await orderResolver(target.order_id);
  if (!order) {
    return {
      success: false,
      status: 'failed',
      notificationId: target.id,
      orderId: target.order_id,
      recipientRole: target.recipient_role,
      error: `Order ${target.order_id} could not be resolved for retry.`,
      timestamp: new Date().toISOString()
    };
  }

  const parsed = parseValidWhatsAppPhone(target.recipient);
  if (!parsed.valid) {
    return {
      success: false,
      status: 'failed',
      notificationId: target.id,
      orderId: target.order_id,
      recipientRole: target.recipient_role,
      error: parsed.reason || 'Recipient phone number is invalid.',
      timestamp: new Date().toISOString()
    };
  }

  return executeSingleOutboxNotification({
    order,
    recipientRole: target.recipient_role,
    recipientE164: parsed.e164,
    recipientDigits: parsed.digits,
    notificationType: target.notification_type,
    consentVerified: target.consent_verified,
    existingRecordToRetry: target
  });
}

export interface RetryWebhookEventResult {
  found: boolean;
  success: boolean;
  status: string;
  webhookEventId: string;
  notificationId?: string;
  orderId?: string;
  messageId?: string;
  error?: string;
  result?: WhatsAppDispatchResult | DualOrderDispatchResult;
}

/**
 * Resolves the WhatsApp notification or order associated with a failed raw webhook event
 * and triggers the backend resend logic for that specific webhook event.
 */
export async function retryFailedWebhookEvent(
  webhookEventId: string,
  orderResolver: (orderId: string) => Promise<any | null>
): Promise<RetryWebhookEventResult> {
  loadLocalStores();
  const cleanId = String(webhookEventId || '').trim();
  if (!cleanId) {
    return {
      found: false,
      success: false,
      status: 'invalid_id',
      webhookEventId: cleanId,
      error: 'Webhook event ID is required.'
    };
  }

  let webhookEvent = inMemoryWebhookEvents.get(cleanId);
  if (!webhookEvent) {
    try {
      const { client } = getAdminSupabaseServerClient();
      if (client) {
        const { data } = await client
          .from('whatsapp_webhook_events')
          .select('*')
          .eq('id', cleanId)
          .maybeSingle();
        if (data) {
          webhookEvent = data as RawWebhookEventRecord;
        }
      }
    } catch {}
  }

  if (!webhookEvent) {
    return {
      found: false,
      success: false,
      status: 'not_found',
      webhookEventId: cleanId,
      error: 'Webhook event record not found.'
    };
  }

  // 1. Resolve matching notification by matched_notification_id, WAMID, or matched_order_id
  let targetNotification: OrderNotificationRecord | undefined;

  if (webhookEvent.matched_notification_id) {
    targetNotification = inMemoryOutbox.get(webhookEvent.matched_notification_id);
    if (!targetNotification) {
      try {
        const { client } = getAdminSupabaseServerClient();
        if (client) {
          const { data } = await client
            .from('order_notifications')
            .select('*')
            .eq('id', webhookEvent.matched_notification_id)
            .maybeSingle();
          if (data) targetNotification = data as OrderNotificationRecord;
        }
      } catch {}
    }
  }

  if (!targetNotification) {
    const candidateWamids = Array.from(
      new Set(
        [webhookEvent.wamid || '', ...extractWebhookPayloadWamids(webhookEvent.raw_payload)]
          .map(v => String(v || '').trim())
          .filter(Boolean)
      )
    );

    if (candidateWamids.length > 0) {
      for (const rec of inMemoryOutbox.values()) {
        if (rec.message_id && candidateWamids.includes(rec.message_id)) {
          targetNotification = rec;
          break;
        }
      }

      if (!targetNotification) {
        try {
          const { client } = getAdminSupabaseServerClient();
          if (client) {
            const { data } = await client
              .from('order_notifications')
              .select('*')
              .in('message_id', candidateWamids)
              .limit(1);
            if (Array.isArray(data) && data.length > 0) {
              targetNotification = data[0] as OrderNotificationRecord;
            }
          }
        } catch {}
      }
    }
  }

  if (!targetNotification && webhookEvent.matched_order_id) {
    const orderNotifs = await listOrderNotifications({
      orderId: webhookEvent.matched_order_id,
      limit: 20
    });
    targetNotification = orderNotifs.find(n => n.status === 'failed') || orderNotifs[0];
  }

  // Keep link metadata up to date on the webhook event if newly resolved
  if (targetNotification && (!webhookEvent.matched_notification_id || !webhookEvent.matched_order_id)) {
    webhookEvent.matched_notification_id = webhookEvent.matched_notification_id || targetNotification.id;
    webhookEvent.matched_order_id = webhookEvent.matched_order_id || targetNotification.order_id;
    await saveRawWebhookEventRecord(webhookEvent);
  }

  // 2. Trigger notification-level resend if we found a matching notification record
  if (targetNotification) {
    const retryResult = await retryFailedNotification(targetNotification.id, orderResolver);
    return {
      found: true,
      success: retryResult.success,
      status: retryResult.status,
      webhookEventId: webhookEvent.id,
      notificationId: retryResult.notificationId || targetNotification.id,
      orderId: retryResult.orderId || targetNotification.order_id,
      messageId: retryResult.messageId,
      error: retryResult.error,
      result: retryResult
    };
  }

  // 3. Fallback: if matched_order_id exists without an outbox row, resend via order dispatch
  if (webhookEvent.matched_order_id) {
    const order = await orderResolver(webhookEvent.matched_order_id);
    if (!order) {
      return {
        found: true,
        success: false,
        status: 'order_not_found',
        webhookEventId: webhookEvent.id,
        orderId: webhookEvent.matched_order_id,
        error: `Order ${webhookEvent.matched_order_id} could not be resolved for resend.`
      };
    }

    const dualResult = await dispatchOrderWhatsAppNotifications(order);
    return {
      found: true,
      success: dualResult.overallSuccess,
      status: dualResult.overallSuccess ? 'submitted' : 'failed',
      webhookEventId: webhookEvent.id,
      orderId: webhookEvent.matched_order_id,
      messageId: dualResult.adminNotification.messageId || dualResult.customerNotification.messageId,
      error: dualResult.overallSuccess
        ? undefined
        : (dualResult.adminNotification.error || dualResult.customerNotification.error || 'Resend failed.'),
      result: dualResult
    };
  }

  if (webhookEvent.signature_valid === false || webhookEvent.event_type === 'invalid_signature') {
    return {
      found: true,
      success: false,
      status: 'unlinked_invalid_signature',
      webhookEventId: webhookEvent.id,
      error: 'Cannot resend: this webhook event failed HMAC signature verification and has no linked notification or order.'
    };
  }

  return {
    found: true,
    success: false,
    status: 'unlinked',
    webhookEventId: webhookEvent.id,
    error: 'Cannot resend: no matching WhatsApp notification or order was found for this webhook event.'
  };
}

/**
 * Retrieves notification records merged from Supabase `order_notifications` and durable local outbox.
 */
export async function listOrderNotifications(options?: {
  orderId?: string;
  limit?: number;
}): Promise<OrderNotificationRecord[]> {
  const limit = options?.limit || 100;
  const merged = new Map<string, OrderNotificationRecord>();

  for (const rec of inMemoryOutbox.values()) {
    if (!options?.orderId || rec.order_id === options.orderId) {
      merged.set(rec.id, rec);
    }
  }

  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      let query = client
        .from('order_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (options?.orderId) {
        query = query.eq('order_id', String(options.orderId));
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        for (const row of data as any[]) {
          const normalized: OrderNotificationRecord = {
            ...row,
            recipient_role: row.recipient_role || row.payload?.recipient_role || (String(row.recipient || '').includes('9063692135') ? 'admin' : 'customer'),
            notification_type: row.notification_type || row.payload?.notification_type || 'admin_new_order',
            template_name: row.template_name || row.payload?.template_name || 'nuvvo_admin_new_order',
            attempt_count: row.attempt_count || row.payload?.attempt_count || 1,
            consent_verified: Boolean(row.consent_verified ?? row.payload?.consent_verified ?? false),
            webhook_events: Array.isArray(row.webhook_events) ? row.webhook_events : []
          };
          merged.set(normalized.id, normalized);
        }
      }
    }
  } catch {}

  return Array.from(merged.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

// Backward-compatible wrapper so existing server callers trigger full dual dispatch
export async function sendOrderConfirmationWhatsApp(order: any): Promise<DualOrderDispatchResult> {
  return dispatchOrderWhatsAppNotifications(order);
}
export const sendOrderWhatsAppMessage = dispatchOrderWhatsAppNotifications;
