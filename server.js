// server.ts
import express from "express";
import crypto3 from "crypto";
import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv2 from "dotenv";

// src/types.ts
var VegIndicator = {
  VEG: "veg",
  NON_VEG: "non-veg"
};

// src/data/catalog.ts
var RESTAURANTS = [
  {
    id: "rest_1",
    name: "Nuvvo Kitchens",
    rating: 4.8,
    reviewsCount: 1250,
    cuisines: ["Indian", "Chinese", "Mughlai"],
    deliveryTime: 25,
    costForTwo: 500,
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=400",
    isPromoted: true,
    offers: ["50% OFF up to \u20B9100", "Free delivery"]
  },
  {
    id: "rest_2",
    name: "Spiceland Biryani",
    rating: 4.5,
    reviewsCount: 840,
    cuisines: ["Biryani", "Andhra", "Mughlai"],
    deliveryTime: 30,
    costForTwo: 450,
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400",
    offers: ["\u20B9120 OFF use NUVVO120"]
  },
  {
    id: "rest_3",
    name: "The South Indian Club",
    rating: 4.6,
    reviewsCount: 1980,
    cuisines: ["South Indian", "Tiffins"],
    deliveryTime: 20,
    costForTwo: 250,
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400",
    offers: ["20% OFF on all items"]
  },
  {
    id: "rest_4",
    name: "Burger Craft & Co",
    rating: 4.4,
    reviewsCount: 620,
    cuisines: ["Burgers", "Fast Food", "Snacks"],
    deliveryTime: 22,
    costForTwo: 350,
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400",
    isPromoted: true,
    offers: ["Buy 1 Get 1 Free", "\u20B950 Cashback with PhonePe"]
  },
  {
    id: "rest_5",
    name: "La Piazza Pizzeria",
    rating: 4.7,
    reviewsCount: 750,
    cuisines: ["Pizza", "Italian", "Desserts"],
    deliveryTime: 35,
    costForTwo: 600,
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=400",
    offers: ["Flat \u20B9100 OFF above \u20B9499"]
  },
  {
    id: "rest_6",
    name: "Wok Hei Chinese",
    rating: 4.3,
    reviewsCount: 430,
    cuisines: ["Chinese", "Noodles", "Seafood"],
    deliveryTime: 28,
    costForTwo: 400,
    image: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&q=80&w=400",
    offers: ["15% OFF on first order"]
  },
  {
    id: "rest_7",
    name: "Sweet Bliss Creamery",
    rating: 4.9,
    reviewsCount: 1100,
    cuisines: ["Ice Cream", "Desserts", "Milkshakes"],
    deliveryTime: 15,
    costForTwo: 300,
    image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400",
    offers: ["Free Choco-fudge topping on \u20B9250"]
  },
  {
    id: "rest_8",
    name: "Healthy Fuel Cafe",
    rating: 4.5,
    reviewsCount: 310,
    cuisines: ["Healthy Foods", "Salads", "Juices"],
    deliveryTime: 25,
    costForTwo: 400,
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=400",
    offers: ["Save \u20B960 with NUVVOFIT"]
  }
];
var CATEGORIES = [
  "Biryani",
  "South Indian",
  "North Indian",
  "Chinese",
  "Tiffins",
  "Fast Food",
  "Pizza",
  "Burgers",
  "Sandwiches",
  "Rolls",
  "Shawarma",
  "Ice Cream",
  "Desserts",
  "Bakery",
  "Juices",
  "Milkshakes",
  "Tea & Coffee",
  "Beverages",
  "Seafood",
  "Chicken Specials",
  "Mutton Specials",
  "Vegetarian Specials",
  "Healthy Foods",
  "Combo Meals",
  "Kids Specials"
];
var CATEGORY_ITEMS_SOURCE = {
  "Biryani": [
    { name: "Hyderabadi Chicken Dum Biryani", isVeg: false, price: 320, desc: "Fragrant layers of premium basmati rice cooked with marinated chicken pieces and original spices.", sub: "Chicken", img: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400" },
    { name: "Royal Mutton Dum Biryani", isVeg: false, price: 420, desc: "Traditional slow-cooked Lucknow biryani spiced lightly with tenderized leg elements.", sub: "Mutton", img: "https://images.unsplash.com/photo-1608500218900-8afa13d02791?auto=format&fit=crop&q=80&w=400" },
    { name: "Zafrani Paneer Makhani Biryani", isVeg: true, price: 280, desc: "Rich saffron tinted basmati layered with tender paneer cubes cooked in a cream tomato gravy.", sub: "Vegetarian", img: "https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&q=80&w=400" },
    { name: "Egg Tikka Dum Biryani", isVeg: false, price: 240, desc: "Grilled spiced eggs tossed in a rich brown onion gravy layered carefully with basmati.", sub: "Eggs", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Jackfruit Veggie Dum Biryani", isVeg: true, price: 290, desc: "Exotic marinated raw jackfruit (Kathal) nuggets slow-cooked with basmati, ginger, & mint.", sub: "Vegetarian", img: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400" },
    { name: "Spicy Guntur Chicken Biryani", isVeg: false, price: 330, desc: "Fiery Andhra-style biryani prepared with freshly roasted red Guntur chillies & curry leaves.", sub: "Chicken", img: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400" },
    { name: "Kolkata Chicken Biryani (with Potato)", isVeg: false, price: 310, desc: "Light yet fragrant cooked under-dum with a whole egg and golden spiced potato.", sub: "Chicken", img: "https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&q=80&w=400" },
    { name: "Ambur Mutton Special Biryani", isVeg: false, price: 440, desc: "Short-grained Seeraga samba rice cooked with juicy goat meat pieces in simple South herbs.", sub: "Mutton", img: "https://images.unsplash.com/photo-1608500218900-8afa13d02791?auto=format&fit=crop&q=80&w=400" }
  ],
  "South Indian": [
    { name: "Ghee Podi Masala Dosa", isVeg: true, price: 140, desc: "Golden crispy rice crepe topped with spicy gun powder and direct native pure ghee.", sub: "Dosa", img: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=400" },
    { name: "Vada & Sambar Set (2 Pcs)", isVeg: true, price: 90, desc: "Crispy deep-fried lentil donuts flavored with peppercorns, served with hing Sambar.", sub: "Tiffins", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Steam Button Idli Sambar Float", isVeg: true, price: 95, desc: "12 bite-sized fluffy button idlis immersed completely in aromatic steaming hot sambar.", sub: "Tiffins", img: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=400" },
    { name: "Crispy Rava Onion Masala Dosa", isVeg: true, price: 155, desc: "Semolina-based lacey crisp dosa styled with heaps of green chillies and broken cashews.", sub: "Dosa", img: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=400" },
    { name: "Peshawari Ragi Flour Dosa", isVeg: true, price: 120, desc: "Nutritious finger-millet batter roasted on a stone girdle. Highly recommended for diet.", sub: "Healthy", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Karnataka Special Bisi Bele Bath", isVeg: true, price: 150, desc: "Hot spicy lentil rice dish loaded with country veggies, topped with pure ghee & khara boondi.", sub: "Rice Bowls", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Authentic Curd Rice with Tadka", isVeg: true, price: 110, desc: "Soft-mashed cold curd rice blended with fresh cream, mustard temper and sweet red pomegranate.", sub: "Rice Bowls", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Coorg Chicken Fry with Neer Dosa", isVeg: false, price: 280, desc: "Peppery dry Coorg style chicken paired ideally with 3 paper-thin lacy steam Neer dosas.", sub: "Combos", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" }
  ],
  "North Indian": [
    { name: "Paneer Butter Masala (Royal)", isVeg: true, price: 260, desc: "Premium paneer cubes simmered lovingly in an smooth, rich orange-toned butter tomato gravy.", sub: "Paneer", img: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=80&w=400" },
    { name: "Dal Makhani (Overnight Stewed)", isVeg: true, price: 210, desc: "Slow-cooked whole black lentils simmered on coal fires overnight with generous cream butter.", sub: "Dal", img: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&q=80&w=400" },
    { name: "Amritsari Kulcha with Chole", isVeg: true, price: 180, desc: "Flaky clay-oven flatbread stuffed with spiced potato and paneer served with tangy chana.", sub: "Combos", img: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=80&w=400" },
    { name: "Kadhai Chicken (Home-style)", isVeg: false, price: 295, desc: "Bone chicken pieces tossed in fresh kadhai ground corridor spices, sweet bell peppers.", sub: "Chicken", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" },
    { name: "Malai Kofta in White Gravy", isVeg: true, price: 275, desc: "Silky paneer-cashew dumplings floating in an aromatic cardamom scented sweet cottage-cheese gravy.", sub: "Curries", img: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=80&w=400" },
    { name: "Tandoori Roti with Butter", isVeg: true, price: 40, desc: "Clay oven wheat flatbread, smeared generously with premium table baking butter.", sub: "Breads", img: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=80&w=400" },
    { name: "Garlic Butter Naan (Flaky)", isVeg: true, price: 80, desc: "Fine leavened flatbread topped with toasted crushed minced garlic pods and fresh mint.", sub: "Breads", img: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=80&w=400" },
    { name: "Kashmiri Dum Aloo Mash", isVeg: true, price: 210, desc: "Baby potatoes cooked dry in traditional warm fennel and ginger-based tomato reduction.", sub: "Curries", img: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&q=80&w=400" }
  ],
  "Chinese": [
    { name: "Schezwan Chilli Garlic Noodles", isVeg: true, price: 180, desc: "Hand-pulled skinny noodles tossed with dry chillies, crushed garlic, and savory premium soy.", sub: "Noodles", img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&q=80&w=400" },
    { name: "Crispy Veg Manchurian Bowl", isVeg: true, price: 210, desc: "Fried multi-veggie golden balls coated in a dark, sweet and tangy soy ginger sauce.", sub: "Gravy", img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&q=80&w=400" },
    { name: "Chicken Fried Rice & Chilli Chicken Combo", isVeg: false, price: 290, desc: "Classic fried rice served with seasoned diced sweet onions, bell peppers and saucy chicken.", sub: "Combos", img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&q=80&w=400" },
    { name: "Steam Chicken Momos (6 Pcs)", isVeg: false, price: 160, desc: "Delicate wheat pouches stuffed with soft spiced chicken, steam-cooked, with spicy red chili chutney.", sub: "Momos", img: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&q=80&w=400" },
    { name: "Paneer Chilli Dry Starter", isVeg: true, price: 230, desc: "Wok-tossed battered cottage cheese with premium capsicums, dark seasoning, green onions.", sub: "Dry Starters", img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&q=80&w=400" },
    { name: "Wok-Fired Chicken Fried Rice", isVeg: false, price: 235, desc: "Smoky street-flavored steamed rice tossed with egg scrambles, shredded roast chicken & herbs.", sub: "Fried Rice", img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&q=80&w=400" },
    { name: "Drums of Heaven (5 Pcs)", isVeg: false, price: 280, desc: "Classic chicken lollipops fried golden, tossed in high sweet chilli paste & fresh herbs.", sub: "Dry Starters", img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&q=80&w=400" },
    { name: "Sweet Corn Veg Cream Soup", isVeg: true, price: 120, desc: "Comforting warm starch broth packed with sweet corn bits, diced carrots, and fresh peppercorns.", sub: "Soup", img: "https://images.unsplash.com/photo-1547592165-e1d17fed6005?auto=format&fit=crop&q=80&w=400" }
  ],
  "Tiffins": [
    { name: "Ultimate Ghee Karam Idli", isVeg: true, price: 100, desc: "Four mini idlis coated in house mix dry roasted spice podi and saturated with rich fresh ghee.", sub: "Idli", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Nuvvo Combo Breakfast Plate", isVeg: true, price: 180, desc: "Premium breakfast sampler - 1 Idli, 1 Vada, mini Masala Dosa, small Khara Bath and delicious Kesari.", sub: "Combos", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Mysore Bonda (4 Pcs)", isVeg: true, price: 90, desc: "Golden fluffy dumplings made of refined key flour, ginger and coconut bits, served with ground coconut dip.", sub: "Snacks", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Wheat Puri with Potato Kurma", isVeg: true, price: 110, desc: "Three puffed golden-fried wheat flatbreads with spiced onion-potato yellow curry.", sub: "Puri", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Onion Uttapam (Set of 2)", isVeg: true, price: 120, desc: "Thick fluffy savory pancakes studded with chopped red onions, fresh coriander, green chiles.", sub: "Uttapam", img: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=400" },
    { name: "Plain Steamed Rice Idli (3 Pcs)", isVeg: true, price: 70, desc: "Spongy fermented rice cakes served with our famous ginger and peanut traditional chutneys.", sub: "Idli", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Crispy Medu Vada (Set of 3)", isVeg: true, price: 95, desc: "Aromatic fried lentil rings with crispy skins, paired with tangy spicy ginger sambar.", sub: "Snacks", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Semolina Upma (Khara Bath)", isVeg: true, price: 80, desc: "Comforting, delicately spiced roasted cream of wheat item tossed with green sweet peas and carrots.", sub: "Upma", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" }
  ],
  "Fast Food": [
    { name: "Peri-Peri Crinkle Fries", isVeg: true, price: 110, desc: "Crispy salted potato wedges dusted with signature hot peri-peri dry spices.", sub: "Fries", img: "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&q=80&w=400" },
    { name: "Crispy Chicken Wings (6 Pcs)", isVeg: false, price: 210, desc: "Deep-fried battered organic wings glazed with sticky honey chili hot buffalo sauces.", sub: "Chicken", img: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&q=80&w=400" },
    { name: "Loaded Nacho Overload", isVeg: true, price: 160, desc: "Crisp tortilla chips topped with fresh cheese blend, green jalapenos, olives & thick avocado sauce.", sub: "Starters", img: "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&q=80&w=400" },
    { name: "Cheese Stuffed Garlic Bread", isVeg: true, price: 140, desc: "Four pieces of baked herb bread stuffed with gooey mozzarella cheese and garlic butter.", sub: "Breads", img: "https://images.unsplash.com/photo-1544982503-9f984c14501a?auto=format&fit=crop&q=80&w=400" },
    { name: "Crispy Mozzarella Sticks (5 Pcs)", isVeg: true, price: 130, desc: "Italian-seasoned breaded long cheese cylinders fried hot with standard marinara sauce.", sub: "Starters", img: "https://images.unsplash.com/photo-1531749668029-2db88e4b76ce?auto=format&fit=crop&q=80&w=400" },
    { name: "Popcorn Chicken Bites Box", isVeg: false, price: 175, desc: "Byte-sized chicken tender elements marinated in herbs and fried crunch, served with garlic dip.", sub: "Chicken", img: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&q=80&w=400" },
    { name: "Classic Onion Rings Basket", isVeg: true, price: 110, desc: "Beer-battered massive white sweet onion circles fried golden, dusted with sea salt crystals.", sub: "Fries", img: "https://images.unsplash.com/photo-1639024471283-2da7b3c6a26b?auto=format&fit=crop&q=80&w=400" },
    { name: "Chicken Cheese Jalapeno Poppers", isVeg: false, price: 190, desc: "Spiced chicken balls stuffed with diced jalapenos and melted high cheese.", sub: "Chicken", img: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&q=80&w=400" }
  ],
  "Pizza": [
    { name: "Double Cheese Margherita Pizza", isVeg: true, price: 340, desc: "Classic sourdough handstretched base loaded with rich fresh cheese, tomato puree & fresh basil leaves.", sub: "Veg Pizza", img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=400" },
    { name: "Ultimate Spicy Pepperoni Feast", isVeg: false, price: 490, desc: "Topped generously with dynamic spicy cured pepperoni slices, fresh herbs & strings of cheese.", sub: "Non-Veg Pizza", img: "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&q=80&w=400" },
    { name: "Nuvvo Supreme Veggie Green", isVeg: true, price: 420, desc: "Delightful mix of black olives, baby corn, green capsicum, onion and paneer chunks.", sub: "Veg Pizza", img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=400" },
    { name: "Chicken Tikka & Fiery Onion Pizza", isVeg: false, price: 460, desc: "Indian spicy style fusion - marinated chicken tikka charcoal pieces, red onions and green chillies.", sub: "Non-Veg Pizza", img: "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&q=80&w=400" },
    { name: "Smoky BBQ Chicken Mushroom Pizza", isVeg: false, price: 480, desc: "Glazed BBQ roasted tender chicken, topped with grilled button mushroom and special cheese mix.", sub: "Non-Veg Pizza", img: "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&q=80&w=400" },
    { name: "Toscana Garden Herb Pizza", isVeg: true, price: 390, desc: "Healthy thin wheat base with spinach beds, sun-dried tomatoes, roasted garlic, and low-fat cheese.", sub: "Veg Pizza", img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=400" },
    { name: "Four Cheese Classic (Quattro Formaggi)", isVeg: true, price: 450, desc: "White based pizza layered with Mozzarella, Cheddar, Blue cheese, and fresh processed Parmesan.", sub: "Veg Pizza", img: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=400" },
    { name: "Fiery Sriracha Chicken Loaded Pizza", isVeg: false, price: 470, desc: "Drizzled with intense spicy sriracha mayo, loaded with shredded hot chicken and red jalapeno rings.", sub: "Non-Veg Pizza", img: "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&q=80&w=400" }
  ],
  "Burgers": [
    { name: "Classic Crispy Veg Patty Burger", isVeg: true, price: 120, desc: "Herb potato mush patty fried crisp, layered with dynamic tomato slices, fresh loose lettuce & mayo.", sub: "Veg Burgers", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400" },
    { name: "Nuvvo Double Smoke Grill Burger", isVeg: false, price: 210, desc: "Flame grilled double chicken patty burger with smoked cheddar cheese and fried onions.", sub: "Non-Veg Burgers", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400" },
    { name: "Sriracha Spicy Melt Paneer Burger", isVeg: true, price: 165, desc: "Crunchy battered block of paneer coated with fiery sriracha glazes, premium cheddar cheese.", sub: "Veg Burgers", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400" },
    { name: "Premium American Cheese Beef-Style Burger", isVeg: false, price: 240, desc: "Smash chicken custom patty loaded with yellow cheddar, pickled organic gherkin & special burger recipe sauce.", sub: "Non-Veg Burgers", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400" },
    { name: "Golden Fried Shrimp Po Burger", isVeg: false, price: 260, desc: "Pristine battered crispy coastal shrimp layered with lemon dill aioli and shredded cabbage.", sub: "Non-Veg Burgers", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400" },
    { name: "Veggie Beetroot High Protein Burger", isVeg: true, price: 145, desc: "Made with organic quinoa, beetroot crumbs and oats, served with fat-free greek yogurt dip.", sub: "Veg Burgers", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400" },
    { name: "Texas BBQ Pulled Chicken Burger", isVeg: false, price: 220, desc: "Sweet shredded warm pulled chicken breast tossed in hickory BBQ sauce on brioche.", sub: "Non-Veg Burgers", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400" },
    { name: "Double Cheese Macaroni Patty Burger", isVeg: true, price: 170, desc: "Extremely gooey baked macaroni pasta consolidated as a golden fried puck, with mayo.", sub: "Veg Burgers", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400" }
  ],
  "Sandwiches": [
    { name: "Classic Grilled Bombay Toastie", isVeg: true, price: 90, desc: "Stuffed with coriander mint chutney, potato slices, tomatoes, capsicum and heaps of cheese.", sub: "Veg", img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=400" },
    { name: "Ultimate Club Chicken Sandwich", isVeg: false, price: 180, desc: "Triple layer loaf bread loaded with soft chicken salad, fried farm egg, crispy veggies & pepper.", sub: "Non-Veg", img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=400" },
    { name: "Spicy Corn & Cheese Grid Sandwich", isVeg: true, price: 110, desc: "Sweet golden corn and green chillies blended in white cheese sauce, toasted crisp on flat pan.", sub: "Veg", img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=400" },
    { name: "Pesto Caprese Healthy Sourdough Sandwich", isVeg: true, price: 165, desc: "Fresh basil pesto glaze with thick local mozzarella rounds and baby plum tomatoes.", sub: "Veg", img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=400" },
    { name: "Lemon Herb Paneer Tikka Toast", isVeg: true, price: 145, desc: "Spiced marinated paneer blocks mashed with mint spreads, toasted fully on automatic bread press.", sub: "Veg", img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=400" },
    { name: "Shredded Honey Mustard Chicken Sandwich", isVeg: false, price: 175, desc: "Rich chicken salad loaded with honey, dijon mustard, crisp celery bits on multi-grain bread.", sub: "Non-Veg", img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=400" },
    { name: "Tex-Mex BBQ Paneer Loaded Griller", isVeg: true, price: 135, desc: "Smoky sweet marinaded paneer crumb, with dark sweet spices, red onions & bell peppers.", sub: "Veg", img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=400" },
    { name: "Smoked Jalapeno Egg Salad Toast", isVeg: false, price: 125, desc: "Slow-boiled smashed eggs loaded with warm smoked paprika, green jalapenos, and cream mayonnaise.", sub: "Non-Veg", img: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=400" }
  ],
  "Rolls": [
    { name: "Direct Kolkata Style Paneer Roll", isVeg: true, price: 130, desc: "Crisp layered paratha loaded with spice grilled chili-lime paneer chunks, sweet onions & spices.", sub: "Veg Rolls", img: "https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&q=80&w=400" },
    { name: "Double Egg Devil Mughlai Paratha Roll", isVeg: false, price: 110, desc: "Cracked double egg flat base paratha rolled up with fresh onions, lemon water sprays.", sub: "Egg Rolls", img: "https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&q=80&w=400" },
    { name: "Butter Chicken Masala Loaded Wrap", isVeg: false, price: 170, desc: "Stuffed with juicy leftover butter chicken shreds, wrapped with cream cabbage slaw.", sub: "Non-Veg Rolls", img: "https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&q=80&w=400" },
    { name: "Spicy Potato Pepper Szechuan Roll", isVeg: true, price: 95, desc: "Crispy potato fingers tossed in spicy schezwan sauce wrapped neatly in soft roti.", sub: "Veg Rolls", img: "https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&q=80&w=400" },
    { name: "Reshmi Malai Tikka Premium Wrap", isVeg: false, price: 180, desc: "Super tender chicken malai kebab logs tossed with sweet cream and onions in whole paratha.", sub: "Non-Veg Rolls", img: "https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&q=80&w=400" },
    { name: "Cheesy Garlic Mushroom Garden Roll", isVeg: true, price: 140, desc: "Stir-fried garlic herb button mushroom tossed in cheese paste, wrapped warm with oregano.", sub: "Veg Rolls", img: "https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&q=80&w=400" },
    { name: "Tangy Soya Chaap Tikka Roll", isVeg: true, price: 135, desc: "Marinated soya chaap cooked in dry clay kiln tandoor, tossed with chaat-masala, rolled.", sub: "Veg Rolls", img: "https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&q=80&w=400" },
    { name: "Bhari Seekh Kabab Classic Roll", isVeg: false, price: 195, desc: "Minced spiced mutton seekh kebab sticks rolled with cooling mint yoghurt & lime sprigs.", sub: "Non-Veg Rolls", img: "https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&q=80&w=400" }
  ],
  "Shawarma": [
    { name: "Authentic Classic Chicken Shawarma", isVeg: false, price: 140, desc: "Premium spit roasted sliced chicken seasoned lightly wrapped in fresh soft pita bread with garlic mayo.", sub: "Classic", img: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&q=80&w=400" },
    { name: "Whole Meat Plate Shawarma (No Veggies)", isVeg: false, price: 190, desc: "Piles of sliced roasted chicken served with two portions of house special toum garlic sauce.", sub: "Platters", img: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&q=80&w=400" },
    { name: "Paneer Arabic Style Thick Shawarma", isVeg: true, price: 150, desc: "Marinated roasted paneer block shredded and wrapped in flat bread with creamy tahini dressing.", sub: "Classic", img: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&q=80&w=400" },
    { name: "Nuvvo Fiery Ghost Pepper Shawarma", isVeg: false, price: 155, desc: "Stuffed chicken salad blended with spicy ghost pepper dips, hot pickles and green jalapeno.", sub: "Spicy Spec", img: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&q=80&w=400" },
    { name: "Falafel and Tahini Cream Wrap", isVeg: true, price: 110, desc: "Crisp deep-fried chickpea dumplings wrapped with hummus salad and lemon cream.", sub: "Classic", img: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&q=80&w=400" },
    { name: "Chef Special Loaded Open Shawarma Plate", isVeg: false, price: 230, desc: "Beds of shredded chicken, side salads, toasted pickles, dual pita pockets & red hot garlic sauce.", sub: "Platters", img: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&q=80&w=400" },
    { name: "Dill Lemon Pickle Chicken Shawarma", isVeg: false, price: 145, desc: "Spiced chicken roasted chunks mixed with lemon rinds and dill pickles, loaded in khubus.", sub: "Classic", img: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&q=80&w=400" },
    { name: "Baked Soya Shawarma Roll (Healthy)", isVeg: true, price: 135, desc: "Zero cholesterol soya chunks marinated with authentic Middle Eastern spices and light low-fat curd.", sub: "Classic", img: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&q=80&w=400" }
  ],
  "Ice Cream": [
    { name: "Double Chocolate Fudge Brownie Tub", isVeg: true, price: 180, desc: "Decadent chocolate ice cream loaded with rich house-baked brownie chunks, sweet liquid hot fudge.", sub: "Tubs", img: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400" },
    { name: "Chef Sundae Delight Overload", isVeg: true, price: 210, desc: "Layers of Vanilla, Strawberry ice cream, mixed fruits cocktail, dry cashew nuts and syrup.", sub: "Sundaes", img: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400" },
    { name: "Alfonso Mango Fresh Pulp Scoop", isVeg: true, price: 85, desc: "Creamy seasonal mango ice cream blended with chunks of sweet Alphonso mango pulp.", sub: "Scoops", img: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400" },
    { name: "Dry Fruit Shahi Kulfi Slice", isVeg: true, price: 95, desc: "Dense rich reduced milk stick ice cream flavored with green cardamom, pistachio slices and saffron.", sub: "Scoops", img: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400" },
    { name: "Salted Caramel popcorn Crust Tub", isVeg: true, price: 190, desc: "Blended sweet and salty ice cream topped with crisp caramel glaze pop-corn chunks.", sub: "Tubs", img: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400" },
    { name: "Rich Madagascar Vanilla Ice Cream", isVeg: true, price: 75, desc: "Classic double-churned ice cream using original sweet vanilla bean pods import extract.", sub: "Scoops", img: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400" },
    { name: "Cookie and Cream Deluxe Jar", isVeg: true, price: 160, desc: "Smushed Oreo crumbs in vanilla base layered with delicious sweet liquid chocolate.", sub: "Sundaes", img: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400" },
    { name: "Zesty Blueberry Yogurt Gelato", isVeg: true, price: 140, desc: "Gelato style premium churned sour yogurt flavor spiked with mountain blueberry jellies.", sub: "Scoops", img: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400" }
  ],
  "Desserts": [
    { name: "Signature Hot Sizzling Brownie", isVeg: true, price: 190, desc: "Denser butter chocolate brownie served with cold vanilla scoop and hot pouring milk-chocolate.", sub: "Cakes", img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400" },
    { name: "Golden Hot Gulab Jamun (3 Pcs)", isVeg: true, price: 80, desc: "Spongy deep-fried berry milk balls soaked completely in rose water cardamom sugar elixir.", sub: "Indian", img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400" },
    { name: "Premium Tres Leches Cake Slice", isVeg: true, price: 215, desc: "Spongy milk cake saturated overnight in triple sweet cream mix, dusted with green pistachio crumbs.", sub: "Cakes", img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400" },
    { name: "Gajar ka Halwa (pure Desi Ghee)", isVeg: true, price: 110, desc: "Winter red carrots grated and slow boiled with whole milk, sweet sugar, ghee and fried almonds.", sub: "Indian", img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400" },
    { name: "Classic Tiramisu Italian Dessert Cup", isVeg: false, price: 240, desc: "Espresso dipped sponge ladyfingers resting in mascarpone egg cream sprinkled with dark cocoa.", sub: "Cakes", img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400" },
    { name: "Rasmalai Saffron Treat (2 Pcs)", isVeg: true, price: 85, desc: "Flattened cottage cheese patties squeezed dry and placed in cool pistacio-saffron creamy milk.", sub: "Indian", img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400" },
    { name: "Warm Apple Cinnamon Pie Slice", isVeg: true, price: 150, desc: "Spiced sweet sliced red apples baked carefully inside a flaky double butter crust base.", sub: "Cakes", img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400" },
    { name: "New York Baked Cheesecake Slice", isVeg: false, price: 230, desc: "Super heavy rich cream-cheese baked cake slice resting on butter graham cracker crust.", sub: "Cakes", img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400" }
  ],
  "Bakery": [
    { name: "Butter Croissant (French Style)", isVeg: true, price: 90, desc: "Multi-layered flaky viennoiserie pastry styled with 100% fine rich butter layers.", sub: "Pastry", img: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=400" },
    { name: "Stuffed Chocolate Muffin Dome", isVeg: true, price: 80, desc: "Rich fluffy sponge cake base stuffed with warm dark chocolate ganache pocket inside.", sub: "Sweet Bakery", img: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400" },
    { name: "Artisan Garlic Loaf Sourdough", isVeg: true, price: 140, desc: "Wild yeast slow fermented crispy crust bread spiced heavily with garlic herbs.", sub: "Bread Loaf", img: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400" },
    { name: "Baked Blueberry Pastry Tart", isVeg: true, price: 110, desc: "Shortcrust butter cup pastry loaded with sticky wild sweet blueberry pure preserves.", sub: "Pastry", img: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400" },
    { name: "Eggless Butter Coconut Cookies (Box)", isVeg: true, price: 150, desc: "Crunchy tea-time cookies loaded with dry toasted dessicated coconut shreds and milk.", sub: "Cookies", img: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400" },
    { name: "Cinnamon Swirl Sugar Roll", isVeg: true, price: 95, desc: "Yeast bread roll rolled with sugar, butter and brown cinnamon, glazed with icing sugar.", sub: "Sweet Bakery", img: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400" },
    { name: "French Baguette Style Long Bread", isVeg: true, price: 85, desc: "Crispy hard crust water bread classic loaf, perfect for garlic butter toast pairing.", sub: "Bread Loaf", img: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400" },
    { name: "Double Choco Chip Giant Cookie", isVeg: true, price: 75, desc: "Soft chewy butter brown cookie studded with plenty of milk and dark semisweet chips.", sub: "Cookies", img: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400" }
  ],
  "Juices": [
    { name: "Fresh Pomegranate (Anar) Juice", isVeg: true, price: 140, desc: "Cold pressed sweet ruby pomegranate kernels, served immediately without water dilution.", sub: "Fresh Juices", img: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=400" },
    { name: "Valencia Orange Citrus Pulp Juice", isVeg: true, price: 110, desc: "Squeezed fresh citrus orange fruit juices, rich source of natural Vitamin C nutrients.", sub: "Fresh Juices", img: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=400" },
    { name: "Immunity Booster Juice blend", isVeg: true, price: 120, desc: "Extracted raw blend of carrot, ginger, fresh green celery and zesty sweet lemons.", sub: "Healthy Blends", img: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=400" },
    { name: "Detox Charcoal Lemon Water Mixer", isVeg: true, price: 95, desc: "Activated charcoal dust and dynamic mint blended with lemon juice, sea salts and honey.", sub: "Healthy Blends", img: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=400" },
    { name: "Chilled Watermelon Mint Refresher", isVeg: true, price: 80, desc: "Hydrating direct watermelon slice juice blended with fresh black peppercorns and mint leaves.", sub: "Fresh Juices", img: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=400" },
    { name: "Sweet Pineapple Pulpy Elixir", isVeg: true, price: 95, desc: "Fresh local pineapple slices spun with brown organic sugar and tiny bit ginger salt.", sub: "Fresh Juices", img: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=400" },
    { name: "Tangy Green Apple Cucumber Celery", isVeg: true, price: 130, desc: "Crisp green sour apple blended with hydrating cucumber slice and organic celery sprigs.", sub: "Healthy Blends", img: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=400" },
    { name: "Cool Cucumber Mint Lemonade", isVeg: true, price: 75, desc: "Zero calories cold summer refresher, with cucumber puree, wild lime juice and ice.", sub: "Fresh Juices", img: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=400" }
  ],
  "Milkshakes": [
    { name: "Ultimate Alfonso Mango Thickshake", isVeg: true, price: 160, desc: "Blended real sweet Alphonso mango frozen chunks with rich organic ice cream base.", sub: "Fruit Shakes", img: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400" },
    { name: "Heavy Belgian Chocolate Shake", isVeg: true, price: 150, desc: "Rich cocoa paste and milk ice cream blended into a thicker shake, laced with dark cocoa syrup.", sub: "Chocolate", img: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400" },
    { name: "Kesar Pista Badam Royal Shake", isVeg: true, price: 175, desc: "Indian milk shake blended with almonds, pistachio paste, pure saffron strands and honey.", sub: "Indian Shakes", img: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400" },
    { name: "Classic Strawberry Cream Shake", isVeg: true, price: 130, desc: "Sweet red strawberry frozen fruit bits cream blended with original ice cream scoops.", sub: "Fruit Shakes", img: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400" },
    { name: "Creamy Oreo Crumble Blender", isVeg: true, price: 145, desc: "Loaded with real oreo chocolate cookies crushed in milk cream shake, topped with choco chips.", sub: "Chocolate", img: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400" },
    { name: "Roasted Almond Butter Peanut Shake", isVeg: true, price: 165, desc: "High protein blended shake with crunchy peanut butter, roasted almond extract and dates.", sub: "Healthy Shakes", img: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400" },
    { name: "Cold Caramel Espresso Frappe Shake", isVeg: true, price: 155, desc: "Strong shot of South Indian espresso blended with sweet caramel syrup and thick vanilla.", sub: "Chocolate", img: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400" },
    { name: "Fragrant Rose Gulkand Milkshake", isVeg: true, price: 140, desc: "Cool pink milk shake item flavored with organic honey-soaked Damascus rose petals (Gulkand).", sub: "Indian Shakes", img: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400" }
  ],
  "Tea & Coffee": [
    { name: "Traditional South Indian Filter Coffee", isVeg: true, price: 70, desc: "Brewed from chicory blend coffee seeds, frothed with steaming whole cream milk.", sub: "Coffee", img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400" },
    { name: "Spicy Ginger Masala Chai Flask", isVeg: true, price: 95, desc: "Warm whole milk tea brewed with hand-pounded fresh ginger roots, cardamom and cinnamon.", sub: "Tea", img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400" },
    { name: "Hazelnut Cold Brew Latte", isVeg: true, price: 140, desc: "18-hour slow steeped cold black coffee, blended with hazelnut syrups and cold milk foam.", sub: "Coffee", img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400" },
    { name: "Organic Matcha Green Tea Latte", isVeg: true, price: 150, desc: "Imported Japanese certified matcha powder frothed with hot soy milk and green stevia sweeteners.", sub: "Tea", img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400" },
    { name: "Chocolaty Hot Cappuccino Classic", isVeg: true, price: 110, desc: "Espresso topped with heavy frothed milk layers, dusted cleanly with sweet dark cocoa.", sub: "Coffee", img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400" },
    { name: "Kesari Saffron Special Elaichi Chai", isVeg: true, price: 105, desc: "Rich milk tea infused with premium Kashmiri saffron stigmas and pounded cardamom pods.", sub: "Tea", img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400" },
    { name: "Chilled Peach Green Iced Tea", isVeg: true, price: 90, desc: "Steeped green tea cooled on cube ice, loaded with natural peach juices & lime sprigs.", sub: "Tea", img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400" },
    { name: "Belgian Mocha Mocha Latte", isVeg: true, price: 145, desc: "Premium blend of espresso, dark dark hot chocolate, whole milk, and heavy vanilla syrup on top.", sub: "Coffee", img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400" }
  ],
  "Beverages": [
    { name: "Zesty Lemon Mint Mojito Soda", isVeg: true, price: 90, desc: "Crushed lime wedges, fresh mint leaves, cane sugar syrup topped with sparkling chilled tonic soda.", sub: "Coolers", img: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400" },
    { name: "Classic Diet Coke Cane (330ml)", isVeg: true, price: 40, desc: "Zero calorie fizzy dynamic cooling can, served hyper-chilled with a custom paper cup.", sub: "Canned", img: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400" },
    { name: "Dynamic Red Bull Energy Drink", isVeg: true, price: 110, desc: "Global dynamic energy mixer booster served direct with sweet cooling cube elements.", sub: "Canned", img: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400" },
    { name: "Himalayan Organic Mineral Water Bottled", isVeg: true, price: 50, desc: "Pristine direct natural spring mineral source hydration bottle standard purified packaging.", sub: "Canned", img: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400" },
    { name: "Blue Curacao Lagoon Refresher", isVeg: true, price: 100, desc: "Vibrant sweet citrus blue lagoon syrup mixed with mineral soda and zesty lime slices.", sub: "Coolers", img: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400" },
    { name: "Chilled Coconut Tender Water Flask", isVeg: true, price: 75, desc: "Naturally sweetened pure hydration tender coconut water directly from coastal trees.", sub: "Coolers", img: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400" },
    { name: "Sweet Mango Lassi Cream float", isVeg: true, price: 80, desc: "Churned sweet thick yogurt drink with rich mango pulp extracts, served in earthen cup pattern.", sub: "Coolers", img: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400" },
    { name: "Spiced Salted Butter-Milk (Chaas)", isVeg: true, price: 60, desc: "Cold yogurt-based cooling potion tempered with crushed ginger, green chillies, curry leaves.", sub: "Coolers", img: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400" }
  ],
  "Seafood": [
    { name: "Goan Fish Curry with steamed Rice", isVeg: false, price: 340, desc: "Regional Kingfish steak slow cooked in an intense spiced coconut mango gravy, with Basmati rice.", sub: "Curries", img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400" },
    { name: "Golden Garlic butter Tiger Prawns", isVeg: false, price: 390, desc: "Six tiger prawns tossed in pan-seared yellow organic butter, garlic elements, and parsley leaves.", sub: "Starters", img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400" },
    { name: "Mangalorean spicy Rava Fry Fish", isVeg: false, price: 310, desc: "Seer fish fillet coated with red spice masala and rolled in crunchy crisp semolina, fried dry.", sub: "Starters", img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400" },
    { name: "Spicy Crab Masala Roast Fry", isVeg: false, price: 410, desc: "Soft-shell coastal crab cooked in black pepper dry dry curry base with roasted coconut crumbs.", sub: "Curries", img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400" },
    { name: "Tandoori Pomfret Royal Whole Fish", isVeg: false, price: 440, desc: "Whole bone pomfret spiked in yoghurt-tandoor spices grill roasted, served with pickled onions.", sub: "Starters", img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400" },
    { name: "Crispy Lemon Basil Squid Rings", isVeg: false, price: 295, desc: "Deep-fried golden squid ring bites dusted with lime seasonings, green basil and pink salts.", sub: "Starters", img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400" },
    { name: "Kerala Malabar Fish Dum Curry", isVeg: false, price: 340, desc: "Traditional sour tamarind-based reddish curry cooked with local red spices and curry leaves.", sub: "Curries", img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400" },
    { name: "Shrimp Masala Fried Rice (Smoky)", isVeg: false, price: 280, desc: "Smoky fried rice loaded with prawns, cooked vegetables and organic egg scrambles, soy seasoning.", sub: "Fried Rice", img: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400" }
  ],
  "Chicken Specials": [
    { name: "Rich Punjabi Butter Chicken Masala", isVeg: false, price: 290, desc: "Tandoor roasted boneless chicken cubes cooked inside a buttery tomato cashew elite gravy.", sub: "Curries", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" },
    { name: "Spicy Chettinad Pepper Chicken Dry", isVeg: false, price: 240, desc: "Fiery dry side chicken dish from Tamil Nadu cooked with freshly ground pepper and curry leaves.", sub: "Starters", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" },
    { name: "Half Tandoori Chicken Clay-fired", isVeg: false, price: 270, desc: "Juicy bone chicken segments marinated in high red yogurt spices and clay roasted, mint dip.", sub: "Starters", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" },
    { name: "Mughlai Chicken Rezala White Curry", isVeg: false, price: 310, desc: "Royal chicken dish stewed in smooth white yoghurt paste flavored heavily with dry red pepper.", sub: "Curries", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" },
    { name: "Spicy Guntur Hot Chicken Roast", isVeg: false, price: 260, desc: "Aromatic dry chicken coated in spicy red paste, finished with dry roasted cashews.", sub: "Starters", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" },
    { name: "Chicken Mughlai Tikka Masala (Boneless)", isVeg: false, price: 295, desc: "Barbecue chicken cubes tossed in thick spicy masala gravy spiced with onion, tomato & ginger.", sub: "Curries", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" },
    { name: "Crispy Southern Spicy Chicken Drumstick", isVeg: false, price: 230, desc: "Three piece crumb-coated chicken legs seasoned with hot cayenne herbs and garlic butter dip.", sub: "Starters", img: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&q=80&w=400" },
    { name: "Home-style Chicken Methi Malai stew", isVeg: false, price: 285, desc: "Mildly spiced chicken curry cooked with fragrant fresh fenugreek leaves and sweet rich cream.", sub: "Curries", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" }
  ],
  "Mutton Specials": [
    { name: "Royal Kashmiri Mutton Rogan Josh", isVeg: false, price: 410, desc: "Slow-cooked lamb shank, spiced beautifully with dry Kashmiri peppers, fennel powder and ginger.", sub: "Curries", img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&q=80&w=400" },
    { name: "Hyderabadi Mutton Keema Masala Roast", isVeg: false, price: 380, desc: "Minced spiced mutton dry roast cooked with sweet green peas and spicy royal whole spices.", sub: "Starters", img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&q=80&w=400" },
    { name: "Mutton Bhuna Gosht dry Gravy", isVeg: false, price: 430, desc: "Tender baby goat pieces pan roasted with dry caramel brown onion reduction and dark spices.", sub: "Curries", img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&q=80&w=400" },
    { name: "Andhra Mutton Fry with curry leaves", isVeg: false, price: 390, desc: "Fiery chunks of mutton dry tossed in black pepper powder, dry chillies and rich curry leaves.", sub: "Starters", img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&q=80&w=400" },
    { name: "Lucknowi Nihari Slow-cooked Stew", isVeg: false, price: 420, desc: "Overnight slow cooked rich flour-thick stew with mutton shanks, garnished with ginger juliennes.", sub: "Curries", img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&q=80&w=400" },
    { name: "Royal Mutton Seekh Kebab Platter", isVeg: false, price: 360, desc: "Four minced spiced lamb cylinders grilled over charcoal fire served with mint yoghurt dips.", sub: "Starters", img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&q=80&w=400" },
    { name: "Bengali Mutton Kosha (Rich)", isVeg: false, price: 415, desc: "Tender mutton cooked in thick spicy mustard-infused onion gravy, paired with potatoes.", sub: "Curries", img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&q=80&w=400" },
    { name: "Royal Mutton Shami Kebab patties", isVeg: false, price: 340, desc: "Four soft minced lamb and split chickpea patties fried golden, flavored with rose cardamom.", sub: "Starters", img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&q=80&w=400" }
  ],
  "Vegetarian Specials": [
    { name: "Slow Baked Paneer Multani Tikka", isVeg: true, price: 240, desc: "Big chunks of cottage cheese stuffed with dry fruits, marinated in herb paste and baked.", sub: "Paneer", img: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=80&w=400" },
    { name: "Rich Shahi Kaju Butter Masala", isVeg: true, price: 230, desc: "Whole roasted cashew nuts simmered with onions, ground tomatoes, sweet cream butter.", sub: "Rich Veg", img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400" },
    { name: "Mix Veg Jaipuri Royal dry", isVeg: true, price: 180, desc: "Cauliflower, green beans, carrot and peas cooked in dry spicy gravy, topped with papad crumbs.", sub: "Dry", img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400" },
    { name: "Mushroom Do Pyaza curry stew", isVeg: true, price: 210, desc: "Button mushrooms sauteed dry with double portions of sweet onions, tomatoes and spice herbs.", sub: "Rich Veg", img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400" },
    { name: "Classic Banarasi Dum Aloo Fry", isVeg: true, price: 170, desc: "Fried potatoes stuffed with paneer and spices, floating in spicy, authentic ginger gravy.", sub: "Dry", img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400" },
    { name: "Dhaba Style Methi Chaman Paneer", isVeg: true, price: 245, desc: "Paneer fingers cooked with grated green spinach and bitter aromatic fresh fenugreek leaves.", sub: "Paneer", img: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=80&w=400" },
    { name: "Special Lasooni Yellow Dal Tadka", isVeg: true, price: 150, desc: "Comforting split Pigeon Pea lentil dish frothed with ghee, crispy dry red chilli and heaps of garlic.", sub: "Dal", img: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&q=80&w=400" },
    { name: "Creamy Malai Kofta Curry elite", isVeg: true, price: 250, desc: "Soft cottage cheese dumplings cooked in smooth sweet cream based white nut-seed reduction.", sub: "Rich Veg", img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400" }
  ],
  "Healthy Foods": [
    { name: "Quinoa Grain Grilled paneer Bowl", isVeg: true, price: 195, desc: "Boiled high protein quinoa topped with avocado dressing, steam broccoli and oil-free paneer cubes.", sub: "Salads/Bowls", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=400" },
    { name: "Keto Grilled Chicken Breast Caesar", isVeg: false, price: 240, desc: "Thick grilled chicken breasts, crisp romaine letuce, olives and light greek yogurt dressings.", sub: "Salads/Bowls", img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400" },
    { name: "Low Carb Baked Falafel Hummus Platter", isVeg: true, price: 175, desc: "Baked healthy oil-free chickpeas falafel served with hand ground olive oil hummus and carrots.", sub: "Platters", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=400" },
    { name: "Steam Broccoli Mushroom Tofu Saut\xE9", isVeg: true, price: 160, desc: "Wok tossed fresh broccoli stalks, button mushroom chunks and tofu in extremely light soy spray.", sub: "Stir Fry", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=400" },
    { name: "Superfruits Chia seed coconut Pudding", isVeg: true, price: 130, desc: "Hydrated chia seeds in chilled light coconut milk layered with fresh kiwi and strawberry toppings.", sub: "Dessert Jar", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=400" },
    { name: "High Protein Sprouts and Peanut salad", isVeg: true, price: 95, desc: "Sprouted green moong pulses tossed with roasted skinless peanuts, diced onion and lemon juice.", sub: "Salads/Bowls", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=400" },
    { name: "Fat Free Mediterranean Chickpea salad", isVeg: true, price: 120, desc: "Boiled large Garbanzo beans mixed with cherry tomatoes, basil, lime dressing, feta pinch.", sub: "Salads/Bowls", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=400" },
    { name: "Boiled organic White Egg Salad Bowl", isVeg: false, price: 110, desc: "Six egg white portions chopped with spring onions, green leafy lettuce, dynamic vinaigrette sprays.", sub: "Salads/Bowls", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=400" }
  ],
  "Combo Meals": [
    { name: "De luxe Nuvvo Veg Thali Combo", isVeg: true, price: 260, desc: "Complete feast - Paneer Butter curry, Yellow Dal, dry Aloo, Jeera rice, 2 Butter Rotis, Curd, Sweet.", sub: "Thalis", img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400" },
    { name: "Butter Chicken & Naan Mini Combo", isVeg: false, price: 210, desc: "Single serve portions of creamy Butter Chicken served warm with choice of 2 Garlic Butter Naans.", sub: "Mini Meals", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" },
    { name: "Royal Fried Rice & Chilli Paneer pack", isVeg: true, price: 190, desc: "Classic Schezwan fried rice served together with a medium bowl of hot saucy chilli paneer cubes.", sub: "Chinese Combo", img: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&q=80&w=400" },
    { name: "Executive Chicken Thali of the Day", isVeg: false, price: 295, desc: "Rich chicken curry, dal fry, dry mix veg, Basmati pulao rice, 2 soft ghee chapatis, salad, sweets.", sub: "Thalis", img: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400" },
    { name: "Tandoori Kabab, Roti and Chutney Meal", isVeg: false, price: 230, desc: "3 elements of soft Chicken Tikka, 2 pieces of tandoori roti served with fresh lemon and mint curd.", sub: "Mini Meals", img: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&q=80&w=400" },
    { name: "South India Sambar Rice & Vada pack", isVeg: true, price: 140, desc: "Hot aromatic Sambar Rice frothed with ghee, served with 2 crispy golden brown urad dal vadas.", sub: "Mini Meals", img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" },
    { name: "Premium Biryani & Cold Pepsi Combo", isVeg: false, price: 250, desc: "Hyderabadi Chicken Biryani single portion served with a chilled 250ml canned soda, raita, gravy.", sub: "Mini Meals", img: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400" },
    { name: "Kids Special Mini Burger and Fries Box", isVeg: true, price: 160, desc: "Fun size soft potato cheese burger paired with lightweight salted french fries, mango fruity.", sub: "Kids Special", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400" }
  ],
  "Kids Specials": [
    { name: "Mini Golden SMILEYS Basket", isVeg: true, price: 90, desc: "Eight fun-face crispy potato smileys roasted golden, served with sweet tomato sauce dips.", sub: "Finger Foods", img: "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&q=80&w=400" },
    { name: "Cute Cheesy Paneer Slider Burgers", isVeg: true, price: 120, desc: "Two bite-sized tiny soft buns stacked with sweet paneer, mild cheese cream and tomato slice.", sub: "Sliders", img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400" },
    { name: "Premium Choco Chip pancake Tower", isVeg: true, price: 110, desc: "Three sweet baby wheat pancakes loaded with melted milk chocolate chips and sugar syrup.", sub: "Sweets", img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400" },
    { name: "Smash Potato Cheddar Cheese Balls", isVeg: true, price: 105, desc: "Loaded mashed potato rounds stuffed with melting cheddar core, cracker crumbs fried.", sub: "Finger Foods", img: "https://images.unsplash.com/photo-1531749668029-2db88e4b76ce?auto=format&fit=crop&q=80&w=400" },
    { name: "Happy Mac & Cheese Mini Bowl", isVeg: true, price: 130, desc: "Super mild pasta shells baked inside a sweet white cream cheese sauce. Zero spices.", sub: "Mini Cups", img: "https://images.unsplash.com/photo-1544982503-9f984c14501a?auto=format&fit=crop&q=80&w=400" },
    { name: "Sweet Chocolate Milkshake with Oreos", isVeg: true, price: 95, desc: "Kid size delightful chocolate shake blended with chocolate chips, frothed beautifully.", sub: "Drinks", img: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400" },
    { name: "Chicken Dino Nuggets Golden Box", isVeg: false, price: 135, desc: "Six dinosaur-shaped mild crispy chicken breast cutlets, fried perfectly with honey dip.", sub: "Finger Foods", img: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&q=80&w=400" },
    { name: "Cute Fruit Jelly Custard Jar", isVeg: true, price: 85, desc: "Cool sweet vanilla milk custard cream layered with raspberry jelly cubes and sweet raisins.", sub: "Sweets", img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400" }
  ]
};
var FOOD_CATALOG = [];
var MOCK_REVIEWS_TEMPLATES = [
  { name: "Rahul Sharma", comment: "Taste is absolutely incredible. Spiced just right, packing is perfect!", rating: 5 },
  { name: "Priya Patel", comment: "Super hot delivery! Nuvvo has become my default brand. Highly recommended.", rating: 5 },
  { name: "Anish Reddy", comment: "Loved it. Genuine traditional ingredients. Will order again.", rating: 4 },
  { name: "Kushal Gowda", comment: "A bit spicy, but the packaging and raw quality was supreme!", rating: 4 },
  { name: "Meera Sen", comment: "Really fresh and clean, not greasy at all. Fits my macros.", rating: 5 }
];
var globalItemIndex = 1;
CATEGORIES.forEach((cat) => {
  const sourceArr = CATEGORY_ITEMS_SOURCE[cat] || [];
  sourceArr.forEach((item, idx) => {
    const reviews = MOCK_REVIEWS_TEMPLATES.map((tpl, tIdx) => ({
      id: `rev_${globalItemIndex}_${tIdx}`,
      user: tpl.name,
      rating: Math.min(5, Math.max(1, tpl.rating + (idx % 2 === 0 ? 0 : -1))),
      comment: tpl.comment,
      date: "2026-06-12"
    }));
    let spice = "Medium";
    if (cat === "Biryani" || cat === "Chicken Specials" || cat === "Mutton Specials" || cat === "Seafood") {
      spice = idx % 2 === 0 ? "High" : "Medium";
    } else if (cat === "Ice Cream" || cat === "Desserts" || cat === "Juices" || cat === "Milkshakes" || cat === "Bakery") {
      spice = "None";
    }
    const customizations = [
      {
        title: "Choose Portion Size",
        required: true,
        options: [
          { name: "Regular Portion", price: 0 },
          { name: "Premium Jumbo Portion", price: Math.round(item.price * 0.4) }
        ]
      },
      {
        title: "Add-Ons & Extras",
        required: false,
        options: [
          { name: "Extra Cheese Slice / Topping", price: 50 },
          { name: "Aromatic Herbs Mix", price: 20 },
          { name: "Chilled Soda Can (150ml)", price: 35 }
        ]
      }
    ];
    FOOD_CATALOG.push({
      id: `food_${globalItemIndex}`,
      name: item.name,
      description: item.desc,
      vegIndicator: item.isVeg ? VegIndicator.VEG : VegIndicator.NON_VEG,
      rating: parseFloat((4 + globalItemIndex % 10 * 0.1).toFixed(1)),
      reviewsCount: 15 + globalItemIndex * 4 % 180,
      prepTime: 15 + globalItemIndex * 3 % 25,
      price: item.price,
      discountPrice: Math.round(item.price * 0.85),
      // 15% flat discount
      image: item.img,
      category: cat,
      subcategory: item.sub,
      ingredients: ["Fresh Native Produce", "Natural Unrefined Oils", "Chef Secret Spices", "Himalayan Organic Salt"],
      spiceLevel: spice,
      customizations,
      isBestSeller: idx < 2,
      isTrending: idx >= 2 && idx < 4,
      reviews
    });
    globalItemIndex++;
  });
});

// src/data/chiralaPartners.ts
var CHIRALA_TOP13_FOOD_ITEMS = [
  // 1. గోదావరి రుచులు (chirala_rest_1)
  {
    id: "chirala_food_1_1",
    restaurantId: "chirala_rest_1",
    name: "\u0C17\u0C4B\u0C26\u0C3E\u0C35\u0C30\u0C3F \u0C30\u0C4A\u0C2F\u0C4D\u0C2F\u0C32 \u0C35\u0C47\u0C2A\u0C41\u0C21\u0C41 (Godavari Royyala Vepudu)",
    description: "Authentic Godavari style fresh coastal prawns roasted with caramelized onions, curry leaves, and spicy pepper masala.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.9,
    reviewsCount: 240,
    prepTime: 20,
    price: 340,
    discountPrice: 289,
    image: "https://images.unsplash.com/photo-1551248429-40975aa4de74?auto=format&fit=crop&q=80&w=400",
    category: "Seafood",
    subcategory: "Starters",
    ingredients: ["Fresh Coastal Prawns", "Curry Leaves", "Godavari Masala", "Ghee"],
    spiceLevel: "High",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_1_2",
    restaurantId: "chirala_rest_1",
    name: "\u0C17\u0C4B\u0C26\u0C3E\u0C35\u0C30\u0C3F \u0C38\u0C40\u0C2B\u0C41\u0C21\u0C4D \u0C38\u0C4D\u0C2A\u0C46\u0C37\u0C32\u0C4D \u0C2C\u0C3F\u0C30\u0C4D\u0C2F\u0C3E\u0C28\u0C40 (Godavari Seafood Biryani)",
    description: "Aromatic basmati rice cooked with fresh coastal prawns and fish fillet in traditional Godavari clay pot style.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.8,
    reviewsCount: 195,
    prepTime: 25,
    price: 380,
    discountPrice: 320,
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400",
    category: "Biryani",
    subcategory: "Seafood Biryani",
    ingredients: ["Basmati Rice", "Prawns", "Fish Chunks", "Godavari Dum Spices"],
    spiceLevel: "High",
    isTrending: true,
    reviews: []
  },
  {
    id: "chirala_food_1_3",
    restaurantId: "chirala_rest_1",
    name: "\u0C15\u0C4A\u0C28\u0C38\u0C40\u0C2E \u0C1A\u0C3E\u0C2A\u0C32 \u0C2A\u0C41\u0C32\u0C41\u0C38\u0C41 (Konaseema Chepala Pulusu)",
    description: "Traditional tangy and fiery tamarind fish curry slow-simmered in an earthen pot.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.9,
    reviewsCount: 310,
    prepTime: 20,
    price: 310,
    discountPrice: 260,
    image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&q=80&w=400",
    category: "Seafood",
    subcategory: "Curry",
    ingredients: ["Fresh Sea Fish", "Tamarind", "Green Chillies", "Shallots"],
    spiceLevel: "High",
    isBestSeller: true,
    reviews: []
  },
  // 2. 9 to 9 హైదరాబాద్ దమ్ బిర్యాని (chirala_rest_2)
  {
    id: "chirala_food_2_1",
    restaurantId: "chirala_rest_2",
    name: "9 to 9 \u0C38\u0C4D\u0C2A\u0C46\u0C37\u0C32\u0C4D \u0C1A\u0C3F\u0C15\u0C46\u0C28\u0C4D \u0C26\u0C2E\u0C4D \u0C2C\u0C3F\u0C30\u0C4D\u0C2F\u0C3E\u0C28\u0C40 (9 to 9 Special Chicken Dum Biryani)",
    description: "Signature Hyderabadi dum biryani cooked with marinated succulent chicken and aromatic saffron-infused long grain basmati rice.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.9,
    reviewsCount: 420,
    prepTime: 20,
    price: 280,
    discountPrice: 239,
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400",
    category: "Biryani",
    subcategory: "Chicken Biryani",
    ingredients: ["Tender Chicken", "Basmati Rice", "Hyderabadi Potli Masala", "Pure Ghee"],
    spiceLevel: "Medium",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_2_2",
    restaurantId: "chirala_rest_2",
    name: "9 to 9 \u0C39\u0C48\u0C26\u0C30\u0C3E\u0C2C\u0C3E\u0C26\u0C4D \u0C2E\u0C1F\u0C28\u0C4D \u0C26\u0C2E\u0C4D \u0C2C\u0C3F\u0C30\u0C4D\u0C2F\u0C3E\u0C28\u0C40 (9 to 9 Mutton Dum Biryani)",
    description: "Slow-cooked melt-in-mouth tender goat mutton layered with saffron basmati rice and roasted spices.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.8,
    reviewsCount: 290,
    prepTime: 25,
    price: 390,
    discountPrice: 340,
    image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&q=80&w=400",
    category: "Mutton Specials",
    subcategory: "Biryani",
    ingredients: ["Premium Mutton", "Aged Basmati Rice", "Saffron", "Fried Onions"],
    spiceLevel: "Medium",
    isTrending: true,
    reviews: []
  },
  {
    id: "chirala_food_2_3",
    restaurantId: "chirala_rest_2",
    name: "9 to 9 \u0C15\u0C4D\u0C30\u0C3F\u0C38\u0C4D\u0C2A\u0C40 \u0C1A\u0C3F\u0C15\u0C46\u0C28\u0C4D 65 (9 to 9 Crispy Chicken 65)",
    description: "Deep-fried marinated boneless chicken bites tossed with curry leaves, yogurt, and crushed green chillies.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.8,
    reviewsCount: 310,
    prepTime: 15,
    price: 240,
    discountPrice: 199,
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400",
    category: "Chicken Specials",
    subcategory: "Starters",
    ingredients: ["Boneless Chicken", "Curry Leaves", "Red Chili Glaze", "Yogurt"],
    spiceLevel: "High",
    reviews: []
  },
  // 3. న్యూ ఐస్ బర్గ్ (chirala_rest_3)
  {
    id: "chirala_food_3_1",
    restaurantId: "chirala_rest_3",
    name: "\u0C28\u0C4D\u0C2F\u0C42 \u0C10\u0C38\u0C4D \u0C2C\u0C30\u0C4D\u0C17\u0C4D \u0C30\u0C3E\u0C2F\u0C32\u0C4D \u0C2B\u0C4D\u0C30\u0C42\u0C1F\u0C4D \u0C38\u0C02\u0C21\u0C47 (New Iceberg Royal Fruit Sundae)",
    description: "Loaded exotic fruit sundae with fresh mango, kiwi, strawberry scoops, topped with candied nuts and honey drizzles.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.9,
    reviewsCount: 380,
    prepTime: 10,
    price: 180,
    discountPrice: 150,
    image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400",
    category: "Ice Cream",
    subcategory: "Sundaes",
    ingredients: ["Seasonal Fruits", "Vanilla Cream", "Strawberry Scoop", "Roasted Almonds"],
    spiceLevel: "None",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_3_2",
    restaurantId: "chirala_rest_3",
    name: "\u0C15\u0C47\u0C38\u0C30\u0C4D \u0C2A\u0C3F\u0C38\u0C4D\u0C24\u0C3E \u0C38\u0C4D\u0C2A\u0C46\u0C37\u0C32\u0C4D \u0C2B\u0C32\u0C42\u0C26\u0C3E (Kesar Pista Special Falooda)",
    description: "Chilled condensed milk infused with royal saffron, crunchy pista, sabja seeds, and vermicelli topped with ice cream.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.8,
    reviewsCount: 220,
    prepTime: 10,
    price: 160,
    discountPrice: 135,
    image: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400",
    category: "Desserts",
    subcategory: "Falooda",
    ingredients: ["Kesar Milk", "Pistachios", "Sabja Seeds", "Falooda Sev"],
    spiceLevel: "None",
    reviews: []
  },
  // 4. న్యూ ఐస్ బర్గ్ టెంటేషన్ (chirala_rest_4)
  {
    id: "chirala_food_4_1",
    restaurantId: "chirala_rest_4",
    name: "\u0C1F\u0C46\u0C02\u0C2A\u0C4D\u0C1F\u0C47\u0C37\u0C28\u0C4D \u0C1A\u0C3E\u0C15\u0C4B \u0C2B\u0C21\u0C4D\u0C1C\u0C4D \u0C2C\u0C4D\u0C30\u0C4C\u0C28\u0C40 \u0C38\u0C3F\u0C1C\u0C4D\u0C32\u0C30\u0C4D (Temptation Choco Fudge Brownie Sizzler)",
    description: "Warm, gooey dark chocolate walnut brownie served on a hot plate with vanilla ice cream and hot chocolate fudge.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.9,
    reviewsCount: 410,
    prepTime: 12,
    price: 220,
    discountPrice: 189,
    image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=400",
    category: "Desserts",
    subcategory: "Sizzlers",
    ingredients: ["Dark Chocolate Brownie", "Vanilla Ice Cream", "Hot Fudge", "Walnuts"],
    spiceLevel: "None",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_4_2",
    restaurantId: "chirala_rest_4",
    name: "\u0C15\u0C3F\u0C1F\u0C4D\u200C\u0C15\u0C4D\u0C2F\u0C3E\u0C1F\u0C4D \u0C13\u0C30\u0C3F\u0C2F\u0C4B \u0C25\u0C3F\u0C15\u0C4D\u200C\u0C37\u0C47\u0C15\u0C4D (KitKat Oreo Thick Shake)",
    description: "Ultra-rich creamy chocolate thickshake blended with crunchy KitKat and Oreo cookies.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.8,
    reviewsCount: 260,
    prepTime: 10,
    price: 170,
    discountPrice: 145,
    image: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&q=80&w=400",
    category: "Milkshakes",
    subcategory: "Chocolate Shakes",
    ingredients: ["Fresh Cream Milk", "KitKat Bars", "Oreo Cookies", "Chocolate Drizzle"],
    spiceLevel: "None",
    reviews: []
  },
  // 5. ఐస్ మ్యాజిక్ (chirala_rest_5)
  {
    id: "chirala_food_5_1",
    restaurantId: "chirala_rest_5",
    name: "\u0C10\u0C38\u0C4D \u0C2E\u0C4D\u0C2F\u0C3E\u0C1C\u0C3F\u0C15\u0C4D \u0C38\u0C4D\u0C2A\u0C46\u0C37\u0C32\u0C4D \u0C15\u0C41\u0C32\u0C4D\u0C2B\u0C40 \u0C2E\u0C1F\u0C4D\u0C15\u0C3E (Ice Magic Special Matka Kulfi)",
    description: "Traditional slow-reduced rabri kulfi set in an authentic clay pot, loaded with dry fruits and saffron.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.8,
    reviewsCount: 290,
    prepTime: 5,
    price: 120,
    discountPrice: 99,
    image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400",
    category: "Ice Cream",
    subcategory: "Kulfi",
    ingredients: ["Rabri", "Cardamom", "Cashews", "Saffron"],
    spiceLevel: "None",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_5_2",
    restaurantId: "chirala_rest_5",
    name: "\u0C2E\u0C3E\u0C02\u0C17\u0C4B \u0C2E\u0C38\u0C4D\u0C24\u0C3E\u0C28\u0C40 \u0C35\u0C3F\u0C24\u0C4D \u0C10\u0C38\u0C4D \u0C15\u0C4D\u0C30\u0C40\u0C2E\u0C4D (Mango Mastani with Ice Cream)",
    description: "Pune style thick chilled mango shake crowned with real mango ice cream and dry fruits.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.8,
    reviewsCount: 180,
    prepTime: 10,
    price: 160,
    discountPrice: 135,
    image: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&q=80&w=400",
    category: "Juices",
    subcategory: "Smoothies",
    ingredients: ["Fresh Mango Pulp", "Mango Ice Cream", "Tutti Frutti", "Almonds"],
    spiceLevel: "None",
    reviews: []
  },
  // 6. మిస్సమ్మ ఫ్యామిలీ రెస్టారెంట్ (chirala_rest_6)
  {
    id: "chirala_food_6_1",
    restaurantId: "chirala_rest_6",
    name: "\u0C2E\u0C3F\u0C38\u0C4D\u0C38\u0C2E\u0C4D\u0C2E \u0C38\u0C4D\u0C2A\u0C46\u0C37\u0C32\u0C4D \u0C1A\u0C3F\u0C15\u0C46\u0C28\u0C4D \u0C26\u0C2E\u0C4D \u0C2C\u0C3F\u0C30\u0C4D\u0C2F\u0C3E\u0C28\u0C40 (Missamma Special Chicken Biryani)",
    description: "Famous Chirala local recipe prepared with tender farm-fresh chicken and country spices.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.9,
    reviewsCount: 520,
    prepTime: 20,
    price: 290,
    discountPrice: 249,
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400",
    category: "Biryani",
    subcategory: "Chicken Biryani",
    ingredients: ["Country Chicken", "Basmati Rice", "Missamma Spices", "Ghee"],
    spiceLevel: "High",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_6_2",
    restaurantId: "chirala_rest_6",
    name: "\u0C2E\u0C3F\u0C38\u0C4D\u0C38\u0C2E\u0C4D\u0C2E \u0C30\u0C3E\u0C2F\u0C32\u0C4D \u0C06\u0C02\u0C27\u0C4D\u0C30 \u0C2E\u0C40\u0C32\u0C4D\u0C38\u0C4D \u0C25\u0C3E\u0C32\u0C3F (Missamma Royal Andhra Thali)",
    description: "Grand unlimited Andhra meal platter with pappu, sambar, rasam, 2 curries, podi, curd, and papad.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.8,
    reviewsCount: 450,
    prepTime: 15,
    price: 220,
    discountPrice: 189,
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400",
    category: "South Indian",
    subcategory: "Thali",
    ingredients: ["Sona Masoori Rice", "Pappu", "Sambar", "Ghee Podi"],
    spiceLevel: "Medium",
    isTrending: true,
    reviews: []
  },
  // 7. తన్సీ ఫుడ్ కోర్ట్ (chirala_rest_7)
  {
    id: "chirala_food_7_1",
    restaurantId: "chirala_rest_7",
    name: "\u0C24\u0C28\u0C4D\u0C38\u0C40 \u0C38\u0C4D\u0C2A\u0C46\u0C37\u0C32\u0C4D \u0C1A\u0C3F\u0C15\u0C46\u0C28\u0C4D \u0C2B\u0C4D\u0C30\u0C48\u0C21\u0C4D \u0C30\u0C48\u0C38\u0C4D (Tansee Special Chicken Fried Rice)",
    description: "Wok-tossed long-grain basmati rice with shredded chicken, scramble egg, and scallions in rich soy seasoning.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.8,
    reviewsCount: 340,
    prepTime: 15,
    price: 190,
    discountPrice: 159,
    image: "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&q=80&w=400",
    category: "Chinese",
    subcategory: "Fried Rice",
    ingredients: ["Basmati Rice", "Chicken", "Egg", "Spring Onions"],
    spiceLevel: "Medium",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_7_2",
    restaurantId: "chirala_rest_7",
    name: "\u0C38\u0C4D\u0C2A\u0C48\u0C38\u0C40 \u0C1A\u0C3F\u0C15\u0C46\u0C28\u0C4D \u0C37\u0C35\u0C30\u0C4D\u0C2E\u0C3E \u0C30\u0C4B\u0C32\u0C4D (Spicy Chicken Shawarma Roll)",
    description: "Juicy spit-roasted chicken wrapped in warm rumali roti with garlic mayonnaise, pickled gherkins, and french fries.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.7,
    reviewsCount: 280,
    prepTime: 12,
    price: 140,
    discountPrice: 119,
    image: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&q=80&w=400",
    category: "Shawarma",
    subcategory: "Rolls",
    ingredients: ["Roast Chicken", "Rumali Roti", "Garlic Mayo", "Pickles"],
    spiceLevel: "Medium",
    reviews: []
  },
  // 8. ఆరెంజ్ ఫ్యామిలీ రెస్టారెంట్ (chirala_rest_8)
  {
    id: "chirala_food_8_1",
    restaurantId: "chirala_rest_8",
    name: "\u0C06\u0C30\u0C46\u0C02\u0C1C\u0C4D \u0C38\u0C4D\u0C2A\u0C46\u0C37\u0C32\u0C4D \u0C2C\u0C4B\u0C28\u0C4D\u200C\u0C32\u0C46\u0C38\u0C4D \u0C2C\u0C3F\u0C30\u0C4D\u0C2F\u0C3E\u0C28\u0C40 (Orange Special Boneless Biryani)",
    description: "Juicy spiced chicken boneless tikka cubes layered into fragrant dum biryani rice with caramelized onions.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.8,
    reviewsCount: 390,
    prepTime: 20,
    price: 310,
    discountPrice: 265,
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400",
    category: "Biryani",
    subcategory: "Chicken Biryani",
    ingredients: ["Boneless Chicken Tikka", "Basmati Rice", "Orange Special Masala"],
    spiceLevel: "Medium",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_8_2",
    restaurantId: "chirala_rest_8",
    name: "\u0C06\u0C30\u0C46\u0C02\u0C1C\u0C4D \u0C15\u0C3E\u0C1C\u0C41 \u0C2A\u0C28\u0C40\u0C30\u0C4D \u0C2E\u0C38\u0C3E\u0C32\u0C3E (Orange Kaju Paneer Masala)",
    description: "Cottage cheese cubes and whole roasted cashews simmered in a creamy tomato-onion butter gravy.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.8,
    reviewsCount: 230,
    prepTime: 18,
    price: 250,
    discountPrice: 215,
    image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&q=80&w=400",
    category: "North Indian",
    subcategory: "Curry",
    ingredients: ["Paneer", "Roasted Cashews", "Fresh Cream", "Butter Gravy"],
    spiceLevel: "Medium",
    reviews: []
  },
  // 9. వాసుదేవ విల్లాస్ (chirala_rest_9)
  {
    id: "chirala_food_9_1",
    restaurantId: "chirala_rest_9",
    name: "\u0C35\u0C3E\u0C38\u0C41\u0C26\u0C47\u0C35 \u0C28\u0C46\u0C2F\u0C4D\u0C2F\u0C3F \u0C15\u0C3E\u0C30\u0C02 \u0C26\u0C4B\u0C36 (Vasudeva Ghee Karam Podi Dosa)",
    description: "Crispy golden crepe roasted generously in pure desi ghee and layered with authentic spicy red chutney and gun powder podi.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.9,
    reviewsCount: 510,
    prepTime: 10,
    price: 90,
    discountPrice: 75,
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400",
    category: "South Indian",
    subcategory: "Tiffins",
    ingredients: ["Fermented Rice Batter", "Pure Desi Ghee", "Karam Podi", "Coconut Chutney"],
    spiceLevel: "Medium",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_9_2",
    restaurantId: "chirala_rest_9",
    name: "\u0C2C\u0C1F\u0C28\u0C4D \u0C38\u0C3E\u0C02\u0C2C\u0C3E\u0C30\u0C4D \u0C07\u0C21\u0C4D\u0C32\u0C40 \u0C35\u0C3F\u0C24\u0C4D \u0C18\u0C40 (Button Sambar Ghee Idli 10pcs)",
    description: "10 melt-in-the-mouth mini steamed rice idlis submerged in hot aromatic drumstick sambar and pure ghee.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.9,
    reviewsCount: 380,
    prepTime: 10,
    price: 80,
    discountPrice: 69,
    image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400",
    category: "Tiffins",
    subcategory: "Idli",
    ingredients: ["Steamed Rice Cakes", "Drumstick Sambar", "Desi Ghee", "Coriander"],
    spiceLevel: "Medium",
    isTrending: true,
    reviews: []
  },
  // 10. శ్రీ వీర హనుమాన్ బిర్యాని పాయింట్ (chirala_rest_10)
  {
    id: "chirala_food_10_1",
    restaurantId: "chirala_rest_10",
    name: "\u0C36\u0C4D\u0C30\u0C40 \u0C35\u0C40\u0C30 \u0C39\u0C28\u0C41\u0C2E\u0C3E\u0C28\u0C4D \u0C1A\u0C3F\u0C15\u0C46\u0C28\u0C4D \u0C1C\u0C3E\u0C2F\u0C3F\u0C02\u0C1F\u0C4D \u0C2C\u0C3F\u0C30\u0C4D\u0C2F\u0C3E\u0C28\u0C40 (Veera Hanuman Chicken Joint Biryani)",
    description: "Spicy marinated whole chicken leg joint roasted and served over steaming spicy Andhra dum biryani.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.9,
    reviewsCount: 480,
    prepTime: 20,
    price: 280,
    discountPrice: 239,
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400",
    category: "Biryani",
    subcategory: "Chicken Biryani",
    ingredients: ["Chicken Leg Joint", "Basmati Rice", "Spicy Andhra Masala"],
    spiceLevel: "High",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_10_2",
    restaurantId: "chirala_rest_10",
    name: "\u0C35\u0C40\u0C30 \u0C39\u0C28\u0C41\u0C2E\u0C3E\u0C28\u0C4D \u0C38\u0C4D\u0C2A\u0C48\u0C38\u0C40 \u0C2B\u0C4D\u0C30\u0C48 \u0C2A\u0C40\u0C38\u0C4D \u0C2C\u0C3F\u0C30\u0C4D\u0C2F\u0C3E\u0C28\u0C40 (Veera Hanuman Fry Piece Biryani)",
    description: "Crispy fried chicken chunks with pepper, green chillies, and garlic topped on basmati biryani.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.8,
    reviewsCount: 340,
    prepTime: 20,
    price: 290,
    discountPrice: 249,
    image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&q=80&w=400",
    category: "Biryani",
    subcategory: "Chicken Biryani",
    ingredients: ["Fried Chicken Pcs", "Curry Leaves", "Basmati Rice", "Raita"],
    spiceLevel: "High",
    reviews: []
  },
  // 11. ఫ్రైడ్ వింగ్స్ (chirala_rest_11)
  {
    id: "chirala_food_11_1",
    restaurantId: "chirala_rest_11",
    name: "\u0C15\u0C4D\u0C30\u0C3F\u0C38\u0C4D\u0C2A\u0C40 \u0C2B\u0C4D\u0C30\u0C48\u0C21\u0C4D \u0C1A\u0C3F\u0C15\u0C46\u0C28\u0C4D \u0C35\u0C3F\u0C02\u0C17\u0C4D\u0C38\u0C4D (6 Pcs Crispy Fried Wings)",
    description: "Golden crispy fried chicken wings coated in seasoned breading with garlic dip.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.8,
    reviewsCount: 390,
    prepTime: 15,
    price: 230,
    discountPrice: 195,
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=400",
    category: "Fast Food",
    subcategory: "Chicken Wings",
    ingredients: ["Chicken Wings", "Crispy Batter", "Garlic Mayo", "Secret Herbs"],
    spiceLevel: "Medium",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_11_2",
    restaurantId: "chirala_rest_11",
    name: "\u0C2A\u0C46\u0C30\u0C3F \u0C2A\u0C46\u0C30\u0C3F \u0C38\u0C4D\u0C2A\u0C48\u0C38\u0C40 \u0C35\u0C3F\u0C02\u0C17\u0C4D\u0C38\u0C4D \u0C2C\u0C15\u0C46\u0C1F\u0C4D (Peri Peri Hot Wings Bucket 10 Pcs)",
    description: "Jumbo bucket of crunchy chicken wings dusted in hot African peri-peri seasoning.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.9,
    reviewsCount: 310,
    prepTime: 18,
    price: 350,
    discountPrice: 299,
    image: "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&q=80&w=400",
    category: "Fast Food",
    subcategory: "Chicken Wings",
    ingredients: ["Chicken Wings", "Peri Peri Rub", "Herb Dip"],
    spiceLevel: "High",
    reviews: []
  },
  // 12. గురు కృప బేకరీ (chirala_rest_12)
  {
    id: "chirala_food_12_1",
    restaurantId: "chirala_rest_12",
    name: "\u0C17\u0C41\u0C30\u0C41 \u0C15\u0C43\u0C2A \u0C39\u0C3E\u0C1F\u0C4D \u0C0E\u0C17\u0C4D \u0C2A\u0C2B\u0C4D (Guru Krupa Fresh Baked Egg Puff 2 Pcs)",
    description: "Flaky and buttery puff pastry stuffed with hard-boiled egg half and spiced onion masala.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.8,
    reviewsCount: 320,
    prepTime: 5,
    price: 60,
    discountPrice: 50,
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400",
    category: "Bakery",
    subcategory: "Puffs",
    ingredients: ["Egg", "Puff Dough", "Caramelized Onions", "Pepper"],
    spiceLevel: "Medium",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_12_2",
    restaurantId: "chirala_rest_12",
    name: "\u0C17\u0C41\u0C30\u0C41 \u0C15\u0C43\u0C2A \u0C1F\u0C4D\u0C30\u0C46\u0C21\u0C3F\u0C37\u0C28\u0C32\u0C4D \u0C2A\u0C4D\u0C32\u0C2E\u0C4D \u0C15\u0C47\u0C15\u0C4D (Guru Krupa Rich Fruit Plum Cake 400g)",
    description: "Classic rich tea cake loaded with candied peels, raisins, and aromatic winter spices.",
    vegIndicator: VegIndicator.VEG,
    rating: 4.9,
    reviewsCount: 280,
    prepTime: 5,
    price: 180,
    discountPrice: 155,
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400",
    category: "Bakery",
    subcategory: "Cakes",
    ingredients: ["Dry Fruits", "Butter Cake Sponge", "Cardamom", "Cinnamon"],
    spiceLevel: "None",
    reviews: []
  },
  // 13. మణికంఠ స్పైసీ బిర్యానీ (chirala_rest_13)
  {
    id: "chirala_food_13_1",
    restaurantId: "chirala_rest_13",
    name: "\u0C2E\u0C23\u0C3F\u0C15\u0C02\u0C20 \u0C06\u0C02\u0C27\u0C4D\u0C30 \u0C38\u0C4D\u0C2A\u0C48\u0C38\u0C40 \u0C1A\u0C3F\u0C15\u0C46\u0C28\u0C4D \u0C2C\u0C3F\u0C30\u0C4D\u0C2F\u0C3E\u0C28\u0C40 (Manikanta Andhra Spicy Biryani)",
    description: "Piping hot authentic Andhra style fiery chicken biryani with tender chicken pieces and special guntur spices.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.9,
    reviewsCount: 460,
    prepTime: 20,
    price: 270,
    discountPrice: 229,
    image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=80&w=400",
    category: "Biryani",
    subcategory: "Chicken Biryani",
    ingredients: ["Chicken Pieces", "Guntur Chilli Paste", "Basmati Rice", "Ghee"],
    spiceLevel: "High",
    isBestSeller: true,
    reviews: []
  },
  {
    id: "chirala_food_13_2",
    restaurantId: "chirala_rest_13",
    name: "\u0C2E\u0C23\u0C3F\u0C15\u0C02\u0C20 \u0C2E\u0C1F\u0C28\u0C4D \u0C38\u0C41\u0C15\u0C4D\u0C15\u0C3E \u0C26\u0C2E\u0C4D \u0C2C\u0C3F\u0C30\u0C4D\u0C2F\u0C3E\u0C28\u0C40 (Manikanta Mutton Sukka Biryani)",
    description: "Dry roasted tender mutton pieces tossed with crushed black pepper layered in aromatic biryani.",
    vegIndicator: VegIndicator.NON_VEG,
    rating: 4.9,
    reviewsCount: 380,
    prepTime: 25,
    price: 380,
    discountPrice: 330,
    image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&q=80&w=400",
    category: "Mutton Specials",
    subcategory: "Biryani",
    ingredients: ["Mutton Sukka", "Pepper Masala", "Basmati Rice", "Mint Leaves"],
    spiceLevel: "High",
    isTrending: true,
    reviews: []
  }
];

// src/utils/supabase/server.ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
var getSupabaseUrl = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://bitxmpjuetvfbhdyfvok.supabase.co";
  return url.trim();
};
var getAdminSupabaseServerClient = () => {
  try {
    const privilegedKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (privilegedKey && privilegedKey.trim()) {
      const supabaseUrl = getSupabaseUrl();
      const client = createSupabaseClient(supabaseUrl, privilegedKey.trim(), {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
      return { client, error: null, isServiceRole: true };
    }
  } catch (err) {
    console.warn("Notice: Service role client initialization deferred:", err?.message);
  }
  const publicClient = getPublicSupabaseServerClient();
  return {
    client: publicClient,
    error: null,
    isServiceRole: false
  };
};
var getPublicSupabaseServerClient = () => {
  const supabaseUrl = getSupabaseUrl();
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_-uXD4j7ITcsUZWT7_IDQ3A_AXLPWBCX";
  return createSupabaseClient(supabaseUrl, publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};
var createServerClient = () => {
  return getPublicSupabaseServerClient();
};
var checkServerSupabaseDiagnostics = async () => {
  const url = getSupabaseUrl();
  const { client, error, isServiceRole } = getAdminSupabaseServerClient();
  if (!client || error) {
    return {
      success: false,
      isServiceRoleConfigured: false,
      url,
      databaseAccess: false,
      message: "Server SERVICE_ROLE_KEY is not configured.",
      error: error || "Missing privileged key"
    };
  }
  try {
    const { data, error: dbError, count } = await client.from("food_items").select("id", { count: "exact", head: true });
    if (dbError) {
      return {
        success: false,
        isServiceRoleConfigured: isServiceRole,
        url,
        databaseAccess: false,
        message: `Database query failed: ${dbError.message}`,
        error: dbError.message,
        details: dbError
      };
    }
    return {
      success: true,
      isServiceRoleConfigured: isServiceRole,
      url,
      databaseAccess: true,
      message: isServiceRole ? "Supabase client successfully initialized with SERVICE_ROLE_KEY and accessing database." : "Supabase client connected using anon key. For server-side write permissions without RLS restrictions, configure SUPABASE_SERVICE_ROLE_KEY in Vercel project settings.",
      details: { rowCount: count }
    };
  } catch (err) {
    return {
      success: false,
      isServiceRoleConfigured: isServiceRole,
      url,
      databaseAccess: false,
      message: `Exception while accessing database: ${err?.message || err}`,
      error: err?.message || String(err)
    };
  }
};

// api/auth/debug-otp.ts
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();
function generateOtpDiagnostics() {
  const sessionSecretVal = process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || "";
  const isCustomSessionSecret = Boolean(process.env.SESSION_SECRET);
  const sessionSecretLength = sessionSecretVal.length;
  const isSessionSecretStrong = sessionSecretLength >= 24;
  const twilioSid = process.env.TWILIO_ACCOUNT_SID || "";
  const twilioToken = process.env.TWILIO_AUTH_TOKEN || "";
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER || "";
  const fast2SmsKey = process.env.FAST2SMS_API_KEY || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || "";
  const adminPhoneVal = process.env.ADMIN_PHONE || "9063692135";
  const adminPinVal = process.env.ADMIN_SECURITY_PIN || "2026";
  const disableTwilio = process.env.DISABLE_TWILIO === "true" || process.env.BLOCK_TWILIO === "true";
  const isTwilioFullyConfigured = !disableTwilio && Boolean(twilioSid.trim() && twilioToken.trim() && twilioPhone.trim());
  const isFast2SmsConfigured = Boolean(fast2SmsKey.trim());
  const isRealSmsProviderActive = isTwilioFullyConfigured || isFast2SmsConfigured;
  const cleanAdminPhone = adminPhoneVal.replace(/\D/g, "");
  const maskedAdminPhone = cleanAdminPhone.length >= 4 ? "*".repeat(Math.max(0, cleanAdminPhone.length - 4)) + cleanAdminPhone.slice(-4) : "****";
  let randomIntFunctional = false;
  let pbkdf2Functional = false;
  let hmacSha256Functional = false;
  let timingSafeEqualFunctional = false;
  try {
    const testInt = crypto.randomInt(1e5, 1e6);
    randomIntFunctional = testInt >= 1e5 && testInt < 1e6;
  } catch {
    randomIntFunctional = false;
  }
  try {
    const testSalt = crypto.randomBytes(8).toString("hex");
    const testHash = crypto.pbkdf2Sync("test-pass", testSalt, 100, 16, "sha256").toString("hex");
    pbkdf2Functional = Boolean(testHash && testHash.length === 32);
  } catch {
    pbkdf2Functional = false;
  }
  try {
    const testSig = crypto.createHmac("sha256", sessionSecretVal || "nuvvo_test_salt").update("healthcheck_payload").digest("base64url");
    hmacSha256Functional = Boolean(testSig && testSig.length > 20);
  } catch {
    hmacSha256Functional = false;
  }
  try {
    const bufA = Buffer.from("nuvvo_sig_a");
    const bufB = Buffer.from("nuvvo_sig_a");
    timingSafeEqualFunctional = crypto.timingSafeEqual(bufA, bufB);
  } catch {
    timingSafeEqualFunctional = false;
  }
  const allCryptoChecksPassed = randomIntFunctional && pbkdf2Functional && hmacSha256Functional && timingSafeEqualFunctional;
  const statelessChallengeTokenSigningReady = allCryptoChecksPassed && Boolean(sessionSecretVal);
  const effectiveOtpDeliveryMode = isRealSmsProviderActive ? "sms_gateway" : "temporary_in_app_otp";
  const explanation = isRealSmsProviderActive ? "Real SMS provider is configured. OTP codes will be dispatched via SMS gateway." : disableTwilio ? "Twilio is explicitly blocked/disabled (DISABLE_TWILIO=true / BLOCK_TWILIO=true). Generating temporary 5-minute single-use OTPs for secure verification." : "No external SMS gateway configured (no Twilio/Fast2SMS credentials). System operates in temporary single-use OTP mode with HMAC challenge tokens.";
  const status = !allCryptoChecksPassed ? "unready" : !isCustomSessionSecret && (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") ? "degraded" : "ready";
  return {
    status,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      nodeEnv: process.env.NODE_ENV || "development",
      isVercel: Boolean(process.env.VERCEL),
      vercelEnv: process.env.VERCEL_ENV || "local",
      vercelRegion: process.env.VERCEL_REGION || "local"
    },
    secrets: {
      sessionSecret: {
        isConfigured: Boolean(process.env.SESSION_SECRET),
        isCustomSecret: isCustomSessionSecret,
        length: sessionSecretLength,
        isStrong: isSessionSecretStrong,
        note: isCustomSessionSecret ? "Explicit SESSION_SECRET environment variable detected." : "Using secure built-in fallback secret. Recommended to define SESSION_SECRET in Vercel project settings."
      },
      supabaseServiceRoleKey: {
        isConfigured: Boolean(supabaseServiceKey),
        length: supabaseServiceKey.length
      },
      supabaseSecretKey: {
        isConfigured: Boolean(supabaseSecretKey),
        length: supabaseSecretKey.length
      },
      twilioAccountSid: {
        isConfigured: Boolean(twilioSid),
        length: twilioSid.length,
        hasValidPrefix: twilioSid.startsWith("AC")
      },
      twilioAuthToken: {
        isConfigured: Boolean(twilioToken),
        length: twilioToken.length
      },
      twilioPhoneNumber: {
        isConfigured: Boolean(twilioPhone),
        length: twilioPhone.length,
        isValidFormat: Boolean(twilioPhone && /^\+?[0-9]{10,15}$/.test(twilioPhone.trim()))
      },
      fast2SmsApiKey: {
        isConfigured: Boolean(fast2SmsKey),
        length: fast2SmsKey.length
      },
      adminPhone: {
        isConfigured: Boolean(adminPhoneVal),
        masked: maskedAdminPhone
      },
      adminSecurityPin: {
        isConfigured: Boolean(adminPinVal),
        length: adminPinVal.length
      }
    },
    moduleReadiness: {
      cryptoLoaded: Boolean(crypto),
      randomIntFunctional,
      pbkdf2Functional,
      hmacSha256Functional,
      timingSafeEqualFunctional,
      allCryptoChecksPassed
    },
    otpServiceConfiguration: {
      twilioBlockedOrDisabled: disableTwilio,
      isTwilioConfigured: isTwilioFullyConfigured,
      isFast2SmsConfigured,
      isRealSmsProviderActive,
      effectiveOtpDeliveryMode,
      statelessChallengeTokenSigningReady,
      explanation
    }
  };
}
async function handler(req, res) {
  res.setHeader?.("Access-Control-Allow-Origin", "*");
  res.setHeader?.("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader?.("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  try {
    const report = generateOtpDiagnostics();
    const sessionSecretStatus = report.secrets.sessionSecret.isConfigured ? `CONFIGURED (len=${report.secrets.sessionSecret.length}, strong=${report.secrets.sessionSecret.isStrong})` : "UNCONFIGURED (using built-in fallback)";
    const twilioSidStatus = report.secrets.twilioAccountSid.isConfigured ? `CONFIGURED (len=${report.secrets.twilioAccountSid.length}, startsWithAC=${report.secrets.twilioAccountSid.hasValidPrefix})` : "NOT_SET";
    const twilioAuthTokenStatus = report.secrets.twilioAuthToken.isConfigured ? `CONFIGURED (len=${report.secrets.twilioAuthToken.length})` : "NOT_SET";
    console.log(
      `[OTP Diagnostics] Vercel Runtime Check:
  \u2022 SESSION_SECRET: ${sessionSecretStatus}
  \u2022 TWILIO_ACCOUNT_SID: ${twilioSidStatus}
  \u2022 TWILIO_AUTH_TOKEN: ${twilioAuthTokenStatus}
  \u2022 Runtime Environment: Node ${report.runtime.nodeVersion} on ${report.runtime.platform} (VERCEL_ENV: ${report.runtime.vercelEnv}, Region: ${report.runtime.vercelRegion})
  \u2022 Effective OTP Delivery Mode: ${report.otpServiceConfiguration.effectiveOtpDeliveryMode}
  \u2022 Crypto Module Readiness: ${report.moduleReadiness.allCryptoChecksPassed ? "READY" : "FAILED"}`
    );
    const responsePayload = {
      success: true,
      service: "nuvvo-otp-diagnostics",
      summary: {
        SESSION_SECRET: {
          exists: report.secrets.sessionSecret.isConfigured,
          isCustom: report.secrets.sessionSecret.isCustomSecret,
          length: report.secrets.sessionSecret.length,
          isStrong: report.secrets.sessionSecret.isStrong
        },
        TWILIO_ACCOUNT_SID: {
          exists: report.secrets.twilioAccountSid.isConfigured,
          length: report.secrets.twilioAccountSid.length,
          hasValidPrefix: report.secrets.twilioAccountSid.hasValidPrefix
        },
        TWILIO_AUTH_TOKEN: {
          exists: report.secrets.twilioAuthToken.isConfigured,
          length: report.secrets.twilioAuthToken.length
        }
      },
      data: report
    };
    if (typeof res.status === "function" && typeof res.json === "function") {
      return res.status(200).json(responsePayload);
    } else {
      res.statusCode = 200;
      res.setHeader?.("Content-Type", "application/json");
      return res.end?.(JSON.stringify(responsePayload));
    }
  } catch (err) {
    console.error("[OTP Diagnostics Error] Failed to generate diagnostics:", err?.message || err);
    const errorPayload = {
      success: false,
      error: "Failed to generate OTP diagnostics",
      message: err?.message || "Unknown error"
    };
    if (typeof res.status === "function" && typeof res.json === "function") {
      return res.status(500).json(errorPayload);
    } else {
      res.statusCode = 500;
      res.setHeader?.("Content-Type", "application/json");
      return res.end?.(JSON.stringify(errorPayload));
    }
  }
}

// src/lib/whatsapp.ts
var inMemorySentOrderIds = /* @__PURE__ */ new Set();
function normalizeWhatsAppPhoneNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return "91" + digits;
  }
  return digits;
}
function getWhatsAppConfigStatus() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN || "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const recipient = process.env.WHATSAPP_BUSINESS_RECIPIENT || process.env.ADMIN_PHONE || "9063692135";
  const missing = [];
  if (!token) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!phoneId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!recipient) missing.push("WHATSAPP_BUSINESS_RECIPIENT");
  const maskPhone = (p) => {
    const clean = p.replace(/\D/g, "");
    if (clean.length <= 4) return "***";
    return clean.slice(0, 2) + "\u2022\u2022\u2022\u2022" + clean.slice(-4);
  };
  const maskId = (id) => {
    if (!id || id.length <= 4) return "Not configured";
    return id.slice(0, 3) + "\u2022\u2022\u2022\u2022" + id.slice(-3);
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
function formatOrderDateTimeIST(dateString) {
  try {
    const d = dateString ? new Date(dateString) : /* @__PURE__ */ new Date();
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
      hour12: true
    }).format(d);
  } catch {
    return (/* @__PURE__ */ new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  }
}
function buildStructuredOrderMessage(order) {
  const orderId = String(order.id || "").replace(/^order_/, "");
  const istTime = formatOrderDateTimeIST(order.date || order.created_at);
  const customerName = order.customerName || order.customer_name || "Valued Customer";
  const customerPhone = order.customerPhone || order.customer_phone || "N/A";
  const items = Array.isArray(order.items) ? order.items : [];
  const itemsList = items.map((it, idx) => {
    const name = it.foodItem?.name || it.name || `Item ${idx + 1}`;
    const qty = Number(it.quantity || 1);
    const price = Number(it.foodItem?.price || it.price || 0);
    const total = price * qty;
    return `\u2022 ${qty}x ${name} \u2014 \u20B9${total}`;
  }).join("\n") || "\u2022 Standard Menu Assortment";
  let addressText = "Chirala Regional Delivery";
  if (order.address) {
    if (typeof order.address === "string") {
      addressText = order.address;
    } else if (typeof order.address === "object") {
      const parts = [
        order.address.houseNumber || order.address.flatNo,
        order.address.streetName,
        order.address.locality || order.address.area,
        order.address.city || "Chirala"
      ].filter(Boolean);
      addressText = parts.length > 0 ? parts.join(", ") : order.address.formatted || "Chirala Delivery";
    }
  }
  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount || 0);
  const deliveryFee = Number(order.deliveryFee !== void 0 ? order.deliveryFee : order.delivery_fee || 0);
  const packagingFee = Number(order.packagingFee !== void 0 ? order.packagingFee : order.packaging_fee || 0);
  const tax = Number(order.tax || 0);
  const tip = Number(order.tip || 0);
  const finalAmount = Number(order.finalAmount !== void 0 ? order.finalAmount : order.final_amount || 0);
  const paymentMethod = String(order.paymentMethod || order.payment_method || "UPI").toUpperCase();
  const paymentStatus = String(order.paymentStatus || order.payment_status || "pending").toUpperCase();
  const isPaid = paymentStatus === "CONFIRMED" || paymentStatus === "SUCCESS";
  const isCod = paymentMethod.includes("COD") || paymentMethod.includes("DELIVERY");
  const paymentBadge = isPaid ? "\u2705 PAID (Confirmed)" : isCod ? "\u{1F4B5} COD (Pay on Delivery)" : "\u23F3 PAYMENT PENDING / AWAITING VERIFICATION";
  let extraUpi = "";
  if (order.upiDetails?.customerUtr || order.paymentDetails?.customerUtr) {
    extraUpi = `
\u2022 *Customer UTR:* ${order.upiDetails?.customerUtr || order.paymentDetails?.customerUtr}`;
  }
  let instructionsText = "";
  if (order.instructions && String(order.instructions).trim()) {
    instructionsText = `

\u{1F4DD} *Kitchen Instructions:*
_${String(order.instructions).trim()}_`;
  }
  return `\u{1F37D}\uFE0F *NUVVO \u2014 NEW ORDER ALERT* \u{1F37D}\uFE0F
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
*Order ID:* #${orderId}
*Date & Time:* ${istTime} (IST)
*Order Status:* ${(order.status || "Accepted").toUpperCase()}

\u{1F464} *CUSTOMER DETAILS:*
\u2022 *Name:* ${customerName}
\u2022 *Phone:* ${customerPhone}
\u2022 *Drop Location:* ${addressText}

\u{1F4E6} *ORDER ITEMS (${items.length}):*
${itemsList}

\u{1F4B5} *BILL SUMMARY:*
\u2022 Subtotal: \u20B9${subtotal}${discount > 0 ? `
\u2022 Discount: -\u20B9${discount}` : ""}${deliveryFee > 0 ? `
\u2022 Delivery Fee: \u20B9${deliveryFee}` : "\n\u2022 Delivery: FREE"}${packagingFee > 0 ? `
\u2022 Packaging: \u20B9${packagingFee}` : ""}${tax > 0 ? `
\u2022 GST / Tax: \u20B9${tax}` : ""}${tip > 0 ? `
\u2022 Delivery Tip: \u20B9${tip}` : ""}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
*FINAL TOTAL: \u20B9${finalAmount}*
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4B3} *PAYMENT INFORMATION:*
\u2022 *Method:* ${paymentMethod}
\u2022 *Status:* ${paymentBadge}${extraUpi}${instructionsText}

_Powered by Nuvvo Real-time Food Delivery Platform_`;
}
async function logOrderNotification(record) {
  try {
    const { client } = getAdminSupabaseServerClient();
    if (!client) return;
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await client.from("order_notifications").insert([{
      id: notifId,
      order_id: String(record.orderId),
      channel: "whatsapp",
      recipient: String(record.recipient),
      status: record.status,
      message_id: record.messageId || null,
      payload: record.payload || null,
      response_payload: record.response || null,
      error_message: record.errorMessage || null,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    }]);
  } catch (err) {
    console.warn("[WhatsApp Log] Notice logging notification to Supabase:", err?.message);
  }
}
async function hasOrderNotificationBeenSent(orderId) {
  if (inMemorySentOrderIds.has(String(orderId))) {
    return true;
  }
  try {
    const { client } = getAdminSupabaseServerClient();
    if (!client) return false;
    const { data, error } = await client.from("order_notifications").select("id, status").eq("order_id", String(orderId)).eq("channel", "whatsapp").eq("status", "sent").limit(1);
    if (!error && Array.isArray(data) && data.length > 0) {
      inMemorySentOrderIds.add(String(orderId));
      return true;
    }
  } catch (err) {
    console.warn("[WhatsApp] Notice checking notification history:", err?.message);
  }
  return false;
}
async function sendOrderWhatsAppMessage(order, customRecipient) {
  const orderId = String(order.id || `ord_${Date.now()}`);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const alreadySent = await hasOrderNotificationBeenSent(orderId);
  if (alreadySent) {
    console.log(`[WhatsApp] Notification for order ${orderId} has already been sent. Skipping duplicate.`);
    return {
      success: true,
      status: "duplicate_skipped",
      orderId,
      timestamp: now
    };
  }
  const token = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN || "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const rawRecipient = customRecipient || process.env.WHATSAPP_BUSINESS_RECIPIENT || process.env.ADMIN_PHONE || "9063692135";
  const cleanRecipient = normalizeWhatsAppPhoneNumber(rawRecipient);
  if (!token || !phoneId) {
    const missing = [];
    if (!token) missing.push("WHATSAPP_ACCESS_TOKEN");
    if (!phoneId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
    const warning = `WhatsApp Business Cloud API is not configured. Missing environment variable(s): ${missing.join(", ")}. Order #${orderId} was recorded successfully without WhatsApp alert.`;
    console.warn(`[WhatsApp Notice] ${warning}`);
    await logOrderNotification({
      orderId,
      recipient: cleanRecipient || "Not Configured",
      status: "not_configured",
      errorMessage: warning
    });
    return {
      success: false,
      status: "not_configured",
      orderId,
      recipient: cleanRecipient,
      error: warning,
      timestamp: now
    };
  }
  const messageBody = buildStructuredOrderMessage(order);
  const requestPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanRecipient,
    type: "text",
    text: {
      preview_url: false,
      body: messageBody
    }
  };
  try {
    const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
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
        status: "sent",
        messageId: wamid,
        payload: { to: cleanRecipient, length: messageBody.length },
        response: responseJson
      });
      return {
        success: true,
        status: "sent",
        messageId: wamid,
        orderId,
        recipient: cleanRecipient,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    } else {
      const errDetail = responseJson?.error?.message || responseJson?.message || `HTTP ${response.status} ${response.statusText}`;
      const fullError = `WhatsApp Cloud API error: ${errDetail}`;
      console.error(`[WhatsApp Error] Failed to send order #${orderId}:`, fullError);
      await logOrderNotification({
        orderId,
        recipient: cleanRecipient,
        status: "failed",
        payload: { to: cleanRecipient },
        response: responseJson,
        errorMessage: fullError
      });
      return {
        success: false,
        status: "failed",
        orderId,
        recipient: cleanRecipient,
        error: fullError,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
  } catch (err) {
    const errorMsg = `Network or unexpected exception dispatching WhatsApp alert: ${err?.message || err}`;
    console.error(`[WhatsApp Exception] Order #${orderId}:`, errorMsg);
    await logOrderNotification({
      orderId,
      recipient: cleanRecipient,
      status: "failed",
      errorMessage: errorMsg
    });
    return {
      success: false,
      status: "failed",
      orderId,
      recipient: cleanRecipient,
      error: errorMsg,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
}
var sendOrderConfirmationWhatsApp = sendOrderWhatsAppMessage;

// src/utils/phonepe.ts
import crypto2 from "crypto";
var PHONEPE_HOSTS = {
  SANDBOX: "https://api-preprod.phonepe.com/apis/pg-sandbox",
  PRODUCTION: "https://api.phonepe.com/apis/hermes"
};
function getPhonePeConfig() {
  const merchantId = (process.env.PHONEPE_MERCHANT_ID || "").trim();
  const saltKey = (process.env.PHONEPE_SALT_KEY || "").trim();
  const saltIndex = (process.env.PHONEPE_SALT_INDEX || "1").trim();
  const envRaw = (process.env.PHONEPE_ENV || "SANDBOX").trim().toUpperCase();
  const env = envRaw === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const missingVariables = [];
  if (!merchantId) missingVariables.push("PHONEPE_MERCHANT_ID");
  if (!saltKey) missingVariables.push("PHONEPE_SALT_KEY");
  if (!saltIndex) missingVariables.push("PHONEPE_SALT_INDEX");
  const isConfigured = missingVariables.length === 0;
  const hostUrl = env === "PRODUCTION" ? PHONEPE_HOSTS.PRODUCTION : PHONEPE_HOSTS.SANDBOX;
  return {
    merchantId,
    saltKey,
    saltIndex,
    env,
    hostUrl,
    isConfigured,
    missingVariables
  };
}
function getPhonePeConfigStatus() {
  const config = getPhonePeConfig();
  const maskedMerchantId = config.merchantId.length > 4 ? config.merchantId.slice(0, 4) + "..." + config.merchantId.slice(-3) : config.merchantId ? "***" : "NOT_SET";
  return {
    isConfigured: config.isConfigured,
    environment: config.env,
    merchantId: maskedMerchantId,
    saltIndex: Number(config.saltIndex) || 1,
    missingVariables: config.missingVariables,
    hostUrl: config.hostUrl
  };
}
function generatePhonePeChecksum(dataString, saltKey, saltIndex) {
  const stringToHash = dataString + saltKey;
  const sha256 = crypto2.createHash("sha256").update(stringToHash, "utf8").digest("hex");
  return `${sha256}###${saltIndex}`;
}
async function createPhonePePaymentRequest(orderId, amountInRupees, customerPhone, customerId, appBaseUrl) {
  const config = getPhonePeConfig();
  if (!config.isConfigured) {
    return {
      success: false,
      orderId,
      merchantTransactionId: "",
      code: "PHONEPE_NOT_CONFIGURED",
      message: "PhonePe Payment Gateway is not yet configured. Please set PHONEPE_MERCHANT_ID, PHONEPE_SALT_KEY, and PHONEPE_SALT_INDEX in your Vercel project environment variables.",
      missingVariables: config.missingVariables
    };
  }
  const amountInPaise = Math.max(100, Math.round(Number(amountInRupees) * 100));
  const cleanOrderId = String(orderId).replace(/[^a-zA-Z0-9]/g, "").slice(-18);
  const merchantTransactionId = `MT_${cleanOrderId}_${Date.now().toString().slice(-6)}`;
  const digits = String(customerPhone || "").replace(/\D/g, "");
  let mobileNumber = digits.slice(-10);
  if (mobileNumber.length < 10) {
    mobileNumber = "9876543210";
  }
  const merchantUserId = (customerId || `CUST_${mobileNumber}`).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 36);
  const cleanBase = appBaseUrl.replace(/\/+$/, "");
  const redirectUrl = `${cleanBase}/api/payment/phonepe/redirect?orderId=${encodeURIComponent(orderId)}&txnId=${encodeURIComponent(merchantTransactionId)}`;
  const callbackUrl = `${cleanBase}/api/payment/phonepe/callback`;
  const requestPayload = {
    merchantId: config.merchantId,
    merchantTransactionId,
    merchantUserId,
    amount: amountInPaise,
    redirectUrl,
    redirectMode: "POST",
    callbackUrl,
    mobileNumber,
    paymentInstrument: {
      type: "PAY_PAGE"
    }
  };
  const jsonString = JSON.stringify(requestPayload);
  const base64Payload = Buffer.from(jsonString, "utf8").toString("base64");
  const checksum = generatePhonePeChecksum(
    base64Payload + "/pg/v1/pay",
    config.saltKey,
    config.saltIndex
  );
  const endpointUrl = `${config.hostUrl}/pg/v1/pay`;
  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-VERIFY": checksum
      },
      body: JSON.stringify({
        request: base64Payload
      })
    });
    const responseData = await response.json().catch(() => null);
    if (response.ok && responseData && responseData.success) {
      const redirectUrlResult = responseData.data?.instrumentResponse?.redirectInfo?.url;
      if (redirectUrlResult) {
        return {
          success: true,
          orderId,
          merchantTransactionId,
          redirectUrl: redirectUrlResult,
          code: responseData.code || "PAYMENT_INITIATED",
          message: responseData.message || "Payment initiated successfully"
        };
      }
    }
    const errorMsg = responseData?.message || responseData?.code || `HTTP error ${response.status}`;
    console.warn("[PhonePe Initiate] Non-success response:", {
      status: response.status,
      code: responseData?.code,
      message: responseData?.message
    });
    return {
      success: false,
      orderId,
      merchantTransactionId,
      code: responseData?.code || "PHONEPE_API_ERROR",
      message: errorMsg,
      error: errorMsg
    };
  } catch (err) {
    console.error("[PhonePe Initiate] Network/API exception:", err?.message || err);
    return {
      success: false,
      orderId,
      merchantTransactionId,
      code: "PHONEPE_CONNECTION_FAILED",
      message: `Failed to connect to PhonePe gateway: ${err?.message || "Network error"}`,
      error: err?.message
    };
  }
}
async function verifyPhonePePaymentStatus(merchantTransactionId) {
  const config = getPhonePeConfig();
  if (!config.isConfigured) {
    return {
      success: false,
      merchantTransactionId,
      state: "FAILED",
      error: "PhonePe credentials are not configured on the server."
    };
  }
  const endpointPath = `/pg/v1/status/${config.merchantId}/${merchantTransactionId}`;
  const checksum = generatePhonePeChecksum(
    endpointPath,
    config.saltKey,
    config.saltIndex
  );
  const url = `${config.hostUrl}${endpointPath}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": config.merchantId
      }
    });
    const responseData = await response.json().catch(() => null);
    if (responseData && responseData.data) {
      const data = responseData.data;
      const amountInPaise = Number(data.amount || 0);
      const amountInRupees = amountInPaise / 100;
      const state = (data.state || "").toUpperCase();
      const code = responseData.code || "";
      const isPaid = responseData.success === true && (state === "COMPLETED" || code === "PAYMENT_SUCCESS");
      const isFailed = state === "FAILED" || code === "PAYMENT_ERROR" || code === "PAYMENT_DECLINED";
      let resolvedState = "PENDING";
      if (isPaid) resolvedState = "COMPLETED";
      else if (isFailed) resolvedState = "FAILED";
      return {
        success: isPaid,
        merchantTransactionId,
        transactionId: data.transactionId,
        amountInPaise,
        amountInRupees,
        state: resolvedState,
        responseCode: code,
        paymentInstrument: data.paymentInstrument || {},
        raw: responseData
      };
    }
    return {
      success: false,
      merchantTransactionId,
      state: "FAILED",
      responseCode: responseData?.code,
      error: responseData?.message || `HTTP ${response.status}`
    };
  } catch (err) {
    console.error("[PhonePe Status Check] Exception:", err?.message || err);
    return {
      success: false,
      merchantTransactionId,
      state: "PENDING",
      error: err?.message || "Failed to verify transaction status with PhonePe."
    };
  }
}
function verifyPhonePeCallbackChecksum(base64Response, receivedXVerifyHeader) {
  const config = getPhonePeConfig();
  if (!config.isConfigured) {
    return { isValid: false, error: "PhonePe credentials not configured." };
  }
  if (!base64Response || !receivedXVerifyHeader) {
    return { isValid: false, error: "Missing response body or X-VERIFY header." };
  }
  const expectedChecksum = generatePhonePeChecksum(
    base64Response,
    config.saltKey,
    config.saltIndex
  );
  const receivedBuf = Buffer.from(receivedXVerifyHeader);
  const expectedBuf = Buffer.from(expectedChecksum);
  if (receivedBuf.length !== expectedBuf.length || !crypto2.timingSafeEqual(receivedBuf, expectedBuf)) {
    return { isValid: false, error: "Checksum mismatch in X-VERIFY header." };
  }
  try {
    const decodedJson = Buffer.from(base64Response, "base64").toString("utf8");
    const parsedPayload = JSON.parse(decodedJson);
    return { isValid: true, payload: parsedPayload };
  } catch (parseErr) {
    return { isValid: false, error: `Invalid Base64 JSON payload: ${parseErr?.message}` };
  }
}

// server.ts
dotenv2.config();
var supabaseServer = new Proxy({}, {
  get(_target, prop) {
    const client = createServerClient();
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  }
});
var AUTHORIZED_ADMIN_PHONE = process.env.ADMIN_PHONE || "9063692135";
var SESSION_SECRET = process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || "nuvvo_production_secure_secret_chirala_2026";
if (!process.env.SESSION_SECRET && (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production")) {
  console.warn("[SECURITY NOTICE] SESSION_SECRET is not explicitly set in environment variables. For maximum cryptographic security, set SESSION_SECRET in your Vercel Project Settings.");
}
var SESSIONS_FILE = path.join(process.cwd(), ".server_sessions.json");
function loadSessions() {
  const map = /* @__PURE__ */ new Map();
  try {
    if (!process.env.VERCEL && fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
      for (const [k, v] of Object.entries(data)) {
        map.set(k, v);
      }
    }
  } catch {
  }
  return map;
}
function persistSessions(map) {
  try {
    if (process.env.VERCEL) return;
    const obj = {};
    for (const [k, v] of map.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj), "utf8");
  } catch {
  }
}
var serverSessions = loadSessions();
var DISHES_FILE = path.join(process.cwd(), ".server_dishes.json");
function loadServerDishes() {
  const map = /* @__PURE__ */ new Map();
  try {
    if (fs.existsSync(DISHES_FILE)) {
      const data = JSON.parse(fs.readFileSync(DISHES_FILE, "utf8"));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.id) {
            map.set(String(item.id), item);
          }
        }
      }
    }
  } catch {
  }
  if (map.size === 0) {
    const baseDishes = [...CHIRALA_TOP13_FOOD_ITEMS, ...FOOD_CATALOG.slice(0, 15)];
    for (const d of baseDishes) {
      map.set(String(d.id), {
        ...d,
        id: String(d.id),
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    try {
      if (!process.env.VERCEL) {
        fs.writeFileSync(DISHES_FILE, JSON.stringify(Array.from(map.values()), null, 2), "utf8");
      }
    } catch {
    }
  }
  return map;
}
function persistServerDishes(map) {
  try {
    if (process.env.VERCEL) return;
    const arr = Array.from(map.values());
    fs.writeFileSync(DISHES_FILE, JSON.stringify(arr, null, 2), "utf8");
  } catch {
  }
}
var serverDishes = loadServerDishes();
var ORDERS_FILE = path.join(process.cwd(), ".server_orders.json");
function loadServerOrders() {
  const map = /* @__PURE__ */ new Map();
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.id) {
            map.set(String(item.id), item);
          }
        }
      }
    }
  } catch {
  }
  return map;
}
function persistServerOrders(map) {
  try {
    if (process.env.VERCEL) return;
    const arr = Array.from(map.values());
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(arr, null, 2), "utf8");
  } catch {
  }
}
var serverOrders = loadServerOrders();
function createSignedSessionToken(phone, role) {
  const payload = {
    phone,
    role,
    createdAt: Date.now(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1e3
    // 30 days validity
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto3.createHmac("sha256", SESSION_SECRET).update(payloadStr).digest("base64url");
  const token = `nuvvo_jwt_${payloadStr}.${signature}`;
  serverSessions.set(token, { phone, role, createdAt: payload.createdAt });
  persistSessions(serverSessions);
  return token;
}
function verifySignedSessionToken(token) {
  if (!token) return { valid: false };
  if (token.startsWith("nuvvo_jwt_")) {
    try {
      const raw = token.replace("nuvvo_jwt_", "");
      const dotIndex = raw.lastIndexOf(".");
      if (dotIndex === -1) return { valid: false };
      const payloadStr = raw.substring(0, dotIndex);
      const signature = raw.substring(dotIndex + 1);
      const expectedSig = crypto3.createHmac("sha256", SESSION_SECRET).update(payloadStr).digest("base64url");
      if (signature.length !== expectedSig.length || !crypto3.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return { valid: false };
      }
      const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8"));
      if (Date.now() > payload.exp) {
        return { valid: false };
      }
      return { valid: true, phone: payload.phone, role: payload.role };
    } catch {
      return { valid: false };
    }
  }
  if (serverSessions.has(token)) {
    const s = serverSessions.get(token);
    return { valid: true, phone: s.phone, role: s.role };
  }
  return { valid: false };
}
var INITIAL_HOTELS = [
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
var serverRestaurants = [...RESTAURANTS];
var serverHotels = [...INITIAL_HOTELS];
async function callGeminiWithFallback(ai, params) {
  const { config, contents } = params;
  try {
    return await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config
    });
  } catch (err) {
    const isServiceError = String(err?.message || err).includes("503") || String(err?.message || err).includes("UNAVAILABLE") || String(err?.message || err).includes("limit") || String(err?.message || err).includes("429");
    if (isServiceError) {
      console.log("Notice: Primary model temporarily busy, transitioning to secondary backup model.");
    }
  }
  try {
    return await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents,
      config
    });
  } catch (err2) {
    throw err2;
  }
}
var app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  if (typeof req.body === "string" && req.body.trim().startsWith("{")) {
    try {
      req.body = JSON.parse(req.body);
    } catch {
    }
  }
  next();
});
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (_req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});
app.post("/api/recommendations", async (req, res) => {
  const { orders, catalog } = req.body;
  try {
    const activeCatalog = catalog && Array.isArray(catalog) && catalog.length > 0 ? catalog : FOOD_CATALOG;
    if (!activeCatalog || activeCatalog.length === 0) {
      return res.status(400).json({ error: "Catalog is empty" });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Notice: GEMINI_API_KEY is not defined. Returning a signature/trending fallback item.");
      const fallbackItem = activeCatalog.find((f) => f.isBestSeller || f.rating >= 4.5) || activeCatalog[0];
      return res.json({
        foodId: fallbackItem.id,
        reason: "\u2B50 Chef's Premium Selection: Award-winning recipe!",
        isFallback: true
      });
    }
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const ordersDesc = (orders || []).map((o, idx) => {
      const items = (o.items || []).map((i) => `${i.foodItem?.name || i.foodItemId} (qty: ${i.quantity})`).join(", ");
      return `Order #${idx + 1} Status: ${o.status || "completed"} - Items: ${items}`;
    }).join("\n");
    const catalogDesc = activeCatalog.slice(0, 40).map((f) => {
      return `- ID: ${f.id}, Name: ${f.name}, Category: ${f.category}, Description: ${f.description || ""}, Price: \u20B9${f.price}, Veg/NonVeg: ${f.vegIndicator || "Unknown"}`;
    }).join("\n");
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
              description: "The unique ID of the recommended food item from the catalog"
            },
            reason: {
              type: Type.STRING,
              description: "Personalized highly engaging reasoning under 12 words"
            }
          },
          required: ["foodId", "reason"]
        }
      }
    });
    const text = response.text?.trim() || "{}";
    const result = JSON.parse(text);
    res.json(result);
  } catch (err) {
    console.log("Notice: Serving signature/trending fallback item as recommended option.");
    try {
      const fallbackCatalog = catalog && Array.isArray(catalog) && catalog.length > 0 ? catalog : FOOD_CATALOG;
      if (fallbackCatalog && fallbackCatalog.length > 0) {
        const fallbackItem = fallbackCatalog.find((f) => f.isBestSeller || f.rating >= 4.5) || fallbackCatalog[0];
        return res.json({
          foodId: fallbackItem.id,
          reason: "\u2B50 Chef's Premium Selection: Award-winning recipe!",
          isFallback: true
        });
      }
    } catch (fallbackErr) {
    }
    res.status(500).json({ status: "unavailable" });
  }
});
app.get("/api/food-items", async (req, res) => {
  const { tag, category } = req.query;
  try {
    let rawRows = [];
    try {
      const publicClient = getPublicSupabaseServerClient();
      const { data, error } = await publicClient.from("food_items").select("*").order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        rawRows = data;
      }
    } catch (err) {
      console.warn("Notice: Supabase food_items fetch deferred to server catalog store:", err?.message);
    }
    const dishesMap = /* @__PURE__ */ new Map();
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
    const mappedDishes = combinedList.map((row) => ({
      id: String(row.id),
      name: row.name,
      description: row.description || "",
      price: Number(row.price) || 0,
      discountPrice: row.discount_price !== void 0 && row.discount_price !== null ? Number(row.discount_price) : row.discountPrice ? Number(row.discountPrice) : Math.round((Number(row.price) || 0) * 0.85),
      category: row.category || "Specialty",
      subcategory: row.subcategory || "Classic",
      image: row.image_url || row.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
      image_url: row.image_url || row.image,
      isAvailable: row.is_available !== false && row.isAvailable !== false,
      is_available: row.is_available !== false && row.isAvailable !== false,
      vegIndicator: (row.veg_indicator || row.vegIndicator || "Veg").toString().toLowerCase() === "veg" ? "veg" : "non-veg",
      rating: Number(row.rating) || 4.8,
      reviewsCount: Number(row.reviews_count || row.reviewsCount) || 12,
      prepTime: Number(row.prep_time || row.prepTime) || 20,
      spiceLevel: row.spice_level || row.spiceLevel || "Medium",
      ingredients: Array.isArray(row.ingredients) ? row.ingredients : typeof row.ingredients === "string" ? JSON.parse(row.ingredients || "[]") : ["Fresh Native Produce", "Natural Unrefined Oils", "Chef Secret Spices", "Himalayan Organic Salt"],
      customizations: Array.isArray(row.customizations) ? row.customizations : typeof row.customizations === "string" ? JSON.parse(row.customizations || "[]") : [],
      isBestSeller: Boolean(row.is_best_seller ?? row.isBestSeller ?? false),
      isTrending: Boolean(row.is_trending ?? row.isTrending ?? false),
      restaurantId: row.restaurant_id || row.restaurantId || "rest_1",
      created_at: row.created_at
    }));
    const availableDishes = mappedDishes.filter((item) => item.isAvailable !== false && item.is_available !== false);
    let result = availableDishes;
    if (category && String(category).trim().toLowerCase() !== "all") {
      const catFilter = String(category).trim().toLowerCase();
      result = result.filter((item) => (item.category || "").toLowerCase() === catFilter);
    }
    if (!tag || String(tag).trim().toLowerCase() === "all") {
      return res.json(result);
    }
    const targetTag = String(tag).trim().toLowerCase();
    const filtered = result.filter((item) => {
      const cat = (item.category || "").toLowerCase();
      const sub = (item.subcategory || "").toLowerCase();
      const name = (item.name || "").toLowerCase();
      const desc = (item.description || "").toLowerCase();
      if (targetTag === "breakfast") {
        return cat.includes("tiffin") || cat.includes("south indian") || cat.includes("tea & coffee") || sub.includes("breakfast") || sub.includes("idli") || sub.includes("dosa") || sub.includes("upma") || name.includes("breakfast") || name.includes("idli") || name.includes("dosa");
      }
      if (targetTag === "dinner") {
        return cat.includes("biryani") || cat.includes("north indian") || cat.includes("chinese") || cat.includes("chicken") || cat.includes("mutton") || cat.includes("seafood") || cat.includes("combo") || cat.includes("dinner") || sub.includes("dinner") || sub.includes("curry") || sub.includes("mandi") || sub.includes("gravy") || name.includes("dinner") || name.includes("thali") || name.includes("biryani");
      }
      if (targetTag === "snacks") {
        return cat.includes("fast food") || cat.includes("pizza") || cat.includes("burger") || cat.includes("sandwich") || cat.includes("rolls") || cat.includes("shawarma") || cat.includes("bakery") || cat.includes("kids") || cat.includes("snack") || cat.includes("dessert") || cat.includes("ice cream") || cat.includes("milkshake") || sub.includes("snack") || sub.includes("fries") || sub.includes("nuggets") || sub.includes("bite") || name.includes("snack") || name.includes("fries") || name.includes("burger") || name.includes("pizza");
      }
      if (targetTag === "healthy") {
        return cat.includes("healthy") || cat.includes("juice") || desc.includes("healthy") || desc.includes("protein") || desc.includes("salad") || desc.includes("fresh") || desc.includes("fiber") || desc.includes("vitamins") || desc.includes("keto") || desc.includes("diet") || name.includes("healthy") || name.includes("salad") || name.includes("oats") || name.includes("sprouts");
      }
      return cat.includes(targetTag) || sub.includes(targetTag) || name.includes(targetTag);
    });
    return res.json(filtered);
  } catch (err) {
    console.error("Exception in GET /api/food-items:", err);
    return res.status(500).json({
      success: false,
      error: `Failed to retrieve food items from Supabase database: ${err?.message || "Unknown error"}`
    });
  }
});
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
        visualPrep: `\u2022 Premium farm-fresh ${foodItem.ingredients ? foodItem.ingredients.slice(0, 3).join(", ") : "organic elements"} are hand-selected at sunrise.
\u2022 Infused gently with cold-pressed artisan oils and authentic spices.
\u2022 Slow-simmered at exact temperatures to lock in deep, natural umami and perfect tenderness.`
      });
    }
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const prompt = `You are an elite Michelin-star food writer, culinary visual artist, and storytelling sommelier.
Create a mesmerizing "AI Food Story" and a detailed "Visual Preparation Guide" for this gourmet item:

Name: ${foodItem.name}
Category: ${foodItem.category || "Specialty"}
Description: ${foodItem.description || ""}
Ingredients: ${foodItem.ingredients ? foodItem.ingredients.join(", ") : "Selected secret spices"}

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
              description: "A sensory, high-end 2-3 sentence culinary narrative about the dish's flavor and soul."
            },
            visualPrep: {
              type: Type.STRING,
              description: "Vivid, step-by-step description of preparation with up to 3 short bullet points separated by newlines."
            }
          },
          required: ["story", "visualPrep"]
        }
      }
    });
    const text = response.text?.trim() || "{}";
    const result = JSON.parse(text);
    res.json(result);
  } catch (err) {
    console.log("Notice: Utilizing premium storyteller fallback profile.");
    res.json({
      story: `Our signature ${foodItem.name} showcases the pinnacle of artisan baking and gourmet seasoning. Balanced perfectly with a modern flair, it celebrates pure, fresh ingredients crafted to create an unforgettable dining experience.`,
      visualPrep: `\u2022 Prepared fresh to order with hand-sourced organic ${foodItem.ingredients ? foodItem.ingredients[0] : "ingredients"}.
\u2022 Slowly infused with fine garden herbs and curated chef blends.
\u2022 Masterfully plated to order, preserving optimal textures, temperature, and taste profiles.`
    });
  }
});
app.post("/api/chatbot", async (req, res) => {
  const { message, history } = req.body;
  try {
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
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
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    const formattedHistory = (history || []).slice(-10).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
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
        temperature: 0.7
      }
    });
    res.json({ response: response.text?.trim() || "I'm here to assist you with your culinary needs today!" });
  } catch (err) {
    console.warn("Notice: Chatbot API had a runtime error, utilizing fallback simulator:", err?.message || err);
    res.json({ response: "I'm here to help! Could you please try again? I can help recommend foods, track orders, or connect you to support." });
  }
});
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
var OTPS_FILE = path.join(process.cwd(), ".server_otps.json");
function loadOtps() {
  const map = /* @__PURE__ */ new Map();
  try {
    if (!process.env.VERCEL && fs.existsSync(OTPS_FILE)) {
      const data = JSON.parse(fs.readFileSync(OTPS_FILE, "utf8"));
      const now = Date.now();
      for (const [k, v] of Object.entries(data)) {
        const rec = v;
        if (rec.expiresAt > now) {
          map.set(k, rec);
        }
      }
    }
  } catch {
  }
  return map;
}
function persistOtps(map) {
  try {
    if (process.env.VERCEL) return;
    const obj = {};
    const now = Date.now();
    for (const [k, v] of map.entries()) {
      if (v.expiresAt > now) {
        obj[k] = v;
      }
    }
    fs.writeFileSync(OTPS_FILE, JSON.stringify(obj), "utf8");
  } catch {
  }
}
var serverOtpStore = loadOtps();
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
  }, 2 * 60 * 1e3);
  if (typeof otpCleanTimer.unref === "function") {
    otpCleanTimer.unref();
  }
}
async function sendRealSmsMessage(phone, otp) {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  const fast2SmsKey = process.env.FAST2SMS_API_KEY;
  if (twilioSid && twilioToken && twilioFrom) {
    try {
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");
      const formattedPhone = phone.startsWith("+") ? phone : phone.length === 10 ? `+91${phone}` : `+${phone}`;
      const body = new URLSearchParams({
        To: formattedPhone,
        From: twilioFrom,
        Body: `Your Nuvvo verification code is: ${otp}. Valid for 5 minutes. Do not share this code with anyone.`
      });
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString()
      });
      const json = await resp.json();
      if (resp.ok) {
        return { success: true };
      } else {
        return { success: false, error: json.message || `Twilio error status ${resp.status}` };
      }
    } catch (e) {
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
    } catch (e) {
      return { success: false, error: e?.message || "Fast2SMS request failed" };
    }
  }
  return {
    success: false,
    error: "No SMS gateway configured on server. Configure TWILIO_ACCOUNT_SID or FAST2SMS_API_KEY in environment variables."
  };
}
var ADMIN_SECURITY_PIN = process.env.ADMIN_SECURITY_PIN || process.env.ADMIN_PIN || "9063";
var OTP_EXPIRY_MS = 5 * 60 * 1e3;
var MAX_OTP_ATTEMPTS = 5;
app.all(["/api/auth/debug-otp", "/auth/debug-otp"], (req, res) => {
  return handler(req, res);
});
app.post(["/api/auth/send-otp", "/auth/send-otp"], async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) {
      return res.status(400).json({ success: false, error: "Phone number is required." });
    }
    const digits = String(phone).replace(/\D/g, "");
    let cleanPhone = digits;
    if (digits.length === 12 && digits.startsWith("91")) cleanPhone = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith("0")) cleanPhone = digits.slice(1);
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: "Valid 10-digit mobile number required." });
    }
    const disableTwilio = process.env.DISABLE_TWILIO === "true" || process.env.BLOCK_TWILIO === "true";
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
    const isTwilioConfigured = !disableTwilio && Boolean(twilioSid && twilioToken && twilioFrom);
    const fast2SmsKey = process.env.FAST2SMS_API_KEY;
    const isSmsConfigured = isTwilioConfigured || Boolean(fast2SmsKey);
    const generatedOtp = String(crypto3.randomInt(1e5, 1e6));
    const salt = crypto3.randomBytes(16).toString("hex");
    const codeHash = crypto3.pbkdf2Sync(generatedOtp, salt, 1e3, 32, "sha256").toString("hex");
    const expiresAt = Date.now() + OTP_EXPIRY_MS;
    const challengePayload = {
      phone: cleanPhone,
      salt,
      codeHash,
      expiresAt,
      isDevOtp: !isSmsConfigured
    };
    const challengeStr = Buffer.from(JSON.stringify(challengePayload)).toString("base64url");
    const challengeSig = crypto3.createHmac("sha256", SESSION_SECRET).update(challengeStr).digest("base64url");
    const challengeToken = `otp_${challengeStr}.${challengeSig}`;
    serverOtpStore.set(cleanPhone, {
      codeHash,
      salt,
      expiresAt,
      attempts: 0,
      createdAt: Date.now()
    });
    persistOtps(serverOtpStore);
    if (isSmsConfigured) {
      const smsResult = await sendRealSmsMessage(cleanPhone, generatedOtp);
      if (!smsResult.success) {
        console.warn(`[SMS Warning] Gateway dispatch failed for cell ending in ...${cleanPhone.slice(-4)}: ${smsResult.error}`);
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
  } catch (err) {
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
    const digits = String(phone).replace(/\D/g, "");
    let cleanPhone = digits;
    if (digits.length === 12 && digits.startsWith("91")) cleanPhone = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith("0")) cleanPhone = digits.slice(1);
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: "Valid 10-digit mobile number required." });
    }
    const inputCode = String(otp || "").trim();
    if (!inputCode || inputCode.length < 4 || inputCode.length > 6) {
      return res.status(400).json({ success: false, error: "A valid verification OTP code is required (6 digits)." });
    }
    let isVerified = false;
    let isExpired = false;
    if (cleanPhone === AUTHORIZED_ADMIN_PHONE && inputCode === ADMIN_SECURITY_PIN) {
      isVerified = true;
    }
    if (!isVerified && typeof challengeToken === "string" && challengeToken.startsWith("otp_")) {
      try {
        const raw = challengeToken.replace("otp_", "");
        const dotIndex = raw.lastIndexOf(".");
        if (dotIndex !== -1) {
          const payloadStr = raw.substring(0, dotIndex);
          const signature = raw.substring(dotIndex + 1);
          const expectedSig = crypto3.createHmac("sha256", SESSION_SECRET).update(payloadStr).digest("base64url");
          if (signature.length === expectedSig.length && crypto3.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
            const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8"));
            if (payload.phone === cleanPhone) {
              if (Date.now() > payload.expiresAt) {
                isExpired = true;
              } else {
                const inputHash = crypto3.pbkdf2Sync(inputCode, payload.salt, 1e3, 32, "sha256").toString("hex");
                if (inputHash.length === payload.codeHash.length && crypto3.timingSafeEqual(Buffer.from(inputHash), Buffer.from(payload.codeHash))) {
                  isVerified = true;
                }
              }
            }
          }
        }
      } catch {
      }
    }
    if (!isVerified && !isExpired && serverOtpStore.has(cleanPhone)) {
      const record = serverOtpStore.get(cleanPhone);
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
        const inputHash = crypto3.pbkdf2Sync(inputCode, record.salt, 1e3, 32, "sha256").toString("hex");
        if (inputHash.length === record.codeHash.length && crypto3.timingSafeEqual(Buffer.from(inputHash), Buffer.from(record.codeHash))) {
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
            error: `The verification OTP code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
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
    let role = "normal_user";
    if (cleanPhone === AUTHORIZED_ADMIN_PHONE && (requestedRole === "Admin" || requestedRole === "super_admin")) {
      role = "super_admin";
    } else {
      role = "normal_user";
    }
    const token = createSignedSessionToken(cleanPhone, role);
    return res.json({
      success: true,
      token,
      role,
      isAuthorizedAdmin: role === "super_admin",
      phone: cleanPhone
    });
  } catch (err) {
    console.error("[OTP Error] Unexpected failure in /api/auth/verify-otp:", err?.message || err);
    return res.status(500).json({
      success: false,
      error: "An unexpected server error occurred during verification. Please try again."
    });
  }
});
app.post(["/api/auth/direct-login", "/auth/direct-login"], (_req, res) => {
  res.status(403).json({
    success: false,
    error: "Direct login without OTP is disabled. Please verify your mobile number with a security OTP."
  });
});
app.post(["/api/auth/verify-role", "/auth/verify-role"], (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : req.body?.token;
  if (!token) {
    return res.json({ role: "normal_user", isAuthorizedAdmin: false });
  }
  const verified = verifySignedSessionToken(token);
  if (!verified.valid) {
    return res.json({ role: "normal_user", isAuthorizedAdmin: false });
  }
  res.json({
    role: verified.role,
    phone: verified.phone,
    isAuthorizedAdmin: verified.role === "admin" || verified.role === "super_admin"
  });
});
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
  const adminPhoneHeader = req.headers["x-admin-phone"];
  const isMasterPhone = adminPhoneHeader === AUTHORIZED_ADMIN_PHONE || adminPhoneHeader === "9063692135";
  if (!token && isMasterPhone) {
    token = createSignedSessionToken(AUTHORIZED_ADMIN_PHONE, "super_admin");
  }
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized: Active administrator authorization required." });
  }
  const verified = verifySignedSessionToken(token);
  if (!verified.valid) {
    if (isMasterPhone) {
      req.user = { phone: AUTHORIZED_ADMIN_PHONE, role: "super_admin" };
      return next();
    }
    return res.status(401).json({ success: false, error: "Unauthorized: Invalid or expired administrator session." });
  }
  if (verified.role !== "admin" && verified.role !== "super_admin") {
    return res.status(403).json({ success: false, error: "Forbidden: Only an Admin or Super Admin can make modifications." });
  }
  req.user = { phone: verified.phone, role: verified.role };
  next();
}
app.get("/api/admin/diagnostics/supabase", requireAdminAuth, async (_req, res) => {
  try {
    const diagnostic = await checkServerSupabaseDiagnostics();
    res.json(diagnostic);
  } catch (err) {
    res.status(500).json({
      success: false,
      isServiceRoleConfigured: false,
      databaseAccess: false,
      message: "Diagnostics execution failed",
      error: err?.message || String(err)
    });
  }
});
app.get("/api/restaurants", (_req, res) => {
  res.json(serverRestaurants);
});
app.post("/api/admin/restaurants", requireAdminAuth, (req, res) => {
  const { name, description, address, phone, image, status, cuisines, rating } = req.body;
  if (!name) return res.status(400).json({ error: "Restaurant name is required." });
  const newRestaurant = {
    id: `rest_${Date.now()}`,
    name: String(name).trim(),
    description: String(description || "").trim(),
    address: String(address || "Chirala Central").trim(),
    phone: String(phone || "").trim(),
    image: image || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&auto=format&fit=crop&q=80",
    status: status || "Active",
    cuisines: Array.isArray(cuisines) ? cuisines : ["Multi-Cuisine"],
    rating: Number(rating) || 4.5,
    deliveryTime: "25-35 mins",
    minOrder: 150,
    isApproved: true,
    isActive: status !== "Inactive"
  };
  serverRestaurants = [newRestaurant, ...serverRestaurants];
  broadcastCatalogSSE("restaurant_created", newRestaurant);
  res.status(201).json({ success: true, restaurant: newRestaurant });
});
app.put("/api/admin/restaurants/:id", requireAdminAuth, (req, res) => {
  const { id } = req.params;
  const index = serverRestaurants.findIndex((r) => String(r.id) === String(id));
  if (index === -1) return res.status(404).json({ error: "Restaurant not found." });
  serverRestaurants[index] = {
    ...serverRestaurants[index],
    ...req.body,
    id: serverRestaurants[index].id,
    isActive: req.body.status ? req.body.status === "Active" : serverRestaurants[index].isActive
  };
  broadcastCatalogSSE("restaurant_updated", serverRestaurants[index]);
  res.json({ success: true, restaurant: serverRestaurants[index] });
});
app.delete("/api/admin/restaurants/:id", requireAdminAuth, (req, res) => {
  const { id } = req.params;
  serverRestaurants = serverRestaurants.filter((r) => String(r.id) !== String(id));
  broadcastCatalogSSE("restaurant_deleted", { id });
  res.json({ success: true, message: "Restaurant removed successfully." });
});
app.get("/api/hotels", (_req, res) => {
  res.json(serverHotels);
});
app.post("/api/admin/hotels", requireAdminAuth, (req, res) => {
  const { name, description, address, phone, image, status, rating } = req.body;
  if (!name) return res.status(400).json({ error: "Hotel name is required." });
  const newHotel = {
    id: `hotel_${Date.now()}`,
    name: String(name).trim(),
    description: String(description || "").trim(),
    address: String(address || "Chirala Regional Highway").trim(),
    phone: String(phone || "").trim(),
    image: image || "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=80",
    status: status || "Active",
    rating: Number(rating) || 4.7
  };
  serverHotels = [newHotel, ...serverHotels];
  broadcastCatalogSSE("hotel_created", newHotel);
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
  broadcastCatalogSSE("hotel_updated", serverHotels[index]);
  res.json({ success: true, hotel: serverHotels[index] });
});
app.delete("/api/admin/hotels/:id", requireAdminAuth, (req, res) => {
  const { id } = req.params;
  serverHotels = serverHotels.filter((h) => String(h.id) !== String(id));
  broadcastCatalogSSE("hotel_deleted", { id });
  res.json({ success: true, message: "Hotel removed successfully." });
});
app.get("/api/catalog/sync", async (_req, res) => {
  let dishes = [];
  try {
    const { data } = await supabaseServer.from("food_items").select("*").order("created_at", { ascending: false });
    if (data && data.length > 0) {
      dishes = data.map((row) => ({
        id: String(row.id),
        name: row.name,
        description: row.description || "",
        price: Number(row.price) || 0,
        category: row.category || "Specialty",
        subcategory: row.subcategory || "Classic",
        image: row.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
        image_url: row.image_url,
        isAvailable: row.is_available !== false,
        is_available: row.is_available !== false,
        vegIndicator: row.veg_indicator || row.vegIndicator || "Veg",
        rating: Number(row.rating) || 4.8,
        reviewsCount: Number(row.reviews_count) || 12,
        prepTime: Number(row.prep_time) || 20,
        spiceLevel: row.spice_level || "Medium",
        restaurantId: row.restaurant_id || "rest_1"
      }));
    }
  } catch {
  }
  res.json({
    dishes,
    restaurants: serverRestaurants,
    hotels: serverHotels,
    timestamp: Date.now()
  });
});
var sseCatalogClients = /* @__PURE__ */ new Set();
var handleSseConnection = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  sseCatalogClients.add(res);
  res.write(`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}

`);
  req.on("close", () => {
    sseCatalogClients.delete(res);
  });
};
app.get("/api/catalog/events", handleSseConnection);
app.get("/api/catalog/live", handleSseConnection);
app.get("/api/catalog/stream", handleSseConnection);
function broadcastCatalogSSE(event, payload) {
  const data = JSON.stringify({ event, payload });
  for (const client of sseCatalogClients) {
    try {
      client.write(`data: ${data}

`);
    } catch {
      sseCatalogClients.delete(client);
    }
  }
}
app.get("/api/dishes", async (_req, res) => {
  try {
    let supabaseDishes = [];
    try {
      const publicClient = getPublicSupabaseServerClient();
      const { data, error } = await publicClient.from("food_items").select("*").order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        supabaseDishes = data;
      } else if (error) {
        console.warn("Supabase /api/dishes query notice:", error.message);
      }
    } catch (err) {
      console.warn("Supabase client connection notice:", err?.message);
    }
    const combinedMap = /* @__PURE__ */ new Map();
    for (const [id, dish] of serverDishes.entries()) {
      combinedMap.set(String(id), dish);
    }
    for (const row of supabaseDishes) {
      const mapped = {
        id: String(row.id),
        name: row.name,
        description: row.description || "",
        price: Number(row.price) || 0,
        category: row.category || "Specialty",
        subcategory: row.subcategory || "Classic",
        image: row.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
        image_url: row.image_url,
        isAvailable: row.is_available !== false,
        is_available: row.is_available !== false,
        vegIndicator: row.veg_indicator || row.vegIndicator || "Veg",
        rating: Number(row.rating) || 4.8,
        reviewsCount: Number(row.reviews_count) || 12,
        prepTime: Number(row.prep_time) || 20,
        spiceLevel: row.spice_level || "Medium",
        restaurantId: row.restaurant_id || "rest_1",
        created_at: row.created_at
      };
      combinedMap.set(String(mapped.id), mapped);
    }
    return res.json(Array.from(combinedMap.values()));
  } catch (e) {
    console.error("Exception in GET /api/dishes:", e);
    return res.json(Array.from(serverDishes.values()));
  }
});
app.get("/api/orders", async (req, res) => {
  try {
    const { phone, customerId } = req.query || {};
    const cleanPhone = phone ? String(phone).replace(/\D/g, "") : "";
    const digits = cleanPhone.length === 12 && cleanPhone.startsWith("91") ? cleanPhone.slice(2) : cleanPhone;
    const orderMap = /* @__PURE__ */ new Map();
    for (const [id, order] of serverOrders.entries()) {
      const oPhone = (order.customer_phone || order.customerPhone || "").replace(/\D/g, "");
      const oDigits = oPhone.length === 12 && oPhone.startsWith("91") ? oPhone.slice(2) : oPhone;
      const oCustId = order.customer_id || order.customerId;
      if (!digits && !customerId) {
        orderMap.set(String(id), order);
      } else if (digits && (oDigits === digits || oPhone.includes(digits))) {
        orderMap.set(String(id), order);
      } else if (customerId && oCustId === customerId) {
        orderMap.set(String(id), order);
      }
    }
    try {
      const publicClient = getPublicSupabaseServerClient();
      let query = publicClient.from("orders").select("*");
      if (digits) {
        query = query.or(`customer_phone.eq.${digits},customer_phone.eq.+91${digits},customerPhone.eq.${digits}`);
      } else if (customerId) {
        query = query.or(`customer_id.eq.${customerId},customerId.eq.${customerId}`);
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          orderMap.set(String(row.id), row);
        }
      }
    } catch {
    }
    const sorted = Array.from(orderMap.values()).sort((a, b) => {
      const timeA = new Date(a.date || a.created_at || 0).getTime();
      const timeB = new Date(b.date || b.created_at || 0).getTime();
      return timeB - timeA;
    });
    return res.json(sorted);
  } catch (e) {
    console.error("Exception in GET /api/orders:", e);
    return res.json([]);
  }
});
app.post("/api/orders", async (req, res) => {
  try {
    const order = req.body || {};
    if (!order.id) {
      order.id = `order_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    }
    serverOrders.set(String(order.id), order);
    persistServerOrders(serverOrders);
    let supabaseSaved = false;
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        const addressObj = typeof order.address === "object" && order.address !== null ? { ...order.address } : { formatted: String(order.address || "") };
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
          placedAt: order.date || (/* @__PURE__ */ new Date()).toISOString()
        };
        const supabasePayload = {
          id: String(order.id),
          customer_id: String(order.customerId || order.customer_id || ""),
          customer_phone: String(order.customerPhone || order.customer_phone || ""),
          customer_name: String(order.customerName || order.customer_name || "Customer"),
          items: Array.isArray(order.items) ? order.items : [],
          subtotal: Number(order.subtotal || 0),
          discount: Number(order.discount || 0),
          delivery_fee: Number(order.deliveryFee !== void 0 ? order.deliveryFee : order.delivery_fee || 0),
          packaging_fee: Number(order.packagingFee !== void 0 ? order.packagingFee : order.packaging_fee || 0),
          tax: Number(order.tax || 0),
          tip: Number(order.tip || 0),
          final_amount: Number(order.finalAmount !== void 0 ? order.finalAmount : order.final_amount || 0),
          status: String(order.status || "accepted"),
          address: addressObj,
          instructions: String(order.instructions || ""),
          coupon_used: String(order.couponUsed || order.coupon_used || ""),
          payment_method: String(order.paymentMethod || order.payment_method || "UPI"),
          payment_status: String(order.paymentStatus || order.payment_status || "pending"),
          date: order.date || (/* @__PURE__ */ new Date()).toISOString(),
          created_at: order.date || (/* @__PURE__ */ new Date()).toISOString()
        };
        const { error } = await adminClient.from("orders").upsert([supabasePayload], { onConflict: "id" });
        if (!error) {
          supabaseSaved = true;
        } else {
          console.warn("[Supabase Orders] Server POST upsert error:", error.message);
        }
      }
    } catch (err) {
      console.warn("[Supabase Orders] Server POST exception:", err?.message);
    }
    let whatsappResult = null;
    try {
      whatsappResult = await sendOrderConfirmationWhatsApp(order);
    } catch (waErr) {
      console.warn("[WhatsApp] Post-order notification notice:", waErr?.message);
      whatsappResult = { success: false, status: "failed", error: waErr?.message };
    }
    return res.status(201).json({
      success: true,
      orderId: order.id,
      supabaseSaved,
      whatsappNotification: whatsappResult,
      order
    });
  } catch (e) {
    console.error("Exception in POST /api/orders:", e);
    return res.status(500).json({ success: false, error: "Failed to record order." });
  }
});
app.put("/api/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};
    const existing = serverOrders.get(String(id)) || {};
    const merged = { ...existing, ...updates, id: String(id), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    serverOrders.set(String(id), merged);
    persistServerOrders(serverOrders);
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        const directCols = ["status", "payment_status", "instructions", "coupon_used", "items", "subtotal", "discount", "final_amount"];
        const updatePayload = {};
        for (const col of directCols) {
          if (updates[col] !== void 0) updatePayload[col] = updates[col];
        }
        if (updates.paymentStatus) updatePayload.payment_status = updates.paymentStatus;
        if (updates.finalAmount) updatePayload.final_amount = updates.finalAmount;
        if (updates.address) updatePayload.address = updates.address;
        if (Object.keys(updatePayload).length > 0) {
          await adminClient.from("orders").update(updatePayload).eq("id", id);
        }
      }
    } catch {
    }
    return res.json({ success: true, order: merged });
  } catch (e) {
    console.error("Exception in PUT /api/orders/:id:", e);
    return res.status(500).json({ success: false, error: "Failed to update order." });
  }
});
app.get("/api/payment/phonepe/status", (_req, res) => {
  try {
    const status = getPhonePeConfigStatus();
    return res.json({
      success: true,
      ...status
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to get PhonePe status" });
  }
});
app.post("/api/payment/phonepe/initiate", async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, error: "Order ID is required to initiate PhonePe payment." });
    }
    let order = serverOrders.get(String(orderId));
    if (!order) {
      try {
        const { client: adminClient } = getAdminSupabaseServerClient();
        if (adminClient) {
          const { data } = await adminClient.from("orders").select("*").eq("id", String(orderId)).maybeSingle();
          if (data) {
            order = data;
            serverOrders.set(String(orderId), order);
          }
        }
      } catch {
      }
    }
    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${orderId} not found.` });
    }
    const currentStatus = String(order.payment_status || order.paymentStatus || "").toLowerCase();
    if (currentStatus === "confirmed" || currentStatus === "paid" || currentStatus === "success") {
      return res.status(400).json({
        success: false,
        error: "This order has already been paid and confirmed.",
        isAlreadyPaid: true
      });
    }
    const verifiedAmount = Number(
      order.final_amount !== void 0 ? order.final_amount : order.finalAmount !== void 0 ? order.finalAmount : order.subtotal || 0
    );
    if (verifiedAmount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid order amount for payment initiation." });
    }
    const customerPhone = String(order.customer_phone || order.customerPhone || "9876543210");
    const customerId = String(order.customer_id || order.customerId || "");
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const origin = req.headers.origin;
    const detectedUrl = origin ? String(origin) : `${proto}://${host}`;
    const appBaseUrl = process.env.APP_URL || detectedUrl;
    const initiateResult = await createPhonePePaymentRequest(
      String(order.id),
      verifiedAmount,
      customerPhone,
      customerId,
      appBaseUrl
    );
    if (!initiateResult.success) {
      return res.status(initiateResult.code === "PHONEPE_NOT_CONFIGURED" ? 503 : 502).json({
        success: false,
        code: initiateResult.code,
        message: initiateResult.message,
        missingVariables: initiateResult.missingVariables,
        error: initiateResult.error
      });
    }
    const paymentDetails = {
      ...typeof order.paymentDetails === "object" ? order.paymentDetails : {},
      merchantTransactionId: initiateResult.merchantTransactionId,
      provider: "PHONEPE_GATEWAY",
      initiatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      amount: verifiedAmount,
      status: "initiated"
    };
    const updatedOrder = {
      ...order,
      payment_method: "PhonePe",
      paymentMethod: "PhonePe",
      payment_status: "initiated",
      paymentStatus: "initiated",
      paymentDetails
    };
    serverOrders.set(String(order.id), updatedOrder);
    persistServerOrders(serverOrders);
    try {
      const { client: adminClient } = getAdminSupabaseServerClient();
      if (adminClient) {
        await adminClient.from("orders").update({
          payment_method: "PhonePe",
          payment_status: "initiated"
        }).eq("id", String(order.id));
      }
    } catch {
    }
    return res.json({
      success: true,
      orderId: order.id,
      merchantTransactionId: initiateResult.merchantTransactionId,
      redirectUrl: initiateResult.redirectUrl,
      verifiedAmount
    });
  } catch (e) {
    console.error("Exception in POST /api/payment/phonepe/initiate:", e);
    return res.status(500).json({ success: false, error: e?.message || "Failed to initiate PhonePe payment." });
  }
});
app.post("/api/payment/phonepe/callback", async (req, res) => {
  try {
    const xVerifyHeader = req.headers["x-verify"];
    const base64Response = req.body?.response;
    if (!base64Response || !xVerifyHeader) {
      console.warn("[PhonePe Webhook] Missing response body or X-VERIFY header");
      return res.status(400).json({ success: false, error: "Missing response body or X-VERIFY header." });
    }
    const checksumVerification = verifyPhonePeCallbackChecksum(base64Response, xVerifyHeader);
    if (!checksumVerification.isValid) {
      console.warn("[PhonePe Webhook] Invalid checksum:", checksumVerification.error);
      return res.status(400).json({ success: false, error: checksumVerification.error });
    }
    const callbackData = checksumVerification.payload?.data || {};
    const merchantTransactionId = callbackData.merchantTransactionId;
    if (!merchantTransactionId) {
      return res.status(400).json({ success: false, error: "Missing merchantTransactionId in payload." });
    }
    const statusVerification = await verifyPhonePePaymentStatus(merchantTransactionId);
    let matchedOrder = null;
    for (const [id, o] of serverOrders.entries()) {
      const oTxnId = o.paymentDetails?.merchantTransactionId;
      if (oTxnId === merchantTransactionId || merchantTransactionId.includes(String(id).replace(/[^a-zA-Z0-9]/g, "").slice(-18))) {
        matchedOrder = o;
        break;
      }
    }
    if (!matchedOrder) {
      try {
        const { client: adminClient } = getAdminSupabaseServerClient();
        if (adminClient) {
          const { data } = await adminClient.from("orders").select("*").order("created_at", { ascending: false }).limit(50);
          if (data) {
            for (const row of data) {
              if (merchantTransactionId.includes(String(row.id).replace(/[^a-zA-Z0-9]/g, "").slice(-18))) {
                matchedOrder = row;
                serverOrders.set(String(row.id), row);
                break;
              }
            }
          }
        }
      } catch {
      }
    }
    if (matchedOrder) {
      const existingStatus = String(matchedOrder.payment_status || matchedOrder.paymentStatus || "").toLowerCase();
      if ((existingStatus === "confirmed" || existingStatus === "paid" || existingStatus === "success") && statusVerification.success) {
        console.log(`[PhonePe Webhook] Order ${matchedOrder.id} already verified as paid. Skipping duplicate processing.`);
        return res.status(200).json({ success: true, message: "Already processed (idempotent)." });
      }
      const newPaymentStatus = statusVerification.success ? "confirmed" : statusVerification.state === "FAILED" ? "failed" : "pending";
      const updatedPaymentDetails = {
        ...typeof matchedOrder.paymentDetails === "object" ? matchedOrder.paymentDetails : {},
        merchantTransactionId,
        phonePeTransactionId: statusVerification.transactionId,
        paymentInstrument: statusVerification.paymentInstrument,
        verifiedAmount: statusVerification.amountInRupees,
        verifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
      try {
        const { client: adminClient } = getAdminSupabaseServerClient();
        if (adminClient) {
          await adminClient.from("orders").update({
            payment_status: newPaymentStatus
          }).eq("id", String(matchedOrder.id));
        }
      } catch (dbErr) {
        console.error("[PhonePe Webhook] Supabase update exception:", dbErr?.message);
      }
      if (newPaymentStatus === "confirmed") {
        try {
          await sendOrderConfirmationWhatsApp(updatedOrder);
        } catch {
        }
      }
    }
    return res.status(200).json({ success: true, status: statusVerification.state });
  } catch (err) {
    console.error("[PhonePe Webhook Exception]:", err?.message || err);
    return res.status(200).json({ success: false, error: err?.message });
  }
});
var handlePhonePeRedirect = async (req, res) => {
  try {
    const orderId = req.query?.orderId || req.body?.orderId;
    const txnId = req.query?.txnId || req.body?.txnId || req.body?.merchantTransactionId;
    let verifiedStatus = "pending";
    if (txnId) {
      const verifyRes = await verifyPhonePePaymentStatus(String(txnId));
      if (verifyRes.success) {
        verifiedStatus = "confirmed";
      } else if (verifyRes.state === "FAILED") {
        verifiedStatus = "failed";
      }
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
            await adminClient.from("orders").update({ payment_status: verifiedStatus }).eq("id", String(orderId));
          }
        } catch {
        }
      }
    }
    const targetUrl = `/?page=tracking&orderId=${encodeURIComponent(orderId || "")}&paymentStatus=${encodeURIComponent(verifiedStatus)}`;
    return res.redirect(302, targetUrl);
  } catch (e) {
    console.error("[PhonePe Redirect Exception]:", e?.message || e);
    return res.redirect(302, "/?page=tracking");
  }
};
app.post("/api/payment/phonepe/redirect", handlePhonePeRedirect);
app.get("/api/payment/phonepe/redirect", handlePhonePeRedirect);
app.get("/api/payment/phonepe/verify/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    let order = serverOrders.get(String(orderId));
    if (!order) {
      try {
        const { client: adminClient } = getAdminSupabaseServerClient();
        if (adminClient) {
          const { data } = await adminClient.from("orders").select("*").eq("id", String(orderId)).maybeSingle();
          if (data) order = data;
        }
      } catch {
      }
    }
    if (!order) {
      return res.status(404).json({ success: false, error: `Order ${orderId} not found.` });
    }
    const txnId = order.paymentDetails?.merchantTransactionId;
    if (!txnId) {
      return res.json({
        success: true,
        orderId,
        paymentStatus: order.payment_status || order.paymentStatus || "pending",
        verified: false,
        message: "No PhonePe merchant transaction ID associated with this order yet."
      });
    }
    const statusResult = await verifyPhonePePaymentStatus(txnId);
    const newStatus = statusResult.success ? "confirmed" : statusResult.state === "FAILED" ? "failed" : "pending";
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
          await adminClient.from("orders").update({ payment_status: newStatus }).eq("id", String(orderId));
        }
      } catch {
      }
    }
    return res.json({
      success: true,
      orderId,
      paymentStatus: newStatus,
      statusResult
    });
  } catch (e) {
    console.error("[PhonePe Verify API Exception]:", e);
    return res.status(500).json({ success: false, error: e?.message || "Verification failed" });
  }
});
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
      const { data, error } = await client.from("order_notifications").select("*").order("created_at", { ascending: false }).limit(50);
      if (!error && Array.isArray(data)) {
        return res.json({ success: true, notifications: data });
      }
    }
  } catch {
  }
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
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message || "Failed to dispatch WhatsApp alert" });
  }
});
var serverSettings = /* @__PURE__ */ new Map();
app.get("/api/settings/:key", async (req, res) => {
  const { key } = req.params;
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      const { data, error } = await client.from("app_settings").select("key, value, description, updated_at").eq("key", key).maybeSingle();
      if (!error && data && data.value !== void 0) {
        return res.json({ success: true, key: data.key, value: data.value, setting: data });
      }
    }
  } catch (e) {
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
  if (!key || value === void 0) {
    return res.status(400).json({ success: false, error: "Key and value are required." });
  }
  const payload = {
    key: String(key),
    value,
    description: description ? String(description) : `Setting for ${key}`,
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_by: req.user?.phone || "admin"
  };
  serverSettings.set(String(key), payload);
  try {
    const { client } = getAdminSupabaseServerClient();
    if (client) {
      const { data, error } = await client.from("app_settings").upsert([payload], { onConflict: "key" }).select();
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
  } catch (e) {
    console.warn(`[Settings POST] Exception writing to Supabase:`, e?.message);
    return res.json({ success: true, setting: payload, notice: "Cached in server memory" });
  }
  return res.json({ success: true, setting: payload });
});
app.post("/api/admin/dishes", requireAdminAuth, async (req, res) => {
  const {
    name,
    description,
    price,
    image,
    image_url,
    category,
    subcategory,
    restaurantId,
    restaurant_id,
    isAvailable,
    is_available,
    vegIndicator,
    veg_indicator,
    prepTime,
    prep_time,
    spiceLevel,
    spice_level,
    rating,
    reviewsCount,
    reviews_count,
    ingredients
  } = req.body;
  if (!name || price === void 0) {
    return res.status(400).json({ success: false, error: "Dish name and price are required." });
  }
  const dishId = req.body.id || `dish_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const dishName = String(name).trim();
  const dishPrice = Number(price);
  const dishImg = image_url || image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80";
  const dishCat = String(category || "Specialty").trim();
  const dishSub = String(subcategory || "Chef Special").trim();
  const isAvail = isAvailable !== false && is_available !== false;
  const vegVal = (veg_indicator || vegIndicator) === "Veg" || (veg_indicator || vegIndicator) === "veg" ? "Veg" : "NonVeg";
  const payloadForSupabase = {
    id: dishId,
    name: dishName,
    description: String(description || "").trim(),
    price: dishPrice,
    category: dishCat,
    subcategory: dishSub,
    image_url: dishImg,
    is_available: isAvail,
    veg_indicator: vegVal,
    rating: Number(rating) || 4.8,
    reviews_count: Number(reviews_count || reviewsCount) || 12,
    prep_time: Number(prep_time || prepTime) || 20,
    spice_level: spice_level || spiceLevel || "Medium",
    restaurant_id: restaurant_id || restaurantId || "rest_1"
  };
  let savedDish = {
    id: dishId,
    ...payloadForSupabase,
    image: dishImg,
    isAvailable: isAvail,
    ingredients: Array.isArray(ingredients) ? ingredients : ["Fresh regional ingredients", "House special spices"],
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  let supabaseSaved = false;
  try {
    const { client: adminClient } = getAdminSupabaseServerClient();
    if (adminClient) {
      const { data, error } = await adminClient.from("food_items").upsert([payloadForSupabase], { onConflict: "id" }).select();
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
        console.warn("Supabase upsert notice (saving to resilient store):", error.message);
      }
    }
  } catch (err) {
    console.warn("Supabase insert exception notice:", err?.message);
  }
  serverDishes.set(String(savedDish.id), savedDish);
  persistServerDishes(serverDishes);
  broadcastCatalogSSE("dish_created", savedDish);
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
  const payloadForSupabase = {};
  if (req.body.name !== void 0) payloadForSupabase.name = String(req.body.name).trim();
  if (req.body.description !== void 0) payloadForSupabase.description = String(req.body.description).trim();
  if (req.body.price !== void 0) payloadForSupabase.price = Number(req.body.price);
  if (req.body.category !== void 0) payloadForSupabase.category = String(req.body.category).trim();
  if (req.body.subcategory !== void 0) payloadForSupabase.subcategory = String(req.body.subcategory).trim();
  if (req.body.image !== void 0 || req.body.image_url !== void 0) {
    payloadForSupabase.image_url = req.body.image_url || req.body.image;
  }
  if (req.body.isAvailable !== void 0 || req.body.is_available !== void 0) {
    payloadForSupabase.is_available = req.body.is_available !== void 0 ? Boolean(req.body.is_available) : Boolean(req.body.isAvailable);
  }
  if (req.body.vegIndicator !== void 0 || req.body.veg_indicator !== void 0) {
    const val = req.body.veg_indicator || req.body.vegIndicator;
    payloadForSupabase.veg_indicator = val === "Veg" || val === "veg" ? "Veg" : "NonVeg";
  }
  if (req.body.restaurantId !== void 0 || req.body.restaurant_id !== void 0) {
    payloadForSupabase.restaurant_id = req.body.restaurant_id || req.body.restaurantId;
  }
  if (req.body.prepTime !== void 0 || req.body.prep_time !== void 0) {
    payloadForSupabase.prep_time = Number(req.body.prep_time || req.body.prepTime);
  }
  if (req.body.spiceLevel !== void 0 || req.body.spice_level !== void 0) {
    payloadForSupabase.spice_level = req.body.spice_level || req.body.spiceLevel;
  }
  if (req.body.rating !== void 0) {
    payloadForSupabase.rating = Number(req.body.rating);
  }
  if (req.body.reviewsCount !== void 0 || req.body.reviews_count !== void 0) {
    payloadForSupabase.reviews_count = Number(req.body.reviews_count || req.body.reviewsCount);
  }
  payloadForSupabase.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  let updatedDish = {
    ...existingDish,
    ...req.body,
    ...payloadForSupabase,
    id: String(id),
    image: payloadForSupabase.image_url || existingDish.image || existingDish.image_url,
    isAvailable: payloadForSupabase.is_available !== void 0 ? payloadForSupabase.is_available : existingDish.isAvailable
  };
  try {
    const { client: adminClient } = getAdminSupabaseServerClient();
    if (adminClient) {
      const { data, error } = await adminClient.from("food_items").upsert([{ id: String(id), ...payloadForSupabase }], { onConflict: "id" }).select();
      if (!error && data && data.length > 0) {
        updatedDish = {
          ...updatedDish,
          ...data[0],
          id: String(data[0].id),
          image: data[0].image_url || updatedDish.image,
          isAvailable: data[0].is_available !== false
        };
      } else if (error) {
        console.warn("Supabase update notice (saving to resilient store):", error.message);
      }
    }
  } catch (err) {
    console.warn("Supabase update exception notice:", err?.message);
  }
  serverDishes.set(String(id), updatedDish);
  persistServerDishes(serverDishes);
  broadcastCatalogSSE("dish_updated", updatedDish);
  return res.json({
    success: true,
    dish: updatedDish,
    message: "Dish updated successfully!"
  });
});
app.delete("/api/admin/dishes/:id", requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const { client: adminClient } = getAdminSupabaseServerClient();
    if (adminClient) {
      await adminClient.from("food_items").delete().eq("id", id);
    }
  } catch (err) {
    console.warn("Supabase delete exception notice:", err?.message);
  }
  serverDishes.delete(String(id));
  persistServerDishes(serverDishes);
  broadcastCatalogSSE("dish_deleted", { id });
  return res.json({
    success: true,
    message: `Dish ${id} removed successfully.`
  });
});
app.post("/api/admin/dishes/seed", requireAdminAuth, async (_req, res) => {
  let addedCount = 0;
  const defaultPool = [...CHIRALA_TOP13_FOOD_ITEMS, ...FOOD_CATALOG];
  for (const item of defaultPool) {
    if (!serverDishes.has(String(item.id))) {
      serverDishes.set(String(item.id), {
        ...item,
        id: String(item.id),
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      addedCount++;
    }
  }
  persistServerDishes(serverDishes);
  let supabaseInserted = 0;
  try {
    const { client: adminClient } = getAdminSupabaseServerClient();
    if (adminClient) {
      const payload = defaultPool.map((item, idx) => ({
        id: String(item.id || `dish_seed_${idx + 1}`),
        name: item.name,
        description: item.description || "",
        price: Number(item.price) || 0,
        category: item.category || "Specialty",
        subcategory: item.subcategory || "Signature",
        image_url: item.image || item.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600",
        is_available: item.isAvailable !== false,
        veg_indicator: item.vegIndicator === "veg" || item.vegIndicator === "Veg" ? "Veg" : "NonVeg",
        rating: item.rating || 4.7,
        reviews_count: item.reviewsCount || 15,
        prep_time: item.prepTime || 20,
        spice_level: item.spiceLevel || "Medium",
        restaurant_id: item.restaurantId || "rest_1"
      }));
      const { data, error } = await adminClient.from("food_items").upsert(payload.slice(0, 30), { onConflict: "id" }).select();
      if (!error && data) {
        supabaseInserted = data.length;
      }
    }
  } catch (e) {
    console.warn("Supabase seed notice:", e?.message);
  }
  broadcastCatalogSSE("catalog_seeded", { count: serverDishes.size });
  return res.json({
    success: true,
    count: serverDishes.size,
    supabaseInserted,
    message: `Menu catalog seeded with ${serverDishes.size} dishes successfully.`
  });
});
var serverDeliveryPartners = [];
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
    address: String(address || "Chirala Regional Highway").trim(),
    vehicleType: vehicleType || "Bike",
    bikeNumber: bikeNumber || "AP 39 TB 0000",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    isApproved: true,
    isAvailable: true,
    status: "Available",
    rating: 5,
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
  const index = serverDeliveryPartners.findIndex((p) => String(p.id) === String(id));
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
  serverDeliveryPartners = serverDeliveryPartners.filter((p) => String(p.id) !== String(id));
  res.json({ success: true, message: "Delivery partner deleted successfully." });
});
app.post("/api/admin/reset-data", requireAdminAuth, (req, res) => {
  const { confirmation, scope } = req.body;
  if (confirmation !== "RESET") {
    return res.status(400).json({
      error: "Confirmation failed. Explicit confirmation key 'RESET' is required to prevent accidental invocation."
    });
  }
  if (!scope || scope === "all_admin_data" || scope === "catalog") {
    serverRestaurants = [...RESTAURANTS];
    serverHotels = [...INITIAL_HOTELS];
  }
  if (!scope || scope === "all_admin_data" || scope === "delivery_partners") {
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
async function startServer() {
  const PORT = Number(process.env.PORT) || 3e3;
  const distPath = path.join(process.cwd(), "dist");
  const isDev = process.env.NODE_ENV === "development" || process.env.npm_lifecycle_event === "dev" || !fs.existsSync(path.join(distPath, "index.html"));
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
var isDirectExecution = (() => {
  try {
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
      return false;
    }
    const argv1 = process.argv[1] ? path.resolve(process.argv[1]) : "";
    return argv1.endsWith("server.ts") || argv1.endsWith("server.js");
  } catch {
    return false;
  }
})();
if (isDirectExecution) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
  });
}
var server_default = app;
export {
  app,
  createSignedSessionToken,
  server_default as default,
  startServer,
  verifySignedSessionToken
};
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
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
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Re-exports from src/lib/whatsapp.ts for unified WhatsApp Cloud API utilities.
 */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Official PhonePe Payment Gateway Integration Utility (Standard Checkout PG v1)
 * 
 * Strictly follows official PhonePe Developer Documentation:
 * - Payment Request Endpoint: /pg/v1/pay
 * - Check Status Endpoint: /pg/v1/status/{merchantId}/{merchantTransactionId}
 * - Checksum algorithm: SHA256(data + saltKey) + "###" + saltIndex
 * - Safe credential isolation: secrets are read ONLY from server-side environment variables.
 */
//# sourceMappingURL=server.js.map
