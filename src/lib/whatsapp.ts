/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server-side WhatsApp Business Cloud API Utility
 * Uses:
 * - WHATSAPP_ACCESS_TOKEN
 * - WHATSAPP_PHONE_NUMBER_ID
 * - WHATSAPP_BUSINESS_RECIPIENT
 * 
 * Generates structured order notifications and persists delivery records
 * in Supabase `order_notifications` table.
 */

import { getAdminSupabaseServerClient } from '../utils/supabase/server.ts';

export interface WhatsAppNotificationResult {
  success: boolean;
  status: 'sent' | 'failed' | 'not_configured' | 'duplicate_skipped';
  messageId?: string;
  orderId: string;
  recipient?: string;
  error?: string;
  timestamp: string;
}

export interface WhatsAppConfigStatus {
  isConfigured: boolean;
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  hasBusinessRecipient: boolean;
  businessRecipientMasked: string;
  phoneNumberIdMasked: string;
  missingVars: string[];
}

// In-memory set for rapid burst duplicate prevention
const inMemorySentOrderIds = new Set<string>();

/**
 * Normalizes phone numbers for WhatsApp Cloud API.
 * Strips non-digits and ensures country code (default 91 for India).
 */
export function normalizeWhatsAppPhoneNumber(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return '91' + digits;
  }
  return digits;
}

/**
 * Returns current configuration status of WhatsApp Business Cloud API.
 * Never leaks raw secrets.
 */
export function getWhatsAppConfigStatus(): WhatsAppConfigStatus {
  const token = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN || '';
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const recipient = process.env.WHATSAPP_BUSINESS_RECIPIENT || process.env.ADMIN_PHONE || '9063692135';

  const missing: string[] = [];
  if (!token) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!phoneId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!recipient) missing.push('WHATSAPP_BUSINESS_RECIPIENT');

  const maskPhone = (p: string) => {
    const clean = p.replace(/\D/g, '');
    if (clean.length <= 4) return '***';
    return clean.slice(0, 2) + '••••' + clean.slice(-4);
  };

  const maskId = (id: string) => {
    if (!id || id.length <= 4) return 'Not configured';
    return id.slice(0, 3) + '••••' + id.slice(-3);
  };

  return {
    isConfigured: Boolean(token && phoneId && recipient),
    hasAccessToken: Boolean(token),
    hasPhoneNumberId: Boolean(phoneId),
    hasBusinessRecipient: Boolean(recipient),
    businessRecipientMasked: maskPhone(recipient),
    phoneNumberIdMasked: maskId(phoneId),
    missingVars: missing
  };
}

/**
 * Formats order date & time specifically in Asia/Kolkata (IST) timezone.
 */
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

/**
 * Generates a clean, structured WhatsApp order notification message.
 */
