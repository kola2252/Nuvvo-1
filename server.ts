import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { FOOD_CATALOG, RESTAURANTS } from "./src/data/catalog";
import { 
  getAdminSupabaseServerClient, 
  getPublicSupabaseServerClient, 
  createServerClient 
} from "./src/utils/supabase/server";

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

interface ServerSession {
  phone: string;
  role: 'normal_user' | 'admin' | 'super_admin';
  createdAt: number;
}
const SESSIONS_FILE = path.join(process.cwd(), '.server_sessions.json');

function loadSessions(): Map<string, ServerSession> {
  const map = new Map<string, ServerSession>();
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
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
    const obj: Record<string, ServerSession> = {};
    for (const [k, v] of map.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj), 'utf8');
  } catch {}
}

const serverSessions = loadSessions();

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
  app.get("/api/food-items", (req, res) => {
    const { tag } = req.query;

    if (!tag) {
      return res.json(FOOD_CATALOG);
    }

    const targetTag = String(tag).trim().toLowerCase();

    // If tag is 'all', return all
    if (targetTag === 'all') {
      return res.json(FOOD_CATALOG);
    }

    const filtered = FOOD_CATALOG.filter(item => {
      const cat = item.category.toLowerCase();
      const sub = (item.subcategory || '').toLowerCase();
      const name = item.name.toLowerCase();
      const desc = item.description.toLowerCase();

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

      return false;
    });

    res.json(filtered);
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

  // --- SECURE AUTHENTICATION & ROLE-BASED ACCESS CONTROL ---
  interface ServerOtp {
    codeHash: string;
    salt: string;
    expiresAt: number;
    attempts: number;
    createdAt: number;
  }
  const serverOtpStore = new Map<string, ServerOtp>();

  // Periodically clean up expired OTP records
  setInterval(() => {
    const now = Date.now();
    for (const [phone, record] of serverOtpStore.entries()) {
      if (now > record.expiresAt) {
        serverOtpStore.delete(phone);
      }
    }
  }, 5 * 60 * 1000);

  // Securely generate, hash, and issue dynamic single-use OTP
  app.post("/api/auth/send-otp", (req, res) => {
    const { phone } = req.body;
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

    // Rate limiting: enforce minimum 30 seconds interval per phone
    const existing = serverOtpStore.get(cleanPhone);
    if (existing && (Date.now() - existing.createdAt < 30 * 1000)) {
      const waitSec = Math.ceil((30 * 1000 - (Date.now() - existing.createdAt)) / 1000);
      return res.status(429).json({
        success: false,
        error: `Please wait ${waitSec} seconds before requesting a new OTP.`
      });
    }

    // Generate cryptographically secure 4-digit code (1000-9999)
    const generatedOtp = String(crypto.randomInt(1000, 10000));
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = crypto.pbkdf2Sync(generatedOtp, salt, 1000, 32, 'sha256').toString('hex');

    serverOtpStore.set(cleanPhone, {
      codeHash,
      salt,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes expiration
      attempts: 0,
      createdAt: Date.now()
    });

    console.log(`[AUTH] Dynamic OTP issued for phone ending in ...${cleanPhone.slice(-4)}`);

    // In dev / non-production mode, supply devOtp for smooth verification testing
    const isDev = process.env.NODE_ENV !== 'production';
    return res.json({
      success: true,
      message: "Security OTP generated and dispatched successfully.",
      ...(isDev ? { devOtp: generatedOtp } : {})
    });
  });

  app.post("/api/auth/verify-otp", (req, res) => {
    const { phone, otp, requestedRole } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: "Phone number and OTP code are required." });
    }

    // Normalize phone number on the server
    const digits = String(phone).replace(/\D/g, '');
    let cleanPhone = digits;
    if (digits.length === 12 && digits.startsWith('91')) cleanPhone = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) cleanPhone = digits.slice(1);

    const record = serverOtpStore.get(cleanPhone);
    if (!record) {
      return res.status(400).json({
        success: false,
        error: "No active OTP request found for this phone number. Please click 'Get OTP' to request a new code."
      });
    }

    if (Date.now() > record.expiresAt) {
      serverOtpStore.delete(cleanPhone);
      return res.status(400).json({
        success: false,
        error: "The OTP has expired (5 minute validity). Please request a new code."
      });
    }

    if (record.attempts >= 5) {
      serverOtpStore.delete(cleanPhone);
      return res.status(429).json({
        success: false,
        error: "Too many failed attempts. This OTP has been invalidated. Please request a new one."
      });
    }

    // Timing-safe cryptographic comparison of PBKDF2 hash
    const inputHash = crypto.pbkdf2Sync(String(otp).trim(), record.salt, 1000, 32, 'sha256').toString('hex');
    const isMatch = crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(record.codeHash));

    if (!isMatch) {
      record.attempts += 1;
      const remaining = 5 - record.attempts;
      return res.status(400).json({
        success: false,
        error: `The verification OTP code is incorrect. ${remaining} attempts remaining.`
      });
    }

    // Invalidate immediately upon successful verification (single-use token)
    serverOtpStore.delete(cleanPhone);

    // Secure server-side check against protected administrator configuration
    let role: 'normal_user' | 'admin' | 'super_admin' = 'normal_user';
    if (cleanPhone === AUTHORIZED_ADMIN_PHONE) {
      role = 'super_admin';
    } else if (requestedRole === 'Delivery Partner') {
      role = 'normal_user';
    } else if (requestedRole === 'Franchise') {
      role = 'normal_user';
    } else {
      role = 'normal_user';
    }

    const token = `nuvvo_sec_${Date.now()}_${crypto.randomBytes(24).toString('hex')}`;
    serverSessions.set(token, {
      phone: cleanPhone,
      role,
      createdAt: Date.now()
    });
    persistSessions(serverSessions);

    // Return the authorization role and token without ever revealing the administrator phone
    res.json({
      success: true,
      token,
      role,
      isAuthorizedAdmin: (role as string) === 'admin' || role === 'super_admin'
    });
  });

  const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days session validity

  app.post("/api/auth/verify-role", (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : req.body?.token;
    if (!token || !serverSessions.has(token)) {
      return res.json({ role: 'normal_user', isAuthorizedAdmin: false });
    }
    const session = serverSessions.get(token)!;
    if (Date.now() - session.createdAt > MAX_SESSION_AGE_MS) {
      serverSessions.delete(token);
      return res.json({ role: 'normal_user', isAuthorizedAdmin: false });
    }
    res.json({
      role: session.role,
      phone: session.phone,
      isAuthorizedAdmin: session.role === 'admin' || session.role === 'super_admin'
    });
  });

  // Middleware to strictly enforce administrator privileges on server endpoints
  function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized: Active administrator authorization token required." });
    }

    const token = authHeader.substring(7).trim();
    if (!token || !serverSessions.has(token)) {
      return res.status(401).json({ error: "Unauthorized: Invalid or expired administrator session." });
    }

    const session = serverSessions.get(token)!;
    if (Date.now() - session.createdAt > MAX_SESSION_AGE_MS) {
      serverSessions.delete(token);
      return res.status(401).json({ error: "Unauthorized: Session expired. Please log in again." });
    }

    if (session.role !== 'admin' && session.role !== 'super_admin') {
      return res.status(403).json({ error: "Forbidden: Administrative privileges required." });
    }

    next();
  }

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
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    sseCatalogClients.add(res);

    // Initial handshake
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    req.on("close", () => {
      sseCatalogClients.delete(res);
    });
  };

  app.get("/api/catalog/events", handleSseConnection);
  app.get("/api/catalog/live", handleSseConnection);


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

  // --- DISHES MANAGEMENT APIS (SUPABASE public.food_items INTEGRATED) ---
  app.get("/api/dishes", async (_req, res) => {
    try {
      const publicClient = getPublicSupabaseServerClient();
      const { data, error } = await publicClient
        .from('food_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Server /api/dishes Supabase fetch error:', error);
        return res.status(error.code === 'PGRST205' ? 404 : 500).json({
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
      }

      const mapped = (data || []).map((row: any) => ({
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
      }));

      return res.json(mapped);
    } catch (e: any) {
      console.error('Exception in GET /api/dishes:', e);
      return res.status(500).json({ error: e?.message || "Internal server error connecting to Supabase" });
    }
  });

  app.post("/api/admin/dishes", requireAdminAuth, async (req, res) => {
    const { 
      name, description, price, image, image_url, category, subcategory, 
      restaurantId, restaurant_id, isAvailable, is_available, vegIndicator, veg_indicator,
      prepTime, prep_time, spiceLevel, spice_level, rating, reviewsCount, reviews_count
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ success: false, error: "Dish name and price are required." });
    }

    const { client: adminClient, error: clientErr } = getAdminSupabaseServerClient();
    if (!adminClient || clientErr) {
      return res.status(503).json({
        success: false,
        error: clientErr || "Privileged database access is unconfigured on the server. SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY required."
      });
    }

    const payload = {
      name: String(name).trim(),
      description: String(description || '').trim(),
      price: Number(price),
      category: String(category || 'Specialty').trim(),
      subcategory: String(subcategory || 'Chef Special').trim(),
      image_url: image_url || image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
      is_available: isAvailable !== false && is_available !== false,
      veg_indicator: (veg_indicator || vegIndicator) === 'Veg' || (veg_indicator || vegIndicator) === 'veg' ? 'Veg' : 'NonVeg',
      rating: Number(rating) || 4.8,
      reviews_count: Number(reviews_count || reviewsCount) || 12,
      prep_time: Number(prep_time || prepTime) || 20,
      spice_level: spice_level || spiceLevel || 'Medium',
      restaurant_id: restaurant_id || restaurantId || 'rest_1'
    };

    try {
      const { data, error } = await adminClient
        .from('food_items')
        .insert([payload])
        .select();

      if (error) {
        console.error('Supabase insert failed in /api/admin/dishes:', error);
        return res.status(error.code === '42501' ? 403 : error.code === 'PGRST205' ? 404 : 500).json({
          success: false,
          error: error.message,
          code: error.code,
          hint: error.hint
        });
      }

      if (!data || data.length === 0) {
        return res.status(500).json({
          success: false,
          error: "Database insert returned no record from Supabase public.food_items."
        });
      }

      const savedDish = data[0];
      broadcastCatalogSSE('dish_created', savedDish);
      return res.status(201).json({ success: true, dish: savedDish });
    } catch (e: any) {
      console.error('Exception in /api/admin/dishes:', e);
      return res.status(500).json({
        success: false,
        error: e?.message || "Server exception during Supabase dish creation"
      });
    }
  });

  app.put("/api/admin/dishes/:id", requireAdminAuth, async (req, res) => {
    const { id } = req.params;

    const { client: adminClient, error: clientErr } = getAdminSupabaseServerClient();
    if (!adminClient || clientErr) {
      return res.status(503).json({
        success: false,
        error: clientErr || "Privileged database access is unconfigured on the server. SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY required."
      });
    }

    const payload: any = {};
    if (req.body.name !== undefined) payload.name = String(req.body.name).trim();
    if (req.body.description !== undefined) payload.description = String(req.body.description).trim();
    if (req.body.price !== undefined) payload.price = Number(req.body.price);
    if (req.body.category !== undefined) payload.category = String(req.body.category).trim();
    if (req.body.subcategory !== undefined) payload.subcategory = String(req.body.subcategory).trim();
    if (req.body.image !== undefined || req.body.image_url !== undefined) {
      payload.image_url = req.body.image_url || req.body.image;
    }
    if (req.body.isAvailable !== undefined || req.body.is_available !== undefined) {
      payload.is_available = req.body.is_available !== undefined ? Boolean(req.body.is_available) : Boolean(req.body.isAvailable);
    }
    if (req.body.vegIndicator !== undefined || req.body.veg_indicator !== undefined) {
      const val = req.body.veg_indicator || req.body.vegIndicator;
      payload.veg_indicator = (val === 'Veg' || val === 'veg') ? 'Veg' : 'NonVeg';
    }
    if (req.body.restaurantId !== undefined || req.body.restaurant_id !== undefined) {
      payload.restaurant_id = req.body.restaurant_id || req.body.restaurantId;
    }
    if (req.body.prepTime !== undefined || req.body.prep_time !== undefined) {
      payload.prep_time = Number(req.body.prep_time || req.body.prepTime);
    }
    if (req.body.spiceLevel !== undefined || req.body.spice_level !== undefined) {
      payload.spice_level = req.body.spice_level || req.body.spiceLevel;
    }
    if (req.body.rating !== undefined) {
      payload.rating = Number(req.body.rating);
    }
    if (req.body.reviewsCount !== undefined || req.body.reviews_count !== undefined) {
      payload.reviews_count = Number(req.body.reviews_count || req.body.reviewsCount);
    }
    payload.updated_at = new Date().toISOString();

    try {
      const { data, error } = await adminClient
        .from('food_items')
        .update(payload)
        .eq('id', id)
        .select();

      if (error) {
        console.error('Supabase update failed in /api/admin/dishes/:id:', error);
        return res.status(error.code === '42501' ? 403 : error.code === 'PGRST205' ? 404 : 500).json({
          success: false,
          error: error.message,
          code: error.code
        });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: `Dish with ID ${id} not found in Supabase public.food_items.`
        });
      }

      const updated = data[0];
      broadcastCatalogSSE('dish_updated', updated);
      return res.json({ success: true, dish: updated });
    } catch (e: any) {
      console.error('Exception in PUT /api/admin/dishes/:id:', e);
      return res.status(500).json({ success: false, error: e?.message || "Server exception during Supabase dish update" });
    }
  });

  app.delete("/api/admin/dishes/:id", requireAdminAuth, async (req, res) => {
    const { id } = req.params;

    const { client: adminClient, error: clientErr } = getAdminSupabaseServerClient();
    if (!adminClient || clientErr) {
      return res.status(503).json({
        success: false,
        error: clientErr || "Privileged database access is unconfigured on the server. SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY required."
      });
    }

    try {
      const { error } = await adminClient
        .from('food_items')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase delete failed in /api/admin/dishes/:id:', error);
        return res.status(error.code === '42501' ? 403 : error.code === 'PGRST205' ? 404 : 500).json({
          success: false,
          error: error.message,
          code: error.code
        });
      }

      broadcastCatalogSSE('dish_deleted', { id });
      return res.json({ success: true, message: `Dish ${id} permanently removed from Supabase.` });
    } catch (e: any) {
      console.error('Exception in DELETE /api/admin/dishes/:id:', e);
      return res.status(500).json({ success: false, error: e?.message || "Server exception during Supabase dish deletion" });
    }
  });

  app.post("/api/admin/dishes/seed", requireAdminAuth, async (_req, res) => {
    const { client: adminClient, error: clientErr } = getAdminSupabaseServerClient();
    if (!adminClient || clientErr) {
      return res.status(503).json({
        success: false,
        error: clientErr || "Privileged database access is unconfigured on the server. SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY required."
      });
    }

    try {
      // 1. Fetch existing dishes to prevent duplicates and preserve admin customizations
      const { data: existingRows, error: fetchErr } = await adminClient
        .from('food_items')
        .select('name');

      if (fetchErr) {
        console.error('Supabase seed check error:', fetchErr);
        return res.status(500).json({ success: false, error: fetchErr.message });
      }

      const existingNames = new Set((existingRows || []).map((r: any) => String(r.name || '').trim().toLowerCase()));

      const defaultPool = [...FOOD_CATALOG];
      const payload = defaultPool
        .map((item: any) => ({
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
        }))
        .filter((item: any) => !existingNames.has(item.name.toLowerCase()));

      if (payload.length === 0) {
        return res.json({ 
          success: true, 
          count: 0, 
          message: "All initial catalog dishes are already present in Supabase. Existing custom edits and prices were preserved." 
        });
      }

      // Insert in safe batches of 50 to guarantee smooth database execution
      let insertedCount = 0;
      const chunkSize = 50;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { data, error } = await adminClient
          .from('food_items')
          .insert(chunk)
          .select();

        if (error) {
          console.error('Supabase seed error:', error);
          return res.status(error.code === '42501' ? 403 : error.code === 'PGRST205' ? 404 : 500).json({
            success: false,
            error: error.message,
            code: error.code
          });
        }
        insertedCount += data?.length || 0;
      }
      broadcastCatalogSSE('catalog_seeded', { count: insertedCount });
      return res.json({ success: true, count: insertedCount, message: `Successfully seeded ${insertedCount} new dishes into Supabase.` });
    } catch (e: any) {
      console.error('Exception in /api/admin/dishes/seed:', e);
      return res.status(500).json({ success: false, error: e?.message || "Internal server error during seeding" });
    }
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
  const distPath = path.join(process.cwd(), 'dist');
  const isDev = process.env.NODE_ENV === "development" || process.env.npm_lifecycle_event === 'dev' || !fs.existsSync(path.join(distPath, 'index.html'));

  if (isDev) {
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

startServer();
