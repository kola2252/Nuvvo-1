/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../utils/supabase/client';
import { Order, OrderStatus } from '../types';

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
    eta: order.eta || 25,
    scheduledTime: (order as any).scheduledTime || null,
    pointsEarned: (order as any).pointsEarned || 0,
    pointsRedeemed: (order as any).pointsRedeemed || 0,
    trackingHistory: order.trackingHistory || [],
    rating: order.rating || null,
    feedback: order.feedback || null,
    placedAt: order.date || new Date().toISOString()
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
    instructions: String(order.instructions || ''),
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
    instructions: row.instructions || '',
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
    feedback: row.feedback || checkoutData.feedback
  };
}

/**
 * Fetches user past orders from Supabase public.orders table.
 */
export async function fetchUserOrdersFromSupabase(phone: string): Promise<{
  data: Order[] | null;
  error: any | null;
  fromSupabase: boolean;
}> {
  if (!phone) {
    return { data: [], error: null, fromSupabase: false };
  }

  const cleanPhone = phone.replace(/\D/g, '');
  const digits = cleanPhone.length === 12 && cleanPhone.startsWith('91') ? cleanPhone.slice(2) : cleanPhone;

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .or(`customer_phone.eq.${digits},customer_phone.eq.+91${digits},customer_phone.eq.91${digits}`)
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

/**
 * Fetches all orders from Supabase public.orders table (for Admin & SuperAdmin panels).
 */
export async function fetchAllOrdersFromSupabase(): Promise<{
  data: Order[] | null;
  error: any | null;
  fromSupabase: boolean;
}> {
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

/**
 * Saves placed order to Supabase orders table with backend persistence fallback.
 * Emits realtime broadcast to sync with all listening client instances.
 */
export async function saveOrderToSupabase(order: Order): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = buildSupabaseOrderPayload(order);

    // 1. Dual persistence: Send to server backend /api/orders
    try {
      fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => {
        console.warn('Backend order proxy notice:', err);
      });
    } catch {}

    // 2. Direct Supabase database upsert
    const { error } = await supabase
      .from('orders')
      .upsert([payload], { onConflict: 'id' });

    if (error) {
      console.error('[Supabase Orders] Direct upsert error:', error.message);
      if (error.code === 'PGRST205') {
        return { success: false, error: 'orders_table_unmigrated' };
      }
      return { success: false, error: error.message };
    }

    // 3. Broadcast mutation event over real-time channel
    broadcastOrderMutation('INSERT', order).catch(() => {});

    return { success: true };
  } catch (err: any) {
    console.error('[Supabase Orders] saveOrderToSupabase exception:', err);
    return { success: false, error: err?.message || 'Database error' };
  }
}

/**
 * Updates an existing order in Supabase orders table.
 */
export async function updateOrderInSupabase(
  orderId: string,
  updatedFields: Partial<Order>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Only pass schema-compliant columns to direct update
    const payload: Record<string, any> = {};
    if (updatedFields.status) payload.status = updatedFields.status;
    if (updatedFields.paymentStatus) payload.payment_status = updatedFields.paymentStatus;
    if (updatedFields.finalAmount !== undefined) payload.final_amount = updatedFields.finalAmount;
    if (updatedFields.instructions) payload.instructions = updatedFields.instructions;
    if (updatedFields.items) payload.items = updatedFields.items;
    if (updatedFields.address) payload.address = updatedFields.address;

    // 1. Attempt server API update
    try {
      fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Database error' };
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
