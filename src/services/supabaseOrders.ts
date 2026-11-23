/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase, getActiveAuthToken } from '../utils/supabase/client';
import { Order, OrderStatus } from '../types';
import { tanstackQueryClient, STALE_TIMES, QUERY_KEYS, invalidateOrders } from '../utils/tanstackQuery';

export const LIVE_ORDERS_CHANNEL = 'nuvvo_live_orders_v1';

/**
 * Builds the exact schema-compliant payload for the Supabase public.orders table,
 * safely preserving all rich checkout details inside the address JSONB structure.
 */
export function buildSupabaseOrderPayload(order: Order): Record<string, any> {
  const addressObj: any = typeof order.address === 'object' && order.address !== null
    ? { ...order.address }
    : { formatted: String(order.address || '') };

  // Securely preserve all checkout parameters in address.checkout_data
  addressObj.checkout_data = {
    paymentDetails: (order as any).paymentDetails || null,
    phonePeNumber: (order as any).phonePeNumber || null,
    upiDetails: (order as any).upiDetails || null,
    deliveryPartnerId: order.deliveryPartnerId || null,
    deliveryPartnerName: order.deliveryPartnerName || null,
    deliveryPartnerPhone: order.deliveryPartnerPhone || null,
    deliveryPartnerAvatar: (order as any).deliveryPartnerAvatar || null,
    deliveryPartnerVehicle: (order as any).deliveryPartnerVehicle || null,
    deliveryPartnerStatus: order.deliveryPartnerStatus || null,
    deliveryInstructions: order.deliveryInstructions || order.instructions || null,
    deliveryNotes: order.deliveryInstructions || order.instructions || null,
    eta: order.eta || 25,
    scheduledTime: (order as any).scheduledTime || null,
    pointsEarned: (order as any).pointsEarned || 0,
    pointsRedeemed: (order as any).pointsRedeemed || 0,
    trackingHistory: order.trackingHistory || [],
    rating: order.rating || null,
    feedback: order.feedback || null,
    customerEmail: order.customerEmail || null,
    customerWhatsappNumber: order.customerWhatsappNumber || null,
    whatsappOptIn: Boolean(order.whatsappOptIn),
    whatsappOptInAt: order.whatsappOptInAt || null,
    restaurantName: order.restaurantName || null,
    placedAt: order.date || new Date().toISOString(),
    rejectionReason: order.rejectionReason || null,
    cancellationReason: order.cancellationReason || null,
    idempotencyKey: order.idempotencyKey || null,
    hiddenByCustomer: Boolean(order.hiddenByCustomer)
  };

  return {
    id: String(order.id),
    customer_id: String(order.customerId || ''),
    customer_phone: String(order.customerPhone || ''),
    customer_name: String(order.customerName || 'Customer'),
    items: Array.isArray(order.items) ? order.items : [],
    subtotal: Number(order.subtotal || 0),
    discount: Number(order.discount || 0),
    delivery_fee: Number(order.deliveryFee !== undefined ? order.deliveryFee : 0),
    packaging_fee: Number(order.packagingFee !== undefined ? order.packagingFee : 0),
    tax: Number(order.tax || 0),
    tip: Number(order.tip || 0),
    final_amount: Number(order.finalAmount !== undefined ? order.finalAmount : 0),
    status: String(order.status || 'accepted'),
    address: addressObj,
    instructions: String(order.deliveryInstructions || order.instructions || ''),
    coupon_used: String(order.couponUsed || ''),
    payment_method: String(order.paymentMethod || 'UPI'),
    payment_status: String(order.paymentStatus || 'pending'),
    date: order.date || new Date().toISOString(),
    created_at: order.date || new Date().toISOString()
  };
}

/**
 * Normalizes database rows from Supabase into our strongly-typed Order object,
 * extracting both standard table columns and embedded checkout data.
 */
