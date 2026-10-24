/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../utils/supabase/client';
import { Order, OrderStatus } from '../types';

/**
 * Normalizes database rows from Supabase into our strongly-typed Order object.
 */
export function mapSupabaseRowToOrder(row: any): Order {
  const items = Array.isArray(row.items) ? row.items : [];
  
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
    status: (row.status || 'delivered') as OrderStatus,
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
    deliveryPartnerStatus: row.delivery_partner_status || row.deliveryPartnerStatus,
    date: row.created_at || row.date || new Date().toISOString(),
    eta: Number(row.eta || 0),
    trackingHistory: Array.isArray(row.tracking_history) ? row.tracking_history : (row.trackingHistory || []),
    deliveryPartnerId: row.delivery_partner_id || row.deliveryPartnerId,
    deliveryPartnerName: row.delivery_partner_name || row.deliveryPartnerName,
    deliveryPartnerPhone: row.delivery_partner_phone || row.deliveryPartnerPhone,
    rating: row.rating ? Number(row.rating) : undefined,
    feedback: row.feedback || undefined
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
    // Attempt query on Supabase orders table
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .or(`customer_phone.eq.${digits},customer_phone.eq.+91${digits},customerPhone.eq.${digits}`)
      .order('created_at', { ascending: false });

    if (error) {
      // Table doesn't exist yet (PGRST205) or RLS policy rejection
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
 */
export async function saveOrderToSupabase(order: Order): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      id: order.id,
      customer_id: order.customerId,
      customer_phone: order.customerPhone,
      customer_name: order.customerName,
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount,
      delivery_fee: order.deliveryFee,
      packaging_fee: order.packagingFee,
      tax: order.tax,
      tip: order.tip,
      final_amount: order.finalAmount,
      status: order.status,
      address: order.address,
      instructions: order.instructions,
      coupon_used: order.couponUsed,
      payment_method: order.paymentMethod,
      payment_status: order.paymentStatus,
      date: order.date,
      created_at: order.date
    };

    // 1. Attempt server API persistence
    try {
      fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch {}

    // 2. Direct Supabase upsert
    const { error } = await supabase
      .from('orders')
      .upsert([payload], { onConflict: 'id' });

    if (error) {
      if (error.code === 'PGRST205') {
        // Table not yet migrated in Supabase public schema
        return { success: false, error: 'orders_table_unmigrated' };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
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
    const payload: any = {};
    if (updatedFields.status) payload.status = updatedFields.status;
    if (updatedFields.paymentStatus) payload.payment_status = updatedFields.paymentStatus;
    if (updatedFields.deliveryPartnerStatus) payload.delivery_partner_status = updatedFields.deliveryPartnerStatus;
    if (updatedFields.deliveryPartnerId) payload.delivery_partner_id = updatedFields.deliveryPartnerId;
    if (updatedFields.deliveryPartnerName) payload.delivery_partner_name = updatedFields.deliveryPartnerName;
    if (updatedFields.deliveryPartnerPhone) payload.delivery_partner_phone = updatedFields.deliveryPartnerPhone;
    if (updatedFields.rating !== undefined) payload.rating = updatedFields.rating;
    if (updatedFields.feedback !== undefined) payload.feedback = updatedFields.feedback;
    if (updatedFields.trackingHistory) payload.tracking_history = updatedFields.trackingHistory;

    // 1. Attempt server API update
    try {
      fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch {}

    // 2. Direct Supabase update
    const { error } = await supabase
      .from('orders')
      .update(payload)
      .eq('id', orderId);

    if (error) {
      if (error.code === 'PGRST205') {
        return { success: false, error: 'orders_table_unmigrated' };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Database error' };
  }
}
