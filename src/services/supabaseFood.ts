import { supabase } from '../utils/supabase/client';
import { FoodItem, VegIndicator } from '../types';

export interface SupabaseFoodRow {
  id: string | number;
  created_at?: string;
  name: string;
  description?: string | null;
  price: number;
  category: string;
  image_url?: string | null;
  is_available?: boolean | null;
  [key: string]: any;
}

/**
 * Maps a Supabase row from public.food_items to the app FoodItem format.
 */
export function mapSupabaseRowToFoodItem(row: SupabaseFoodRow): FoodItem {
  const imageUrl =
    row.image_url ||
    row.image ||
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80';

  const isAvailable = row.is_available !== false && row.isAvailable !== false;
  const cat = String(row.category || 'Specialty').trim();
  const lowerCat = cat.toLowerCase();
  const lowerName = String(row.name || '').toLowerCase();

  // Infer veg indicator if not directly stored in table
  const isVeg =
    row.veg_indicator === 'Veg' ||
    row.vegIndicator === 'Veg' ||
    (lowerCat.includes('veg') && !lowerCat.includes('non')) ||
    lowerName.includes('paneer') ||
    lowerName.includes('veg') ||
    lowerName.includes('dal') ||
    lowerName.includes('idli') ||
    lowerName.includes('dosa');

  return {
    id: String(row.id),
    name: String(row.name || 'Specialty Dish'),
    description: String(row.description || ''),
    price: Number(row.price) || 0,
    category: cat,
    subcategory: row.subcategory || 'Classic Signature',
    image: imageUrl,
    image_url: imageUrl,
    is_available: isAvailable,
    isAvailable: isAvailable,
    vegIndicator: isVeg ? VegIndicator.VEG : VegIndicator.NON_VEG,
    rating: Number(row.rating) || 4.7,
    reviewsCount: Number(row.reviews_count) || 24,
    prepTime: Number(row.prep_time) || 20,
    ingredients: Array.isArray(row.ingredients)
      ? row.ingredients
      : ['Fresh premium ingredients', 'House special spices'],
    spiceLevel: row.spice_level || 'Medium',
    reviews: [],
    restaurantId: row.restaurant_id || row.restaurantId || undefined,
    created_at: row.created_at
  };
}

/**
 * Maps input FoodItem fields to the Supabase public.food_items schema.
 * Requirements:
 * name -> name
 * description -> description
 * price -> price
 * category -> category
 * image -> image_url
 * availability -> is_available
 */
export function mapFoodItemToSupabaseRow(item: Partial<FoodItem>): Partial<SupabaseFoodRow> {
  const isAvailable =
    item.is_available !== undefined
      ? Boolean(item.is_available)
      : item.isAvailable !== undefined
      ? Boolean(item.isAvailable)
      : true;

  const imageUrl = item.image_url || item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80';
  const isVeg = item.vegIndicator === VegIndicator.VEG || String(item.vegIndicator || '').toLowerCase() === 'veg';

  return {
    name: item.name ? String(item.name).trim() : 'Specialty Dish',
    description: item.description ? String(item.description).trim() : '',
    price: Number(item.price) || 0,
    category: item.category ? String(item.category).trim() : 'Specialty',
    subcategory: item.subcategory ? String(item.subcategory).trim() : 'Classic',
    image_url: imageUrl,
    is_available: isAvailable,
    veg_indicator: isVeg ? 'Veg' : 'NonVeg',
    rating: Number(item.rating) || 4.8,
    reviews_count: Number(item.reviewsCount) || 12,
    prep_time: Number(item.prepTime) || 20,
    spice_level: item.spiceLevel || 'Medium',
    restaurant_id: item.restaurantId || 'rest_1'
  };
}

/**
 * Fetch all food items from Supabase public.food_items.
 */
export async function getFoodItemsFromSupabase(): Promise<{
  data: FoodItem[] | null;
  error: any | null;
}> {
  try {
    const { data, error } = await supabase
      .from('food_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase getFoodItems error:', error);
      return { data: null, error };
    }

    const mapped = (data || []).map(mapSupabaseRowToFoodItem);
    return { data: mapped, error: null };
  } catch (err: any) {
    console.error('Failed to query Supabase food_items table:', err);
    return { data: null, error: err };
  }
}

/**
 * Insert a new food item into Supabase public.food_items.
 */
export async function insertFoodItemToSupabase(item: Partial<FoodItem>): Promise<{
  data: FoodItem | null;
  error: any | null;
}> {
  try {
    const payload = mapFoodItemToSupabaseRow(item);

    const { data, error } = await supabase
      .from('food_items')
      .insert([payload])
      .select();

    if (error) {
      console.error('Supabase insertFoodItem error:', error);
      return { data: null, error };
    }

    if (data && data[0]) {
      return { data: mapSupabaseRowToFoodItem(data[0]), error: null };
    }

    return { data: null, error: new Error('No record returned after insert') };
  } catch (err: any) {
    console.error('Failed to insert into Supabase food_items:', err);
    return { data: null, error: err };
  }
}

/**
 * Update an existing food item in Supabase public.food_items.
 */