export function mapSupabaseRowToOrder(row: any): Order {
  const items = Array.isArray(row.items) ? row.items : [];
  const checkoutData = (row.address && typeof row.address === 'object' && row.address.checkout_data) || {};

  return {
    id: String(row.id || `ord_${Date.now()}`),
    customerId: String(row.customer_id || row.customerId || ''),
    customerPhone: String(row.customer_phone || row.customerPhone || ''),
    customerName: String(row.customer_name || row.customerName || 'Customer'),
    customerEmail: row.customer_email || row.customerEmail || checkoutData.customerEmail || undefined,
    customerWhatsappNumber: row.customer_whatsapp || row.customerWhatsappNumber || checkoutData.customerWhatsappNumber || undefined,
    whatsappOptIn: row.whatsapp_consent !== undefined
      ? Boolean(row.whatsapp_consent)
      : (row.whatsappOptIn !== undefined ? Boolean(row.whatsappOptIn) : Boolean(checkoutData.whatsappOptIn)),
    whatsappOptInAt: row.whatsapp_consent_at || row.whatsappOptInAt || checkoutData.whatsappOptInAt || undefined,
    restaurantName: row.restaurant_name || row.restaurantName || checkoutData.restaurantName || undefined,
    items: items.map((i: any, idx: number) => ({
      id: String(i.id || `item_${idx}`),
      foodItem: i.foodItem || {
        id: String(i.foodItemId || i.id || `food_${idx}`),
        name: i.name || i.foodName || 'Special Dish',
        price: Number(i.price || 0),
        category: i.category || 'Special',
        image: i.image || i.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
        vegIndicator: i.vegIndicator || 'veg',
        description: i.description || ''
      },
      quantity: Number(i.quantity || 1),
      selectedCustomizations: i.selectedCustomizations || []
    })),
    subtotal: Number(row.subtotal || 0),
    discount: Number(row.discount || 0),
    deliveryFee: Number(row.delivery_fee !== undefined ? row.delivery_fee : (row.deliveryFee || 0)),
    packagingFee: Number(row.packaging_fee !== undefined ? row.packaging_fee : (row.packagingFee || 0)),
    tax: Number(row.tax || 0),
    tip: Number(row.tip || 0),
    finalAmount: Number(row.final_amount !== undefined ? row.final_amount : (row.finalAmount || row.totalAmount || 0)),
    status: (row.status || 'accepted') as OrderStatus,
    address: row.address || {
      id: 'addr_default',
      type: 'Home',
      flatNo: 'Nuvvo Residence',
      area: 'Chirala Main Road',
      city: 'Chirala'
    },
    instructions: row.instructions || row.delivery_instructions || checkoutData.deliveryInstructions || checkoutData.instructions || checkoutData.deliveryNotes || '',
    deliveryInstructions: row.delivery_instructions || row.instructions || checkoutData.deliveryInstructions || checkoutData.instructions || checkoutData.deliveryNotes || '',
    couponUsed: row.coupon_used || row.couponUsed || '',
    paymentMethod: row.payment_method || row.paymentMethod || 'UPI',
    paymentStatus: row.payment_status || row.paymentStatus || 'success',
    deliveryPartnerStatus: row.delivery_partner_status || checkoutData.deliveryPartnerStatus || 'Awaiting Delivery Partner Assignment',
    date: row.created_at || row.date || new Date().toISOString(),
    eta: Number(row.eta || checkoutData.eta || 25),
    trackingHistory: Array.isArray(row.tracking_history)
      ? row.tracking_history
      : (Array.isArray(checkoutData.trackingHistory) ? checkoutData.trackingHistory : []),
    deliveryPartnerId: row.delivery_partner_id || checkoutData.deliveryPartnerId,
    deliveryPartnerName: row.delivery_partner_name || checkoutData.deliveryPartnerName,
    deliveryPartnerPhone: row.delivery_partner_phone || checkoutData.deliveryPartnerPhone,
    deliveryPartnerAvatar: checkoutData.deliveryPartnerAvatar,
    deliveryPartnerVehicle: checkoutData.deliveryPartnerVehicle,
    phonePeNumber: row.phonepe_number || checkoutData.phonePeNumber,
    paymentDetails: checkoutData.paymentDetails,
    upiDetails: checkoutData.upiDetails,
    scheduledTime: checkoutData.scheduledTime,
    pointsEarned: checkoutData.pointsEarned,
    pointsRedeemed: checkoutData.pointsRedeemed,
    rating: row.rating ? Number(row.rating) : (checkoutData.rating ? Number(checkoutData.rating) : undefined),
    feedback: row.feedback || checkoutData.feedback,
    rejectionReason: row.rejection_reason || row.rejectionReason || checkoutData.rejectionReason || undefined,
    cancellationReason: row.cancellation_reason || row.cancellationReason || checkoutData.cancellationReason || undefined,
    idempotencyKey: row.idempotency_key || checkoutData.idempotencyKey || undefined,
    hiddenByCustomer: Boolean(row.hidden_by_customer || row.hiddenByCustomer || checkoutData.hiddenByCustomer)
  };
}

/**
 * Fetches ONLY the authenticated customer's own past orders via authenticated backend API
 * (and user-scoped Supabase RLS fallback), cached strictly by customer userId.
 */
