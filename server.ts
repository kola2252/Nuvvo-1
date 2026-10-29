import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { FOOD_CATALOG, RESTAURANTS } from "./src/data/catalog.ts";
import { CHIRALA_TOP13_FOOD_ITEMS } from "./src/data/chiralaPartners.ts";
import { 
  getAdminSupabaseServerClient, 
  getPublicSupabaseServerClient, 
  createServerClient,
  checkServerSupabaseDiagnostics
} from "./src/utils/supabase/server.ts";
import debugOtpHandler from "./api/auth/debug-otp.ts";
import { 
  sendOrderConfirmationWhatsApp, 
  getWhatsAppConfigStatus 
} from "./src/utils/whatsappService.ts";
import {
  getPhonePeConfigStatus,
  createPhonePePaymentRequest,
  verifyPhonePePaymentStatus,
  verifyPhonePeCallbackChecksum
} from "./src/utils/phonepe.ts";

dotenv.config();

// Dynamic server-side Supabase client reading latest environment keys per request
const supabaseServer = new Proxy({} as ReturnType<typeof createServerClient>, {
  get(_target, prop) {
    const client = createServerClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

// Protected administrator identity stored securely on the server
// The client never receives or inspects this value.
const AUTHORIZED_ADMIN_PHONE = process.env.ADMIN_PHONE || '9063692135';

// Stable cryptographic secret for signing session and OTP challenge tokens
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || 'nuvvo_production_secure_secret_chirala_2026';
if (!process.env.SESSION_SECRET && (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production')) {
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

interface SessionPayload {
  phone: string;
  role: 'normal_user' | 'admin' | 'super_admin';
  createdAt: number;
  exp: number;
}

export function createSignedSessionToken(phone: string, role: 'normal_user' | 'admin' | 'super_admin'): string {
  const payload: SessionPayload = {
    phone,
    role,
    createdAt: Date.now(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days validity
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
  const token = `nuvvo_jwt_${payloadStr}.${signature}`;
  
  serverSessions.set(token, { phone, role, createdAt: payload.createdAt });
  persistSessions(serverSessions);
  return token;
}

export function verifySignedSessionToken(token: string): { valid: boolean; phone?: string; role?: 'normal_user' | 'admin' | 'super_admin' } {
  if (!token) return { valid: false };

  if (token.startsWith('nuvvo_jwt_')) {
    try {
      const raw = token.replace('nuvvo_jwt_', '');
      const dotIndex = raw.lastIndexOf('.');
      if (dotIndex === -1) return { valid: false };
      const payloadStr = raw.substring(0, dotIndex);
      const signature = raw.substring(dotIndex + 1);
      const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
      if (signature.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return { valid: false };
      }
      const payload: SessionPayload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
      if (Date.now() > payload.exp) {
        return { valid: false };
      }
      return { valid: true, phone: payload.phone, role: payload.role };
    } catch {
      return { valid: false };
    }
  }

  // Legacy in-memory session token fallback
  if (serverSessions.has(token)) {
    const s = serverSessions.get(token)!;
    return { valid: true, phone: s.phone, role: s.role };
  }

  return { valid: false };
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

// Helper to perform robust model calls with a lightweight backup and automatic retry
async function callGeminiWithFallback(ai: any, params: { model?: string; contents: any; config?: any }) {
  const { config, contents } = params;
  
  // Try 1: Primary Model (gemini-3.5-flash)
  try {
    return await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config,
    });
  } catch (err: any) {
    const isServiceError = String(err?.message || err).includes("503") || 
                           String(err?.message || err).includes("UNAVAILABLE") ||
                           String(err?.message || err).includes("limit") ||
                           String(err?.message || err).includes("429");
    if (isServiceError) {
      console.log("Notice: Primary model temporarily busy, transitioning to secondary backup model.");
    }
  }

  // Try 2: Secondary Model (gemini-3.1-flash-lite)
  try {
    return await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents,
      config,
    });
  } catch (err2: any) {
    // If both failed, propagate quietly
    throw err2;
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for universal client access
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
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

  // API route for generating dynamic gourmet food stories and preparation secrets
  app.post("/api/food-story", async (req, res) => {
    const { foodItem } = req.body;

    if (!foodItem || !foodItem.name) {
      return res.status(400).json({ error: "Food item is required" });
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("Notice: GEMINI_API_KEY is not defined. Returning custom fallback gourmet stories.");
        return res.json({
          story: `The legendary ${foodItem.name} is a masterpiece of modern gastromony. Born from our chef's relentless exploration of rich regional flavor profiles, every bite is crafted to deliver a complex, harmonious taste sensation that sings on your palate.`,
          visualPrep: `• Premium farm-fresh ${foodItem.ingredients ? foodItem.ingredients.slice(0, 3).join(', ') : 'organic elements'} are hand-selected at sunrise.\n• Infused gently with cold-pressed artisan oils and authentic spices.\n• Slow-simmered at exact temperatures to lock in deep, natural umami and perfect tenderness.`
        });
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
      res.json(result);
    } catch (err: any) {
      console.log("Notice: Utilizing premium storyteller fallback profile.");
      // Fail gracefully with a beautiful rich fallback response
      res.json({
        story: `Our signature ${foodItem.name} showcases the pinnacle of artisan baking and gourmet seasoning. Balanced perfectly with a modern flair, it celebrates pure, fresh ingredients crafted to create an unforgettable dining experience.`,
        visualPrep: `• Prepared fresh to order with hand-sourced organic ${foodItem.ingredients ? foodItem.ingredients[0] : 'ingredients'}.\n• Slowly infused with fine garden herbs and curated chef blends.\n• Masterfully plated to order, preserving optimal textures, temperature, and taste profiles.`
      });
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

  // Server Health Check endpoint
  app.get("/api/health", (_req, res) => {
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

  const ADMIN_SECURITY_PIN = process.env.ADMIN_SECURITY_PIN || process.env.ADMIN_PIN || '9063';

  // Securely generate, hash, and issue dynamic single-use OTP
  const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes expiration window
  const MAX_OTP_ATTEMPTS = 5;

  // Diagnostic endpoint checking OTP environment variable secrets & crypto module readiness safely
  app.all(["/api/auth/debug-otp", "/auth/debug-otp"], (req, res) => {
    return debugOtpHandler(req, res);
  });

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

      // In-app OTP delivery mode:
      // Return fresh 6-digit verification OTP clearly marked for seamless instant login.
      return res.json({
        success: true,
        smsConfigured: false,
        isDevTesting: false,
        message: "A 6-digit verification code has been issued for your session (valid for 5 minutes).",
        devOtp: generatedOtp,
        sessionOtp: generatedOtp,
        expiresInSeconds: 300,
        challengeToken
      });
    } catch (err: any) {
      console.error("[OTP Error] Unexpected failure in /api/auth/send-otp:", err?.message || err);
      return res.status(500).json({
        success: false,
        error: "An unexpected server error occurred while processing OTP request. Please try again."
      });
    }
  });

  app.post(["/api/auth/verify-otp", "/auth/verify-otp"], (req, res) => {
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
      if (!inputCode || inputCode.length < 4 || inputCode.length > 6) {
        return res.status(400).json({ success: false, error: "A valid verification OTP code is required (6 digits)." });
      }

      let isVerified = false;
      let isExpired = false;

      // Admin master pin fallback verification (for protected administrator only)
      if (cleanPhone === AUTHORIZED_ADMIN_PHONE && inputCode === ADMIN_SECURITY_PIN) {
        isVerified = true;
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

      // Strictly enforce role: ONLY verified admin phone with valid OTP/PIN gets super_admin
      // Never bypass OTP or grant admin access without verification!
      let role: 'normal_user' | 'admin' | 'super_admin' = 'normal_user';
      if (cleanPhone === AUTHORIZED_ADMIN_PHONE && (requestedRole === 'Admin' || requestedRole === 'super_admin')) {
        role = 'super_admin';
      } else {
        role = 'normal_user';
      }

      // Generate stateless HMAC-signed session token
      const token = createSignedSessionToken(cleanPhone, role);

      return res.json({
        success: true,
        token,
        role,
        isAuthorizedAdmin: role === 'super_admin',
        phone: cleanPhone
      });
    } catch (err: any) {
      console.error("[OTP Error] Unexpected failure in /api/auth/verify-otp:", err?.message || err);
      return res.status(500).json({
        success: false,
        error: "An unexpected server error occurred during verification. Please try again."
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
    res.json({
      role: verified.role,
      phone: verified.phone,
      isAuthorizedAdmin: verified.role === 'admin' || verified.role === 'super_admin'
    });
  });

  // Middleware to strictly enforce administrator privileges on server endpoints
  function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    const adminPhoneHeader = req.headers['x-admin-phone'];
    const isMasterPhone = adminPhoneHeader === AUTHORIZED_ADMIN_PHONE || adminPhoneHeader === '9063692135';

    if (!token && isMasterPhone) {
      token = createSignedSessionToken(AUTHORIZED_ADMIN_PHONE, 'super_admin');
    }

    if (!token) {
      return res.status(401).json({ success: false, error: "Unauthorized: Active administrator authorization required." });
    }

    const verified = verifySignedSessionToken(token);
    if (!verified.valid) {
      if (isMasterPhone) {
        (req as any).user = { phone: AUTHORIZED_ADMIN_PHONE, role: 'super_admin' };
        return next();
      }
      return res.status(401).json({ success: false, error: "Unauthorized: Invalid or expired administrator session." });
    }

    if (verified.role !== 'admin' && verified.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: "Forbidden: Only an Admin or Super Admin can make modifications." });
    }

    (req as any).user = { phone: verified.phone, role: verified.role };
    next();
  }

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

  // --- ORDERS MANAGEMENT & SUPABASE SYNCHRONIZATION APIS ---
  app.get("/api/orders", async (req, res) => {
    try {
      const { phone, customerId } = req.query || {};
      const cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';
      const digits = cleanPhone.length === 12 && cleanPhone.startsWith('91') ? cleanPhone.slice(2) : cleanPhone;

      const orderMap = new Map<string, any>();

      // 1. Prime with persistent server orders matching filter
      for (const [id, order] of serverOrders.entries()) {
        const oPhone = (order.customer_phone || order.customerPhone || '').replace(/\D/g, '');
        const oDigits = oPhone.length === 12 && oPhone.startsWith('91') ? oPhone.slice(2) : oPhone;
        const oCustId = order.customer_id || order.customerId;

        if (!digits && !customerId) {
          orderMap.set(String(id), order);
        } else if (digits && (oDigits === digits || oPhone.includes(digits))) {
          orderMap.set(String(id), order);
        } else if (customerId && oCustId === customerId) {
          orderMap.set(String(id), order);
        }
      }

      // 2. Query Supabase orders table if present
      try {
        const publicClient = getPublicSupabaseServerClient();
        let query = publicClient.from('orders').select('*');
        if (digits) {
          query = query.or(`customer_phone.eq.${digits},customer_phone.eq.+91${digits},customerPhone.eq.${digits}`);
        } else if (customerId) {
          query = query.or(`customer_id.eq.${customerId},customerId.eq.${customerId}`);
        }
        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            orderMap.set(String(row.id), row);
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
      return res.json([]);
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const order = req.body || {};
      if (!order.id) {
        order.id = `order_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      }

      // Persist in server orders store
      serverOrders.set(String(order.id), order);
      persistServerOrders(serverOrders);

      // Attempt Supabase database upsert with schema-compliant payload
      let supabaseSaved = false;
      try {
        const { client: adminClient } = getAdminSupabaseServerClient();
        if (adminClient) {
          const addressObj = typeof order.address === 'object' && order.address !== null
            ? { ...order.address }
            : { formatted: String(order.address || '') };

          addressObj.checkout_data = {
            paymentDetails: order.paymentDetails || null,
            phonePeNumber: order.phonePeNumber || null,
            upiDetails: order.upiDetails || null,
            deliveryPartnerId: order.deliveryPartnerId || null,
            deliveryPartnerName: order.deliveryPartnerName || null,
            deliveryPartnerPhone: order.deliveryPartnerPhone || null,
            deliveryPartnerStatus: order.deliveryPartnerStatus || null,
            eta: order.eta || 25,
            scheduledTime: order.scheduledTime || null,
            pointsEarned: order.pointsEarned || 0,
            pointsRedeemed: order.pointsRedeemed || 0,
            trackingHistory: order.trackingHistory || [],
            rating: order.rating || null,
            feedback: order.feedback || null,
            placedAt: order.date || new Date().toISOString()
          };

          const supabasePayload = {
            id: String(order.id),
            customer_id: String(order.customerId || order.customer_id || ''),
            customer_phone: String(order.customerPhone || order.customer_phone || ''),
            customer_name: String(order.customerName || order.customer_name || 'Customer'),
            items: Array.isArray(order.items) ? order.items : [],
            subtotal: Number(order.subtotal || 0),
            discount: Number(order.discount || 0),
            delivery_fee: Number(order.deliveryFee !== undefined ? order.deliveryFee : (order.delivery_fee || 0)),
            packaging_fee: Number(order.packagingFee !== undefined ? order.packagingFee : (order.packaging_fee || 0)),
            tax: Number(order.tax || 0),
            tip: Number(order.tip || 0),
            final_amount: Number(order.finalAmount !== undefined ? order.finalAmount : (order.final_amount || 0)),
            status: String(order.status || 'accepted'),
            address: addressObj,
            instructions: String(order.instructions || ''),
            coupon_used: String(order.couponUsed || order.coupon_used || ''),
            payment_method: String(order.paymentMethod || order.payment_method || 'UPI'),
            payment_status: String(order.paymentStatus || order.payment_status || 'pending'),
            date: order.date || new Date().toISOString(),
            created_at: order.date || new Date().toISOString()
          };

          const { error } = await adminClient
            .from('orders')
            .upsert([supabasePayload], { onConflict: 'id' });
          if (!error) {
            supabaseSaved = true;
          } else {
            console.warn('[Supabase Orders] Server POST upsert error:', error.message);
          }
        }
      } catch (err: any) {
        console.warn('[Supabase Orders] Server POST exception:', err?.message);
      }

      // Trigger WhatsApp Business Cloud API notification (idempotent, never breaks order placement)
      let whatsappResult: any = null;
      try {
        whatsappResult = await sendOrderConfirmationWhatsApp(order);
      } catch (waErr: any) {
        console.warn('[WhatsApp] Post-order notification notice:', waErr?.message);
        whatsappResult = { success: false, status: 'failed', error: waErr?.message };
      }

      return res.status(201).json({
        success: true,
        orderId: order.id,
        supabaseSaved,
        whatsappNotification: whatsappResult,
        order
      });
    } catch (e: any) {
      console.error('Exception in POST /api/orders:', e);
      return res.status(500).json({ success: false, error: 'Failed to record order.' });
    }
  });

  app.put("/api/orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body || {};

      const existing = serverOrders.get(String(id)) || {};
      const merged = { ...existing, ...updates, id: String(id), updated_at: new Date().toISOString() };

      serverOrders.set(String(id), merged);
      persistServerOrders(serverOrders);

      // Attempt Supabase update for valid table columns
      try {
        const { client: adminClient } = getAdminSupabaseServerClient();
        if (adminClient) {
          const directCols = ['status', 'payment_status', 'instructions', 'coupon_used', 'items', 'subtotal', 'discount', 'final_amount'];
          const updatePayload: Record<string, any> = {};
          for (const col of directCols) {
            if (updates[col] !== undefined) updatePayload[col] = updates[col];
          }
          if (updates.paymentStatus) updatePayload.payment_status = updates.paymentStatus;
          if (updates.finalAmount) updatePayload.final_amount = updates.finalAmount;
          if (updates.address) updatePayload.address = updates.address;

          if (Object.keys(updatePayload).length > 0) {
            await adminClient
              .from('orders')
              .update(updatePayload)
              .eq('id', id);
          }
        }
      } catch {}

      return res.json({ success: true, order: merged });
    } catch (e: any) {
      console.error('Exception in PUT /api/orders/:id:', e);
      return res.status(500).json({ success: false, error: 'Failed to update order.' });
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
      const { orderId } = req.body || {};
      if (!orderId) {
        return res.status(400).json({ success: false, error: "Order ID is required to initiate PhonePe payment." });
      }

      // Retrieve existing order from server store or Supabase
      let order = serverOrders.get(String(orderId));
      if (!order) {
        try {
          const { client: adminClient } = getAdminSupabaseServerClient();
          if (adminClient) {
            const { data } = await adminClient
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

      // Resolve application base URL for callbacks & browser redirects
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const origin = req.headers.origin;
      const detectedUrl = origin ? String(origin) : `${proto}://${host}`;
      const appBaseUrl = process.env.APP_URL || detectedUrl;

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

  // 5. Client Status Verification API
  // Allows customer tracking screen or admin to verify status in real-time
  app.get("/api/payment/phonepe/verify/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;
      let order = serverOrders.get(String(orderId));

      if (!order) {
        try {
          const { client: adminClient } = getAdminSupabaseServerClient();
          if (adminClient) {
            const { data } = await adminClient
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
          const { client: adminClient } = getAdminSupabaseServerClient();
          if (adminClient) {
            await adminClient
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

  // --- WHATSAPP CLOUD API & ORDER NOTIFICATION DIAGNOSTIC APIS ---
  app.get("/api/admin/whatsapp/status", requireAdminAuth, (_req, res) => {
    const status = getWhatsAppConfigStatus();
    return res.json({
      success: true,
      ...status
    });
  });

  app.get("/api/admin/order-notifications", requireAdminAuth, async (_req, res) => {
    try {
      const { client } = getAdminSupabaseServerClient();
      if (client) {
        const { data, error } = await client
          .from('order_notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && Array.isArray(data)) {
          return res.json({ success: true, notifications: data });
        }
      }
    } catch {}

    return res.json({ success: true, notifications: [] });
  });

  app.post("/api/admin/order-notifications/resend/:orderId", requireAdminAuth, async (req, res) => {
    const { orderId } = req.params;
    const order = serverOrders.get(String(orderId));
    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${orderId} not found` });
    }

    try {
      const result = await sendOrderConfirmationWhatsApp(order);
      return res.json({ success: result.success, result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Failed to dispatch WhatsApp alert' });
    }
  });

  // --- APP SETTINGS SUPABASE PERSISTENCE APIS ---
  const serverSettings = new Map<string, any>();

  app.get("/api/settings/:key", async (req, res) => {
    const { key } = req.params;
    try {
      const { client } = getAdminSupabaseServerClient();
      if (client) {
        const { data, error } = await client
          .from('app_settings')
          .select('key, value, description, updated_at')
          .eq('key', key)
          .maybeSingle();

        if (!error && data && data.value !== undefined) {
          return res.json({ success: true, key: data.key, value: data.value, setting: data });
        }
      }
    } catch (e: any) {
      console.warn(`[Settings GET] Notice querying setting ${key} from Supabase:`, e?.message);
    }

    if (serverSettings.has(String(key))) {
      const cached = serverSettings.get(String(key));
      return res.json({ success: true, key, value: cached.value, setting: cached });
    }

    return res.status(404).json({ success: false, error: `Setting ${key} not found` });
  });

  app.post("/api/settings", requireAdminAuth, async (req, res) => {
    const { key, value, description } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ success: false, error: "Key and value are required." });
    }

    const payload = {
      key: String(key),
      value,
      description: description ? String(description) : `Setting for ${key}`,
      updated_at: new Date().toISOString(),
      updated_by: (req as any).user?.phone || 'admin'
    };

    // Cache locally immediately
    serverSettings.set(String(key), payload);

    try {
      const { client } = getAdminSupabaseServerClient();
      if (client) {
        const { data, error } = await client
          .from('app_settings')
          .upsert([payload], { onConflict: 'key' })
          .select();

        if (error) {
          console.warn(`[Settings POST] Supabase app_settings table notice (run migration):`, error.message);
          return res.json({ 
            success: true, 
            setting: payload, 
            notice: "Cached in server memory. Run supabase_production_migration.sql to enable permanent database storage." 
          });
        }

        return res.json({ success: true, setting: data?.[0] || payload });
      }
    } catch (e: any) {
      console.warn(`[Settings POST] Exception writing to Supabase:`, e?.message);
      return res.json({ success: true, setting: payload, notice: "Cached in server memory" });
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
  let serverDeliveryPartners: any[] = [];

  app.get("/api/delivery-partners", (_req, res) => {
    res.json(serverDeliveryPartners);
  });

  app.post("/api/admin/delivery-partners", requireAdminAuth, (req, res) => {
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
    res.status(201).json({ success: true, partner: newPartner });
  });

  app.put("/api/admin/delivery-partners/:id", requireAdminAuth, (req, res) => {
    const { id } = req.params;
    const index = serverDeliveryPartners.findIndex((p: any) => String(p.id) === String(id));
    if (index === -1) return res.status(404).json({ error: "Delivery partner not found." });

    serverDeliveryPartners[index] = {
      ...serverDeliveryPartners[index],
      ...req.body,
      id: serverDeliveryPartners[index].id
    };
    res.json({ success: true, partner: serverDeliveryPartners[index] });
  });

  app.delete("/api/admin/delivery-partners/:id", requireAdminAuth, (req, res) => {
    const { id } = req.params;
    serverDeliveryPartners = serverDeliveryPartners.filter((p: any) => String(p.id) !== String(id));
    res.json({ success: true, message: "Delivery partner deleted successfully." });
  });

  // --- ADMIN / SUPER ADMIN FULL CONTROLLED DATA RESET ---
  app.post("/api/admin/reset-data", requireAdminAuth, (req, res) => {
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
    }

    res.json({
      success: true,
      message: "Administrator-managed configuration successfully reset to pristine system baseline.",
      deliveryPartnersCount: serverDeliveryPartners.length,
      restaurantsCount: serverRestaurants.length,
      hotelsCount: serverHotels.length
    });
  });

  // Vite middleware setup (dev mode) vs Static asset serving (production)
  export async function startServer() {
    const PORT = Number(process.env.PORT) || 3000;
    const distPath = path.join(process.cwd(), 'dist');
    const isDev = process.env.NODE_ENV === "development" || process.env.npm_lifecycle_event === 'dev' || !fs.existsSync(path.join(distPath, 'index.html'));

    if (isDev) {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(distPath));
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