export function buildStructuredOrderMessage(order: any): string {
  const orderId = String(order.id || '').replace(/^order_/, '');
  const istTime = formatOrderDateTimeIST(order.date || order.created_at);
  const customerName = order.customerName || order.customer_name || 'Valued Customer';
  const customerPhone = order.customerPhone || order.customer_phone || 'N/A';

  // Format line items
  const items = Array.isArray(order.items) ? order.items : [];
  const itemsList = items.map((it: any, idx: number) => {
    const name = it.foodItem?.name || it.name || `Item ${idx + 1}`;
    const qty = Number(it.quantity || 1);
    const price = Number(it.foodItem?.price || it.price || 0);
    const total = price * qty;
    return `• ${qty}x ${name} — ₹${total}`;
  }).join('\n') || '• Standard Menu Assortment';

  // Format delivery address
  let addressText = 'Chirala Regional Delivery';
  if (order.address) {
    if (typeof order.address === 'string') {
      addressText = order.address;
    } else if (typeof order.address === 'object') {
      const parts = [
        order.address.houseNumber || order.address.flatNo,
        order.address.streetName,
        order.address.locality || order.address.area,
        order.address.city || 'Chirala'
      ].filter(Boolean);
      addressText = parts.length > 0 ? parts.join(', ') : (order.address.formatted || 'Chirala Delivery');
    }
  }

  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount || 0);
  const deliveryFee = Number(order.deliveryFee !== undefined ? order.deliveryFee : (order.delivery_fee || 0));
  const packagingFee = Number(order.packagingFee !== undefined ? order.packagingFee : (order.packaging_fee || 0));
  const tax = Number(order.tax || 0);
  const tip = Number(order.tip || 0);
  const finalAmount = Number(order.finalAmount !== undefined ? order.finalAmount : (order.final_amount || 0));
  const paymentMethod = String(order.paymentMethod || order.payment_method || 'UPI').toUpperCase();
  const paymentStatus = String(order.paymentStatus || order.payment_status || 'pending').toUpperCase();

  const isPaid = paymentStatus === 'CONFIRMED' || paymentStatus === 'SUCCESS';
  const isCod = paymentMethod.includes('COD') || paymentMethod.includes('DELIVERY');
  const paymentBadge = isPaid
    ? '✅ PAID (Confirmed)'
    : (isCod ? '💵 COD (Pay on Delivery)' : '⏳ PAYMENT PENDING / AWAITING VERIFICATION');

  let extraUpi = '';
  if (order.upiDetails?.customerUtr || order.paymentDetails?.customerUtr) {
    extraUpi = `\n• *Customer UTR:* ${order.upiDetails?.customerUtr || order.paymentDetails?.customerUtr}`;
  }

  let instructionsText = '';
  if (order.instructions && String(order.instructions).trim()) {
    instructionsText = `\n\n📝 *Kitchen Instructions:*\n_${String(order.instructions).trim()}_`;
  }

  return (
`🍽️ *NUVVO — NEW ORDER ALERT* 🍽️
━━━━━━━━━━━━━━━━━━━━━━
*Order ID:* #${orderId}
*Date & Time:* ${istTime} (IST)
*Order Status:* ${(order.status || 'Accepted').toUpperCase()}

👤 *CUSTOMER DETAILS:*
• *Name:* ${customerName}
• *Phone:* ${customerPhone}
• *Drop Location:* ${addressText}

📦 *ORDER ITEMS (${items.length}):*
${itemsList}

💵 *BILL SUMMARY:*
• Subtotal: ₹${subtotal}${discount > 0 ? `\n• Discount: -₹${discount}` : ''}${deliveryFee > 0 ? `\n• Delivery Fee: ₹${deliveryFee}` : '\n• Delivery: FREE'}${packagingFee > 0 ? `\n• Packaging: ₹${packagingFee}` : ''}${tax > 0 ? `\n• GST / Tax: ₹${tax}` : ''}${tip > 0 ? `\n• Delivery Tip: ₹${tip}` : ''}
━━━━━━━━━━━━━━━━━━━━━━
*FINAL TOTAL: ₹${finalAmount}*
━━━━━━━━━━━━━━━━━━━━━━
💳 *PAYMENT INFORMATION:*
• *Method:* ${paymentMethod}
• *Status:* ${paymentBadge}${extraUpi}${instructionsText}

_Powered by Nuvvo Real-time Food Delivery Platform_`
  );
}

/**
 * Logs notification outcome to Supabase `order_notifications` table.
 */
export async function logOrderNotification(record: {
  orderId: string;
  recipient: string;
  status: 'sent' | 'failed' | 'not_configured' | 'duplicate_skipped';
  messageId?: string;
  payload?: any;
  response?: any;
  errorMessage?: string;
}) {
  try {
    const { client } = getAdminSupabaseServerClient();
    if (!client) return;

    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await client
      .from('order_notifications')
      .insert([{
        id: notifId,
        order_id: String(record.orderId),
        channel: 'whatsapp',
        recipient: String(record.recipient),
        status: record.status,
        message_id: record.messageId || null,
        payload: record.payload || null,
        response_payload: record.response || null,
        error_message: record.errorMessage || null,
        created_at: new Date().toISOString()
      }]);
  } catch (err: any) {
    console.warn('[WhatsApp Log] Notice logging notification to Supabase:', err?.message);
  }
}

/**
 * Checks if a WhatsApp notification has already been successfully dispatched
 * for this order ID in Supabase `order_notifications` table.
 */
export async function hasOrderNotificationBeenSent(orderId: string): Promise<boolean> {
  if (inMemorySentOrderIds.has(String(orderId))) {
    return true;
  }

  try {
    const { client } = getAdminSupabaseServerClient();
    if (!client) return false;

    const { data, error } = await client
      .from('order_notifications')
      .select('id, status')
      .eq('order_id', String(orderId))
      .eq('channel', 'whatsapp')
      .eq('status', 'sent')
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      inMemorySentOrderIds.add(String(orderId));
      return true;
    }
  } catch (err: any) {
    console.warn('[WhatsApp] Notice checking notification history:', err?.message);
  }

  return false;
}

