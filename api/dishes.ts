/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function for /api/dishes.
 * Directly queries Supabase REST API or serves resilient baseline menu with ZERO external npm dependencies.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bitxmpjuetvfbhdyfvok.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_-uXD4j7ITcsUZWT7_IDQ3A_AXLPWBCX";

// Baseline curated dishes for instant zero-dependency fallback
const BASELINE_DISHES = [
  {
    id: "dish_hyd_chk_biryani",
    name: "Hyderabadi Chicken Dum Biryani",
    description: "Fragrant layers of premium basmati rice cooked with marinated chicken pieces and original spices.",
    price: 320,
    category: "Biryani",
    subcategory: "Chicken",
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=600",
    image_url: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=600",
    isAvailable: true,
    is_available: true,
    vegIndicator: "Non-Veg",
    rating: 4.9,
    reviewsCount: 1420,
    prepTime: 25,
    spiceLevel: "Medium",
    restaurantId: "rest_1"
  },
  {
    id: "dish_mutton_dum_biryani",
    name: "Royal Mutton Dum Biryani",
    description: "Traditional slow-cooked Lucknow biryani spiced lightly with tenderized juicy goat meat cuts.",
    price: 420,
    category: "Biryani",
    subcategory: "Mutton",
    image: "https://images.unsplash.com/photo-1608500218900-8afa13d02791?auto=format&fit=crop&q=80&w=600",
    image_url: "https://images.unsplash.com/photo-1608500218900-8afa13d02791?auto=format&fit=crop&q=80&w=600",
    isAvailable: true,
    is_available: true,
    vegIndicator: "Non-Veg",
    rating: 4.8,
    reviewsCount: 880,
    prepTime: 30,
    spiceLevel: "Medium",
    restaurantId: "rest_2"
  },
  {
    id: "dish_zafrani_paneer_biryani",
    name: "Zafrani Paneer Makhani Biryani",
    description: "Rich saffron tinted basmati layered with tender paneer cubes cooked in a cream tomato gravy.",
    price: 280,
    category: "Biryani",
    subcategory: "Vegetarian",
    image: "https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&q=80&w=600",
    image_url: "https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&q=80&w=600",
    isAvailable: true,
    is_available: true,
    vegIndicator: "Veg",
    rating: 4.7,
    reviewsCount: 610,
    prepTime: 20,
    spiceLevel: "Mild",
    restaurantId: "rest_1"
  },
  {
    id: "dish_ghee_podi_dosa",
    name: "Ghee Podi Masala Dosa",
    description: "Golden crispy rice crepe topped with spicy gun powder and direct native pure ghee.",
    price: 140,
    category: "South Indian",
    subcategory: "Dosa",
    image: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=600",
    image_url: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=600",
    isAvailable: true,
    is_available: true,
    vegIndicator: "Veg",
    rating: 4.9,
    reviewsCount: 1950,
    prepTime: 15,
    spiceLevel: "Medium",
    restaurantId: "rest_3"
  },
  {
    id: "dish_butter_chicken_delight",
    name: "Classic Butter Chicken & Naan Combo",
    description: "Slow-simmered tender boneless chicken in buttery makhani gravy with charred garlic butter naan.",
    price: 360,
    category: "North Indian",
    subcategory: "Curries",
    image: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=600",
    image_url: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=600",
    isAvailable: true,
    is_available: true,
    vegIndicator: "Non-Veg",
    rating: 4.9,
    reviewsCount: 1100,
    prepTime: 25,
    spiceLevel: "Mild",
    restaurantId: "rest_1"
  },
  {
    id: "dish_chirala_prawns_fry",
    name: "Chirala Coastal Royyala Vepudu (Prawns Fry)",
    description: "Fresh coastal prawns sautéed with brown onions, crushed pepper, curry leaves, and green chillies.",
    price: 380,
    category: "Seafood",
    subcategory: "Starters",
    image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=600",
    image_url: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=600",
    isAvailable: true,
    is_available: true,
    vegIndicator: "Non-Veg",
    rating: 4.9,
    reviewsCount: 780,
    prepTime: 25,
    spiceLevel: "Spicy",
    restaurantId: "rest_1"
  }
];

export default async function handler(req: any, res: any) {
  // CORS setup
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  } catch {}

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true }));
  }

  try {
    // 1. Attempt native fetch directly from Supabase REST API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4-second fail-fast timeout

    const restUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/food_items?select=*&order=created_at.desc&limit=100`;
    const response = await fetch(restUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeout);

    if (response && response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const mappedDishes = data.map((row: any) => ({
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
          vegIndicator: row.veg_indicator || (row.vegIndicator ? String(row.vegIndicator) : 'Veg'),
          rating: Number(row.rating) || 4.8,
          reviewsCount: Number(row.reviews_count) || 12,
          prepTime: Number(row.prep_time) || 20,
          spiceLevel: row.spice_level || 'Medium',
          restaurantId: row.restaurant_id || 'rest_1',
          created_at: row.created_at
        }));

        res.statusCode = 200;
        return res.end(JSON.stringify(mappedDishes));
      }
    }
  } catch (err: any) {
    console.warn('[Dishes Serverless Warning] Direct Supabase fetch fallback engaged:', err?.message || err);
  }

  // Resilient fallback: Return baseline dishes so client NEVER receives an error
  res.statusCode = 200;
  return res.end(JSON.stringify(BASELINE_DISHES));
}