export async function fetchUserOrdersFromSupabase(
  phone: string,
  force: boolean = false,
  userId?: string
): Promise<{
  data: Order[] | null;
  error: any | null;
  fromSupabase: boolean;
}> {
  const token = await getActiveAuthToken();
  if (!token || (!userId && !phone)) {
    return { data: [], error: null, fromSupabase: false };
  }

  const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
  const digits = cleanPhone.length === 12 && cleanPhone.startsWith('91') ? cleanPhone.slice(2) : cleanPhone;
  const scopeKey = userId ? `id:${userId}` : `phone:${digits}`;

  return tanstackQueryClient.fetchQuery({
    queryKey: QUERY_KEYS.USER_ORDERS(scopeKey),
    staleTime: force ? 0 : STALE_TIMES.USER_ORDERS,
    queryFn: async () => {
      try {
        // 1. Primary authenticated server endpoint (strictly customer-isolated by Bearer token)
        const resp = await fetch('/api/orders?nocache=true', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (resp.ok) {
          const rows = await resp.json();
          if (Array.isArray(rows)) {
            return {
              data: rows.map(mapSupabaseRowToOrder).filter(o => !o.hiddenByCustomer),
              error: null,
              fromSupabase: true
            };
          }
        }
      } catch {}

      // 2. User-scoped Supabase query fallback (enforces RLS & customer_id filter)
      try {
        if (!userId) {
          return { data: [], error: null, fromSupabase: false };
        }
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('customer_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          if (error.code === 'PGRST205') {
            return { data: [], error: null, fromSupabase: false };
          }
          return { data: null, error, fromSupabase: false };
        }

        if (data && Array.isArray(data)) {
          return {
            data: data.map(mapSupabaseRowToOrder).filter(o => !o.hiddenByCustomer),
            error: null,
            fromSupabase: true
          };
        }

        return { data: [], error: null, fromSupabase: true };
      } catch (err: any) {
        return { data: null, error: err, fromSupabase: false };
      }
    }
  });
}

/**
 * Fetches all orders for authorized Admin/Super Admin sessions via authenticated backend API.
 */
export async function fetchAllOrdersFromSupabase(force: boolean = false): Promise<{
  data: Order[] | null;
  error: any | null;
  fromSupabase: boolean;
}> {
  const token = await getActiveAuthToken();
  if (!token) {
    return { data: [], error: null, fromSupabase: false };
  }

  return tanstackQueryClient.fetchQuery({
    queryKey: QUERY_KEYS.ALL_ORDERS,
    staleTime: force ? 0 : STALE_TIMES.ALL_ORDERS,
    queryFn: async () => {
      try {
        const resp = await fetch('/api/orders?nocache=true', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (resp.ok) {
          const rows = await resp.json();
          if (Array.isArray(rows)) {
            return { data: rows.map(mapSupabaseRowToOrder), error: null, fromSupabase: true };
          }
        }
      } catch {}

      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          if (error.code === 'PGRST205') {
            return { data: [], error: null, fromSupabase: false };
          }
          return { data: null, error, fromSupabase: false };
        }

        if (data && Array.isArray(data)) {
          const mapped = data.map(mapSupabaseRowToOrder);
          return { data: mapped, error: null, fromSupabase: true };
        }

        return { data: [], error: null, fromSupabase: true };
      } catch (err: any) {
        return { data: null, error: err, fromSupabase: false };
      }
    }
  });
}

/**
 * Saves placed order to authenticated backend (/api/orders which enforces ownership,
 * Supabase persistence, and automatic WhatsApp Cloud API dispatch) with RLS-scoped sync fallback.
 */