export async function updateFoodItemInSupabase(
  id: string,
  updatedFields: Partial<FoodItem>
): Promise<{
  data: FoodItem | null;
  error: any | null;
}> {
  try {
    const payload: Partial<SupabaseFoodRow> = {};

    if (updatedFields.name !== undefined) payload.name = String(updatedFields.name).trim();
    if (updatedFields.description !== undefined) payload.description = String(updatedFields.description).trim();
    if (updatedFields.price !== undefined) payload.price = Number(updatedFields.price);
    if (updatedFields.category !== undefined) payload.category = String(updatedFields.category).trim();
    if (updatedFields.image_url !== undefined || updatedFields.image !== undefined) {
      payload.image_url = updatedFields.image_url || updatedFields.image;
    }
    if (updatedFields.is_available !== undefined || updatedFields.isAvailable !== undefined) {
      payload.is_available =
        updatedFields.is_available !== undefined
          ? Boolean(updatedFields.is_available)
          : Boolean(updatedFields.isAvailable);
    }

    const { data, error } = await supabase
      .from('food_items')
      .update(payload)
      .eq('id', id)
      .select();

    if (error) {
      console.error('Supabase updateFoodItem error:', error);
      return { data: null, error };
    }

    if (data && data[0]) {
      return { data: mapSupabaseRowToFoodItem(data[0]), error: null };
    }

    return { data: null, error: null };
  } catch (err: any) {
    console.error('Failed to update Supabase food_items record:', err);
    return { data: null, error: err };
  }
}

/**
 * Delete or disable a food item in Supabase public.food_items.
 */
export async function deleteFoodItemFromSupabase(id: string): Promise<{
  success: boolean;
  error: any | null;
}> {
  try {
    const { error } = await supabase
      .from('food_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase deleteFoodItem error:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('Failed to delete Supabase food_items record:', err);
    return { success: false, error: err };
  }
}

/**
 * Bulk seed food items into Supabase public.food_items.
 */
export async function seedFoodItemsToSupabase(items: FoodItem[]): Promise<{
  count: number;
  error: any | null;
}> {
  try {
    const payload = items.map(mapFoodItemToSupabaseRow);
    const { data, error } = await supabase
      .from('food_items')
      .insert(payload)
      .select();

    if (error) {
      console.error('Supabase seedFoodItems error:', error);
      return { count: 0, error };
    }

    return { count: data?.length || 0, error: null };
  } catch (err: any) {
    console.error('Failed to seed Supabase food_items:', err);
    return { count: 0, error: err };
  }
}

export const LIVE_FOOD_SYNC_CHANNEL = 'nuvo_food_items_live_sync';

export interface FoodMutationBroadcastPayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  item?: FoodItem;
  id?: string;
  updatedFields?: Partial<FoodItem>;
  senderSessionId?: string;
  timestamp: number;
}

// Global session id to differentiate local mutations from remote peer events
export const CLIENT_SESSION_ID = `sess_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;

/**
 * Broadcast an instant food item modification event across all connected devices.
 * This guarantees real-time synchronization even if Postgres publication (CDC) is delayed.
 */
export async function broadcastFoodMutation(
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: { item?: FoodItem; id?: string; updatedFields?: Partial<FoodItem> }
): Promise<void> {
  try {
    const channel = supabase.channel(LIVE_FOOD_SYNC_CHANNEL);
    await channel.send({
      type: 'broadcast',
      event: 'food_item_mutation',
      payload: {
        eventType,
        ...payload,
        senderSessionId: CLIENT_SESSION_ID,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.warn('Realtime broadcast emission notice:', err);
  }
}

/**
 * Broadcast an instant payment settings modification event across all customer devices.
 * Updates PhonePe UPI ID, bank account reference, and QR settings in real time.
 */
export async function broadcastPaymentSettingsMutation(
  settings: any
): Promise<void> {
  try {
    const channel = supabase.channel(LIVE_FOOD_SYNC_CHANNEL);
    await channel.send({
      type: 'broadcast',
      event: 'payment_settings_mutation',
      payload: {
        settings,
        senderSessionId: CLIENT_SESSION_ID,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.warn('Realtime payment broadcast emission notice:', err);
  }
}

/**
 * Broadcast an instant restaurant modification event across all connected customer and Play Store apps.
 */
export async function broadcastRestaurantMutation(
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: { item?: any; id?: string; updatedFields?: any }
): Promise<void> {
  try {
    const channel = supabase.channel(LIVE_FOOD_SYNC_CHANNEL);
    await channel.send({
      type: 'broadcast',
      event: 'restaurant_mutation',
      payload: {
        eventType,
        ...payload,
        senderSessionId: CLIENT_SESSION_ID,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.warn('Realtime restaurant broadcast emission notice:', err);
  }
}

/**
 * Broadcast an instant hotel modification event across all connected customer devices.
 */
export async function broadcastHotelMutation(
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: { item?: any; id?: string; updatedFields?: any }
): Promise<void> {
  try {
    const channel = supabase.channel(LIVE_FOOD_SYNC_CHANNEL);
    await channel.send({
      type: 'broadcast',
      event: 'hotel_mutation',
      payload: {
        eventType,
        ...payload,
        senderSessionId: CLIENT_SESSION_ID,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    console.warn('Realtime hotel broadcast emission notice:', err);
  }
}

