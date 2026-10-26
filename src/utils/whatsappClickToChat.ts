/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Free WhatsApp Click-to-Chat Order Confirmation Utility for Nuvvo
 * 
 * ZERO-COST IMPLEMENTATION:
 * - Uses official WhatsApp Click-to-Chat URL protocol (https://wa.me/{phone}?text={message})
 * - Requires NO WhatsApp Business API, Cloud API, Twilio, or paid third-party tokens
 * - Pre-fills real order data from Supabase for the customer to review and send
 */

import { Order } from '../types';

/**
 * Normalizes phone numbers to standard E.164 without plus sign (e.g., 919876543210).
 * Defaults to India country code (91) for 10-digit mobile numbers.
 */
export function formatWhatsAppPhoneNumber(phone?: string): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return '91' + digits;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

/**
 * Formats order date & time cleanly in Asia/Kolkata (IST) timezone.
 */
export function formatOrderTimestampIST(dateString?: string): string {
  try {
    const d = dateString ? new Date(dateString) : new Date();
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: true
    }).format(d);
  } catch {
    return new Date().toLocaleString('en-IN');
  }
}

/**
 * Determines accurate, honest payment status string.
 * Strictly avoids marking COD or pending UPI orders as 'Paid'.
 */
export function getAccuratePaymentStatusText(order: Order): {
  statusText: string;
  badgeTelugu: string;
  isPaid: boolean;
} {
  const method = String(order.paymentMethod || 'UPI').toUpperCase();
  const status = String(order.paymentStatus || 'pending').toLowerCase();

  const isCod = method.includes('COD') || method.includes('CASH') || method.includes('DELIVERY');

  if (isCod) {
    return {
      statusText: 'Cash on Delivery — Payment Pending',
      badgeTelugu: 'క్యాష్ ఆన్ డెలివరీ (డెలివరీ సమయంలో చెల్లించాలి)',
      isPaid: false
    };
  }

  if (status === 'confirmed' || status === 'success') {
    return {
      statusText: 'Paid (Payment Confirmed)',
      badgeTelugu: 'చెల్లింపు పూర్తయింది (Verified)',
      isPaid: true
    };
  }

  if (status === 'awaiting_confirmation') {
    return {
      statusText: 'UPI — Payment Pending / Awaiting Verification',
      badgeTelugu: 'UPI చెల్లింపు ధృవీకరణ పెండింగ్ లో ఉంది',
      isPaid: false
    };
  }

  return {
    statusText: 'Payment Pending',
    badgeTelugu: 'చెల్లింపు పెండింగ్ లో ఉంది',
    isPaid: false
  };
}

/**
 * Generates structured, readable order confirmation text for WhatsApp.
 * Formatted cleanly in English & Telugu with genuine order data.
 */
export function generateWhatsAppOrderConfirmationText(order: Order, customerPhone?: string): string {
  const orderId = String(order.id || '').replace(/^order_/, '');
  const istTime = formatOrderTimestampIST(order.date);
  const customerName = order.customerName || 'Valued Customer';
  const phone = customerPhone || order.customerPhone || 'N/A';

  // Format line items
  const items = Array.isArray(order.items) ? order.items : [];
  const itemsText = items.map((it: any, index: number) => {
    const name = it.foodItem?.name || it.name || `Item ${index + 1}`;
    const qty = Number(it.quantity || 1);
    const price = Number(it.foodItem?.price || it.price || 0);
    const lineTotal = price * qty;
    return `  • ${qty}x ${name} — ₹${lineTotal}`;
  }).join('\n') || '  • Special Dishes Assortment';

  // Format delivery address
  let addressText = 'Chirala Regional Delivery';
  if (order.address) {
    if (typeof order.address === 'string') {
      addressText = order.address;
    } else if (typeof order.address === 'object') {
      const addr = order.address as any;
      const parts = [
        addr.houseNumber || addr.flatNo,
        addr.streetName,
        addr.locality || addr.area,
        addr.city || 'Chirala'
      ].filter(Boolean);
      addressText = parts.length > 0 ? parts.join(', ') : 'Chirala Delivery';
    }
  }

  const { statusText } = getAccuratePaymentStatusText(order);
  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount || 0);
  const deliveryFee = Number(order.deliveryFee !== undefined ? order.deliveryFee : 0);
  const packagingFee = Number(order.packagingFee !== undefined ? order.packagingFee : 0);
  const tax = Number(order.tax || 0);
  const finalAmount = Number(order.finalAmount !== undefined ? order.finalAmount : (order as any).totalAmount || 0);

  const paymentMethodDisplay = order.paymentMethod === 'COD' 
    ? 'Cash on Delivery (COD)' 
    : (order.paymentMethod || 'PhonePe UPI');

  const orderStatusDisplay = String(order.status || 'accepted').toUpperCase();

  return (
`🍽️ *NUVVO — ఆర్డర్ కన్ఫర్మేషన్ (ORDER CONFIRMATION)* 🍽️
━━━━━━━━━━━━━━━━━━━━━━
*Order ID:* #${orderId}
*Date & Time:* ${istTime} (IST)
*Order Status:* ${orderStatusDisplay}

👤 *CUSTOMER DETAILS (కస్టమర్ వివరాలు):*
• *Name:* ${customerName}
• *Phone:* ${phone}
• *Delivery Address:* ${addressText}

📦 *ITEMS ORDERED (${items.length}):*
${itemsText}

💵 *BILL BREAKDOWN:*
• Items Subtotal: ₹${subtotal}${discount > 0 ? `\n• Discount Savings: -₹${discount}` : ''}${deliveryFee > 0 ? `\n• Delivery Fee: ₹${deliveryFee}` : '\n• Delivery: FREE'}${packagingFee > 0 ? `\n• Packaging Fee: ₹${packagingFee}` : ''}${tax > 0 ? `\n• GST / Taxes: ₹${tax}` : ''}
━━━━━━━━━━━━━━━━━━━━━━
*FINAL TOTAL: ₹${finalAmount}*
━━━━━━━━━━━━━━━━━━━━━━

💳 *PAYMENT STATUS (చెల్లింపు వివరాలు):*
• *Payment Method:* ${paymentMethodDisplay}
• *Status:* ${statusText}

━━━━━━━━━━━━━━━━━━━━━━
మీ ఆర్డర్ విజయవంతంగా నమోదు చేయబడింది. Nuvvo ను ఎంచుకున్నందుకు ధన్యవాదాలు!
_Nuvvo Food & Hospitality Platform_`
  );
}

/**
 * Builds the official WhatsApp Click-to-Chat URL.
 * Supports web and mobile app without requiring API keys.
 */
export function buildWhatsAppClickToChatUrl(phone: string, text: string): string {
  const cleanPhone = formatWhatsAppPhoneNumber(phone);
  const encodedText = encodeURIComponent(text);
  
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Triggers WhatsApp Click-to-Chat link in the customer's browser or mobile app.
 */
export function openWhatsAppClickToChat(phone: string, text: string): boolean {
  try {
    const url = buildWhatsAppClickToChatUrl(phone, text);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    }
  } catch (e) {
    console.warn('[WhatsApp Click-to-Chat] Error opening URL:', e);
  }
  return false;
}