export async function saveOrderToSupabase(order: Order): Promise<{ success: boolean; error?: string; whatsappNotification?: any }> {
  try {
    const token = await getActiveAuthToken();
    const basePayload = buildSupabaseOrderPayload(order);
    const backendPayload = {
      ...basePayload,
      customerEmail: order.customerEmail || '',
      customerWhatsappNumber: order.customerWhatsappNumber || '',
      whatsappOptIn: Boolean(order.whatsappOptIn),
      whatsappOptInAt: order.whatsappOptInAt || null,
      restaurantName: order.restaurantName || ''
    };

    // 1. Primary authoritative authenticated backend POST
    let backendResJson: any = null;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (order.idempotencyKey) headers['Idempotency-Key'] = order.idempotencyKey;
      const resp = await fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify(backendPayload)
      });
      backendResJson = await resp.json().catch(() => null);
    } catch (err) {
      console.warn('Backend order proxy notice:', err);
    }

    // 2. Direct Supabase database upsert if backend didn't already persist it
    let error: any = null;
    if (!backendResJson?.supabaseSaved) {
      const extendedPayload = {
        ...basePayload,
        customer_email: order.customerEmail || null,
        customer_whatsapp: order.customerWhatsappNumber || null,
        whatsapp_consent: Boolean(order.whatsappOptIn),
        whatsapp_consent_at: order.whatsappOptIn ? (order.whatsappOptInAt || new Date().toISOString()) : null,
        restaurant_name: order.restaurantName || null
      };

      const upsertRes = await supabase
        .from('orders')
        .upsert([extendedPayload], { onConflict: 'id' });
      error = upsertRes.error;

      if (error && (error.message?.includes('column') || error.code === 'PGRST204')) {
        const fallbackRes = await supabase
          .from('orders')
          .upsert([basePayload], { onConflict: 'id' });
        error = fallbackRes.error;
      }
    }

    if (error && !backendResJson?.supabaseSaved) {
      console.warn('[Supabase Orders] Direct upsert notice:', error.message);
      if (error.code === 'PGRST205') {
        return {
          success: Boolean(backendResJson?.success),
          error: 'orders_table_unmigrated',
          whatsappNotification: backendResJson?.whatsappNotification
        };
      }
      return {
        success: Boolean(backendResJson?.success),
        error: error.message,
        whatsappNotification: backendResJson?.whatsappNotification
      };
    }

    // 3. Broadcast mutation event over real-time channel
    broadcastOrderMutation('INSERT', order).catch(() => {});

    // Invalidate TanStack Query orders cache
    invalidateOrders();

    return {
      success: Boolean(backendResJson?.success ?? true),
      whatsappNotification: backendResJson?.whatsappNotification
    };
  } catch (err: any) {
    console.warn('[Supabase Orders] saveOrderToSupabase exception notice:', err?.message || err);
    return { success: false, error: err?.message || 'Database error' };
  }
}

/**
 * Updates an existing order in Supabase orders table & notifies authenticated backend for WhatsApp status templates.
 */
export async function updateOrderInSupabase(
  orderId: string,
  updatedFields: Partial<Order>
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getActiveAuthToken();
    const payload: Record<string, any> = {};
    if (updatedFields.status) payload.status = updatedFields.status;
    if (updatedFields.paymentStatus) payload.payment_status = updatedFields.paymentStatus;
    if (updatedFields.finalAmount !== undefined) payload.final_amount = updatedFields.finalAmount;
    if (updatedFields.instructions || updatedFields.deliveryInstructions) {
      payload.instructions = updatedFields.deliveryInstructions || updatedFields.instructions;
    }
    if (updatedFields.items) payload.items = updatedFields.items;
    if (updatedFields.address) payload.address = updatedFields.address;

    // 1. Authenticated Server API update
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedFields)
      }).catch(() => {});
    } catch {}

    // 2. Direct Supabase update if we have direct fields
    if (Object.keys(payload).length > 0) {
      const { error } = await supabase
        .from('orders')
        .update(payload)
        .eq('id', orderId);

      if (error && error.code !== 'PGRST205') {
        console.warn('[Supabase Orders] update error:', error.message);
      }
    }

    invalidateOrders();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Database error' };
  }
}

/**
 * Updates an order status to 'cancelled' or removes an order under verified ownership.
 */
export async function cancelOrderInSupabase(
  orderId: string,
  options?: { clearFromHistory?: boolean; cancellationReason?: string }
): Promise<{ success: boolean; cleared?: boolean; error?: string }> {
  try {
    const { clearFromHistory = false } = options || {};
    const token = await getActiveAuthToken();

    if (clearFromHistory) {
      // Soft-archive for customer view via authenticated backend DELETE (which hides row for customer while preserving accounting records)
      try {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
          method: 'DELETE',
          headers
        });
      } catch {}

      invalidateOrders();
      return { success: true, cleared: true };
    }

    const patchPayload: Partial<Order> = {
      status: 'cancelled',
      paymentStatus: 'refund_initiated',
      ...(options?.cancellationReason ? { cancellationReason: options.cancellationReason } : {})
    };

    const res = await updateOrderInSupabase(orderId, patchPayload);
    if (!res.success) {
      return res;
    }

    invalidateOrders();
    return { success: true, cleared: false };
  } catch (err: any) {
    console.error('[Supabase Orders] cancelOrderInSupabase exception:', err);
    return { success: false, error: err?.message || 'Failed to cancel order.' };
  }
}

/**
 * Broadcasts an order mutation event across active client sessions.
 */
export async function broadcastOrderMutation(
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  order: Order
): Promise<void> {
  try {
    const channel = supabase.channel(LIVE_ORDERS_CHANNEL);
    await channel.send({
      type: 'broadcast',
      event: 'order_mutation',
      payload: {
        eventType,
        order,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.warn('Realtime order broadcast notice:', err);
  }
}