/**
 * Sends structured order message via WhatsApp Cloud API.
 * Reads:
 * - process.env.WHATSAPP_ACCESS_TOKEN
 * - process.env.WHATSAPP_PHONE_NUMBER_ID
 * - process.env.WHATSAPP_BUSINESS_RECIPIENT
 * 
 * Logs results directly to `order_notifications` table.
 */
export async function sendOrderWhatsAppMessage(order: any, customRecipient?: string): Promise<WhatsAppNotificationResult> {
  const orderId = String(order.id || `ord_${Date.now()}`);
  const now = new Date().toISOString();

  // 1. Duplicate check
  const alreadySent = await hasOrderNotificationBeenSent(orderId);
  if (alreadySent) {
    console.log(`[WhatsApp] Notification for order ${orderId} has already been sent. Skipping duplicate.`);
    return {
      success: true,
      status: 'duplicate_skipped',
      orderId,
      timestamp: now
    };
  }

  // 2. Read environment variables
  const token = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN || '';
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const rawRecipient = customRecipient || process.env.WHATSAPP_BUSINESS_RECIPIENT || process.env.ADMIN_PHONE || '9063692135';
  const cleanRecipient = normalizeWhatsAppPhoneNumber(rawRecipient);

  // 3. Graceful missing credential handling
  if (!token || !phoneId) {
    const missing: string[] = [];
    if (!token) missing.push('WHATSAPP_ACCESS_TOKEN');
    if (!phoneId) missing.push('WHATSAPP_PHONE_NUMBER_ID');

    const warning = `WhatsApp Business Cloud API is not configured. Missing environment variable(s): ${missing.join(', ')}. Order #${orderId} was recorded successfully without WhatsApp alert.`;
    console.warn(`[WhatsApp Notice] ${warning}`);

    await logOrderNotification({
      orderId,
      recipient: cleanRecipient || 'Not Configured',
      status: 'not_configured',
      errorMessage: warning
    });

    return {
      success: false,
      status: 'not_configured',
      orderId,
      recipient: cleanRecipient,
      error: warning,
      timestamp: now
    };
  }

  // 4. Build structured order message
  const messageBody = buildStructuredOrderMessage(order);

  const requestPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanRecipient,
    type: 'text',
    text: {
      preview_url: false,
      body: messageBody
    }
  };

  // 5. Cloud API HTTP POST
  try {
    const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    const responseJson = await response.json();

    if (response.ok && responseJson?.messages?.[0]?.id) {
      const wamid = responseJson.messages[0].id;
      console.log(`[WhatsApp Success] Order #${orderId} notification sent to ${cleanRecipient}. WAMID: ${wamid}`);

      inMemorySentOrderIds.add(orderId);

      await logOrderNotification({
        orderId,
        recipient: cleanRecipient,
        status: 'sent',
        messageId: wamid,
        payload: { to: cleanRecipient, length: messageBody.length },
        response: responseJson
      });

      return {
        success: true,
        status: 'sent',
        messageId: wamid,
        orderId,
        recipient: cleanRecipient,
        timestamp: new Date().toISOString()
      };
    } else {
      const errDetail = responseJson?.error?.message || responseJson?.message || `HTTP ${response.status} ${response.statusText}`;
      const fullError = `WhatsApp Cloud API error: ${errDetail}`;
      console.error(`[WhatsApp Error] Failed to send order #${orderId}:`, fullError);

      await logOrderNotification({
        orderId,
        recipient: cleanRecipient,
        status: 'failed',
        payload: { to: cleanRecipient },
        response: responseJson,
        errorMessage: fullError
      });

      return {
        success: false,
        status: 'failed',
        orderId,
        recipient: cleanRecipient,
        error: fullError,
        timestamp: new Date().toISOString()
      };
    }
  } catch (err: any) {
    const errorMsg = `Network or unexpected exception dispatching WhatsApp alert: ${err?.message || err}`;
    console.error(`[WhatsApp Exception] Order #${orderId}:`, errorMsg);

    await logOrderNotification({
      orderId,
      recipient: cleanRecipient,
      status: 'failed',
      errorMessage: errorMsg
    });

    return {
      success: false,
      status: 'failed',
      orderId,
      recipient: cleanRecipient,
      error: errorMsg,
      timestamp: new Date().toISOString()
    };
  }
}

// Backward-compatible alias
export const sendOrderConfirmationWhatsApp = sendOrderWhatsAppMessage;
export const buildOrderWhatsAppMessage = buildStructuredOrderMessage;
export const recordNotificationLog = logOrderNotification;
