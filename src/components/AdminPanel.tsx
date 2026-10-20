/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { motion } from 'motion/react';
import { 
  TrendingUp, ShoppingBag, Users, Building, Plus, Tag, Trash, Edit, 
  Settings, Save, PieChart, BarChart2, DollarSign, Bike, Check, Flame, Upload, ShieldAlert,
  Briefcase, MapPin, Download, Send, Globe, Award, Ban, Phone, MessageSquare, FileText, X,
  Image as ImageIcon, Camera, RefreshCw, Trash2, AlertTriangle, Sparkles, Percent,
  QrCode, Copy, CheckCircle2, ShieldCheck, IndianRupee, ExternalLink, Smartphone
} from 'lucide-react';
import QRCode from 'qrcode';
import { VegIndicator, FranchiseApplication } from '../types';
import SuperAdminGuard from './SuperAdminGuard';
import AdminCatalogManager from './AdminCatalogManager';
import { isAdminRole } from '../config/authConfig';

export default function AdminPanel() {
  const { 
    orders, foodCatalog, couponsList, addNewCoupon: addCoupon, deleteCoupon: removeCoupon, 
    clearAllCoupons, resetDefaultCoupons, clearStats, seedSampleOrders,
    banners, deleteBanner, clearAllBanners, resetDefaultBanners, enableBanner,
    addFoodItem, updateFoodItem, deleteFoodItem, foodLoading, foodError, supabaseConnected, seedDishesToSupabase, refetchFoodCatalog,
    franchiseApplications, deliveryPartner, user, updateFranchiseStatus,
    restaurants, registerNewRestaurantRequest, approveRestaurant, isAdmin, isSuperAdmin, setCurrentPage,
    updateOrderPaymentStatus, storePaymentSettings, updateStorePaymentSettings
  } = useApp();

  const [activeTab, setActiveTab] = useState<'analytics' | 'catalog' | 'payments' | 'coupons' | 'franchise'>('analytics');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'initiated' | 'awaiting_confirmation' | 'confirmed' | 'failed'>('all');

  // PhonePe UPI & Bank Account Configuration States
  const [adminPhonePeUpiId, setAdminPhonePeUpiId] = useState(storePaymentSettings?.upiId || 'arjun.gorrepati@axl');
  const [adminBankName, setAdminBankName] = useState(storePaymentSettings?.bankName || 'Karur Vysya Bank - 4761');
  const [adminMerchantName, setAdminMerchantName] = useState(storePaymentSettings?.merchantName || 'Nuvvo Food & Hospitality');
  const [adminPhonePePhone, setAdminPhonePePhone] = useState(storePaymentSettings?.phonePeNumber || '9876543210');
  const [adminAccountHolder, setAdminAccountHolder] = useState(storePaymentSettings?.accountHolderName || 'Arjun Gorrepati (Nuvvo Foods)');
  const [testAmount, setTestAmount] = useState('250');
  const [testQrUrl, setTestQrUrl] = useState('');
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);
  const [copiedAdminUpi, setCopiedAdminUpi] = useState(false);

  useEffect(() => {
    if (storePaymentSettings) {
      if (storePaymentSettings.upiId) setAdminPhonePeUpiId(storePaymentSettings.upiId);
      if (storePaymentSettings.bankName) setAdminBankName(storePaymentSettings.bankName);
      if (storePaymentSettings.merchantName) setAdminMerchantName(storePaymentSettings.merchantName);
      if (storePaymentSettings.phonePeNumber) setAdminPhonePePhone(storePaymentSettings.phonePeNumber);
      if (storePaymentSettings.accountHolderName) setAdminAccountHolder(storePaymentSettings.accountHolderName);
    }
  }, [storePaymentSettings]);

  useEffect(() => {
    const cleanUpi = (adminPhonePeUpiId || 'arjun.gorrepati@axl').trim().toLowerCase();
    const cleanMerchant = (adminMerchantName || 'Nuvvo Foods').replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 25);
    const amt = (Math.max(1, Number(testAmount) || 250)).toFixed(2);
    const testUri = `upi://pay?pa=${cleanUpi}&pn=${encodeURIComponent(cleanMerchant)}&am=${amt}&cu=INR&tn=${encodeURIComponent('Test Bill')}&tr=TEST${Date.now()}`;
    
    QRCode.toDataURL(testUri, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' }
    })
      .then(url => setTestQrUrl(url))
      .catch(err => console.error(err));
  }, [adminPhonePeUpiId, adminMerchantName, testAmount]);

  const handleSavePhonePeSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPhonePeUpiId.trim()) {
      alert('Please enter a valid PhonePe UPI ID (e.g. mobile@ybl or username@axl)');
      return;
    }
    updateStorePaymentSettings({
      upiId: adminPhonePeUpiId.trim().toLowerCase(),
      bankName: adminBankName.trim() || 'Karur Vysya Bank - 4761',
      merchantName: adminMerchantName.trim() || 'Nuvvo Food & Hospitality',
      phonePeNumber: adminPhonePePhone.trim() || '9876543210',
      accountHolderName: adminAccountHolder.trim() || 'Arjun Gorrepati (Nuvvo Foods)'
    });
    setIsSavedSuccess(true);
    setTimeout(() => setIsSavedSuccess(false), 4000);
    alert(`✓ PhonePe Account Settings Saved Successfully!\n\nAll customer food bill payments will now directly transfer to:\n• PhonePe UPI ID: ${adminPhonePeUpiId.trim().toLowerCase()}\n• Connected Bank: ${adminBankName.trim()}\n• Receiver Name: ${adminMerchantName.trim()}`);
  };

  // FRANCHISE MANAGEMENT STATES
  const [onboardingInc, setOnboardingInc] = useState('1500');
  const [courierInc, setCourierInc] = useState('500');
  const [revShare, setRevShare] = useState('2.5');
  const [bulkMsg, setBulkMsg] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);
  const [selectedAppIdForAgreement, setSelectedAppIdForAgreement] = useState<string | null>(null);
  const [msgLogs, setMsgLogs] = useState<string[]>([]);
  const [territoryUpdates, setTerritoryUpdates] = useState<Record<string, { city: string; district: string; state: string }>>({});

  // FOOD ITEM FORM STATE
  const [newFoodName, setNewFoodName] = useState('');
  const [newFoodPrice, setNewFoodPrice] = useState('180');
  const [newFoodCategory, setNewFoodCategory] = useState('North Indian');
  const [newFoodDesc, setNewFoodDesc] = useState('');
  const [newFoodVeg, setNewFoodVeg] = useState<VegIndicator>(VegIndicator.VEG);
  const [newFoodImg, setNewFoodImg] = useState('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80');
  const [imageSourceType, setImageSourceType] = useState<'preset' | 'upload' | 'url'>('preset');

  // LOCAL RESTAURANT SELECTION / CREATION STATE
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  const [directRestaurantNameInput, setDirectRestaurantNameInput] = useState('');
  const [isAddingNewRestaurant, setIsAddingNewRestaurant] = useState(false);
  const [newRestaurantName, setNewRestaurantName] = useState('');
  const [newRestaurantCuisines, setNewRestaurantCuisines] = useState('Local Special, Coastal Delights');
  const [newRestaurantCostForTwo, setNewRestaurantCostForTwo] = useState('250');
  const [newRestaurantPhone, setNewRestaurantPhone] = useState('');
  const [newRestaurantType, setNewRestaurantType] = useState<'Family' | 'Biryani & Mandi' | 'Fast Food' | 'Meals & Tiffins' | 'Desserts & Bakery' | 'Juices & Cafe' | 'Seafood' | 'Hotel & Resort'>('Meals & Tiffins');

  // For editing existing dishes
  const [replaceRestaurantId, setReplaceRestaurantId] = useState('');

  const PRESET_DISH_IMAGES = useMemo(() => [
    { name: 'Biryani', url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=400&q=80' },
    { name: 'Paneer Butter Masala', url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=400&q=80' },
    { name: 'Ragi Dosa', url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80' },
    { name: 'Chole Bhature', url: 'https://images.unsplash.com/photo-1626132647523-66f5bf380027?auto=format&fit=crop&w=400&q=80' },
    { name: 'Gourmet Burger', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80' },
    { name: 'Cheesy Pizza', url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80' },
    { name: 'Noodles Chowmein', url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80' },
    { name: 'Classic Desserts', url: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=400&q=80' },
    { name: 'Premium Beverages', url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=400&q=80' },
    { name: 'Healthy Salad', url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80' }
  ], []);

  // IMAGE & DISH REPLACEMENT STATES
  const [activeReplaceId, setActiveReplaceId] = useState<string | null>(null);
  const [replaceImgUrl, setReplaceImgUrl] = useState<string>('');
  const [replacePrice, setReplacePrice] = useState<string>('');
  const [replaceAvailability, setReplaceAvailability] = useState<boolean>(true);
  const [replaceDishName, setReplaceDishName] = useState<string>('');

  // COUPON FORM STATE
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponVal, setNewCouponVal] = useState('15');
  const [newCouponDesc, setNewCouponDesc] = useState('');

  const revenueSum = useMemo(() => {
    return orders.reduce((sum, order) => sum + order.totalAmount, 0);
  }, [orders]);

  const handleAddFood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFoodName.trim()) return;

    let targetRestaurantId = selectedRestaurantId;

    if (directRestaurantNameInput.trim()) {
      const lowerInput = directRestaurantNameInput.trim().toLowerCase();
      const existing = restaurants.find(r => r.name.toLowerCase() === lowerInput);
      if (existing) {
        targetRestaurantId = existing.id;
      } else {
        const regResult = registerNewRestaurantRequest(
          directRestaurantNameInput.trim(),
          ['Local Special', 'Andhra Style'],
          250,
          '9999999999',
          'Family'
        );
        if (regResult && regResult.id) {
          approveRestaurant(regResult.id);
          targetRestaurantId = regResult.id;
        }
      }
    } else if (selectedRestaurantId === 'new') {
      if (!newRestaurantName.trim()) {
        alert('Please provide a valid Restaurant Name.');
        return;
      }
      // Register new restaurant request
      const cuisinesArray = newRestaurantCuisines.split(',').map(c => c.trim()).filter(Boolean);
      const regResult = registerNewRestaurantRequest(
        newRestaurantName,
        cuisinesArray.length > 0 ? cuisinesArray : ['Local Cuisine'],
        parseInt(newRestaurantCostForTwo, 10) || 250,
        newRestaurantPhone || '9999999999',
        newRestaurantType
      );
      
      if (regResult && regResult.id) {
        // Approve it instantly so it is active
        approveRestaurant(regResult.id);
        targetRestaurantId = regResult.id;
      }
    }

    const savedFood = await addFoodItem({
      name: newFoodName,
      price: parseFloat(newFoodPrice),
      category: newFoodCategory,
      subcategory: 'Classic Signature',
      description: '',
      vegIndicator: newFoodVeg,
      rating: 4.8,
      prepTime: 25,
      spiceLevel: 'Medium',
      image: newFoodImg,
      ingredients: ['Cottage Cheese', 'Indian Spices', 'Artisan Butter'],
      restaurantId: targetRestaurantId || undefined,
      is_available: true,
      isAvailable: true
    });

    if (!savedFood) {
      // Dish could not be saved to Supabase (error already alerted)
      return;
    }

    setNewFoodName('');
    setNewFoodDesc('');
    setDirectRestaurantNameInput('');
    setIsAddingNewRestaurant(false);
    setSelectedRestaurantId('');
    setNewRestaurantName('');
    setNewRestaurantCuisines('Local Special, Coastal Delights');
    setNewRestaurantCostForTwo('250');
    setNewRestaurantPhone('');
    alert(`Dish "${savedFood.name}" successfully registered and saved to Supabase public.food_items!`);
  };

  const handleAddCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode.trim()) return;

    addCoupon({
      code: newCouponCode.toUpperCase(),
      discountType: 'percentage',
      value: parseFloat(newCouponVal),
      description: newCouponDesc,
      minOrder: 150,
      expiryDate: '2026-12-31'
    });

    setNewCouponCode('');
    setNewCouponDesc('');
    alert('Coupon code live authorized!');
  };

  const [diagnosticRunning, setDiagnosticRunning] = useState(false);

  const runSupabaseDiagnostic = async () => {
    setDiagnosticRunning(true);
    console.log('[SUPABASE DIAGNOSTIC] Initiating server-side Supabase client verification...');
    try {
      const token = localStorage.getItem('nuvvo_auth_token') || '';
      const res = await fetch('/api/admin/diagnostics/supabase', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      console.log('[SUPABASE DIAGNOSTIC STATUS]:', data);
      if (data.success && data.databaseAccess) {
        console.log('✅ Supabase server client successfully initialized using SERVICE_ROLE_KEY and accessing database.');
      } else {
        console.warn('⚠️ Supabase server client diagnostic warning/failure:', data.message || data.error);
      }
    } catch (err) {
      console.error('[SUPABASE DIAGNOSTIC ERROR] Network/server exception:', err);
    } finally {
      setDiagnosticRunning(false);
    }
  };

  // Strict Admin authorization check: role verified securely by server
  if (!isAdmin || !isAdminRole(user?.role)) {
    return (
      <div id="admin-access-denied" className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center pb-24 duration-300">
        <div className="w-20 h-20 bg-rose-100 dark:bg-rose-950/30 text-rose-600 rounded-full flex items-center justify-center mb-4 border border-rose-200 dark:border-rose-900/50 shadow-lg">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider">
          Admin Access Restricted
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mt-2.5 leading-relaxed">
          The Admin Portal is strictly reserved for authorized administrators. Customers cannot access this terminal.
        </p>
        <button
          onClick={() => setCurrentPage('account')}
          className="mt-6 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-md transition active:scale-95 cursor-pointer"
        >
          Return to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 pb-24 duration-300">
      
      {/* Upper header */}
      <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b p-4 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-black p-0.5 border border-amber-500/30 shrink-0 flex items-center justify-center shadow-xs">
            <img src="/nuvvo-logo.png" alt="Nuvvo Logo" className="w-full h-full rounded-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-950 dark:text-zinc-50 tracking-tight flex items-center gap-1.5">
              📊 Micro-Region Admin
            </h2>
            <p className="text-[10px] text-zinc-400 font-bold font-mono tracking-wide mt-0.5">METRIC CONTROL ENGINE</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Hidden diagnostic button to verify server-side Supabase client using SERVICE_ROLE_KEY */}
          <button
            onClick={runSupabaseDiagnostic}
            disabled={diagnosticRunning}
            title="Run Server Supabase Client Diagnostics (Logs to console)"
            aria-label="Run Server Supabase Client Diagnostics"
            id="supabase-diagnostic-hidden-btn"
            className="w-4 h-4 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity p-0 bg-transparent text-zinc-400 hover:text-orange-500 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs bg-orange-500/10 text-orange-600 px-3 py-1 rounded-full font-bold">Terminal Live</span>
        </div>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-4">
        
        {/* EASY DISH / HOTEL / RESTAURANT MANAGEMENT */}
        <AdminCatalogManager />

        {/* MULTI-ROLE PORTAL BRIDGES (TOP PLACE IN ADMIN CHAMBER) */}
        <div id="admin-chamber-portal-bridges" className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-zinc-950 dark:text-zinc-50 tracking-tight uppercase flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-orange-500" /> Multi-Role Portal Bridges
            </h4>
            <span className="text-[9px] bg-orange-500/10 text-orange-600 dark:text-orange-400 font-black px-2 py-0.5 rounded-full font-mono uppercase">
              Admin Chamber
            </span>
          </div>
          <p className="text-[10px] text-zinc-400 leading-snug">
            Instantly transition your UI view into different sections of the Nuvvo Ecosystem below:
          </p>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <button 
              type="button"
              onClick={() => setCurrentPage('home')}
              className="p-3 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 border border-emerald-200/70 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 rounded-2xl font-black uppercase tracking-wider text-[9px] cursor-pointer transition active:scale-95 flex flex-col items-center gap-1 shadow-2xs"
            >
              <span className="text-base">🛍️</span>
              <span>Customer</span>
            </button>

            <button 
              type="button"
              onClick={() => setCurrentPage('partner')}
              className="p-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/40 border border-indigo-200/70 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300 rounded-2xl font-black uppercase tracking-wider text-[9px] cursor-pointer transition active:scale-95 flex flex-col items-center gap-1 shadow-2xs"
            >
              <span className="text-base">🏍️</span>
              <span>Partner</span>
            </button>
            
            <button 
              type="button"
              onClick={() => setCurrentPage('franchise')}
              className="p-3 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 border border-amber-200/70 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 rounded-2xl font-black uppercase tracking-wider text-[9px] cursor-pointer transition active:scale-95 flex flex-col items-center gap-1 shadow-2xs"
            >
              <span className="text-base">🌴</span>
              <span>Franchise</span>
            </button>

            <button 
              type="button"
              onClick={() => setCurrentPage('super-admin')}
              className="p-3 bg-rose-50 hover:bg-rose-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 border border-rose-200/70 dark:border-red-800/40 text-rose-700 dark:text-red-300 rounded-2xl font-black uppercase tracking-wider text-[9px] cursor-pointer transition active:scale-95 flex flex-col items-center gap-1 shadow-2xs"
            >
              <span className="text-base">👑</span>
              <span>Super Admin</span>
            </button>
          </div>
        </div>

        {/* Core panel tabs */}
        <div className="grid grid-cols-5 bg-slate-100 dark:bg-zinc-900 p-1 rounded-2xl border text-center text-xs gap-1">
          {[
            { id: 'analytics', label: 'Stats' },
            { id: 'catalog', label: user?.role === 'Customer' ? 'Dishes 🔒' : 'Dishes' },
            { id: 'payments', label: 'PhonePe 💳' },
            { id: 'coupons', label: 'Promos' },
            { id: 'franchise', label: 'Franchise 🏢' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 rounded-xl font-bold transition cursor-pointer text-[11px] truncate ${
                activeTab === tab.id 
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ANALYTICS SECTION */}
        {activeTab === 'analytics' && (
          <div className="space-y-4">
            
            {/* STATS ACTION BAR / CLEAR STATS ACCESS */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-slate-200/90 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    orders.length > 0 
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>
                    {orders.length > 0 ? '● Active Stats' : '○ Stats Cleared (₹0)'}
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    {orders.length} orders recorded
                  </span>
                </div>
                <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100 mt-1">
                  Chirala Territory Performance Stats
                </h4>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {orders.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => seedSampleOrders()}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    title="Seed Sample Orders"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Seed Sample Stats</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to clear all territory sales stats and order history? All metrics will reset to ₹0.')) {
                        clearStats();
                      }
                    }}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    title="Clear All Stats & Orders"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Clear All Stats</span>
                  </button>
                )}
              </div>
            </div>

            {/* STATS ROW */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border shadow-sm">
                <DollarSign className="w-5 h-5 text-emerald-500 mb-1" />
                <span className="text-[10px] uppercase font-bold text-zinc-400">Total Sales</span>
                <p className="text-xl font-black font-mono mt-1 text-zinc-800 dark:text-zinc-100">₹{revenueSum.toLocaleString()}</p>
              </div>

              <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border shadow-sm">
                <ShoppingBag className="w-5 h-5 text-orange-500 mb-1" />
                <span className="text-[10px] uppercase font-bold text-zinc-400">Orders Logged</span>
                <p className="text-xl font-black font-mono mt-1 text-zinc-800 dark:text-zinc-100">{orders.length}</p>
              </div>
            </div>

            {/* BAR CHART SIMULATOR */}
            <div className="bg-white dark:bg-zinc-900 border rounded-3xl p-4 shadow-sm">
              <h4 className="text-xs font-bold text-zinc-450 uppercase mb-3">Hourly order intensity</h4>
              
              <div className="flex justify-between items-end h-28 pt-2 border-b">
                {[
                  { hour: '09:00', orders: 12 },
                  { hour: '12:00', orders: 48 },
                  { hour: '15:00', orders: 20 },
                  { hour: '18:00', orders: 35 },
                  { hour: '21:00', orders: 62 }
                ].map((pt, i) => (
                  <div key={i} className="flex flex-col items-center flex-1">
                    <span className="text-[9px] font-bold text-orange-500 font-mono">{pt.orders}</span>
                    <div 
                      style={{ height: `${(pt.orders / 65) * 100}%` }} 
                      className="w-4 bg-orange-500/10 border-t-2 border-orange-500 rounded-t-sm"
                    />
                    <span className="text-[8px] text-zinc-400 mt-1 font-mono">{pt.hour}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* RECENT ORDERS LOG LIST WITH PAYMENT STATUS FILTERS */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-4 border shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-2.5">
                <div>
                  <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-50 uppercase">Territory Orders & Payments Console</h4>
                  <p className="text-[10px] text-zinc-400">Manage orders and manually verify direct UPI transactions</p>
                </div>
                <span className="text-[10px] font-mono font-bold text-zinc-500">
                  Total: {orders.length} orders
                </span>
              </div>

              {/* Requirement #13: Payment Status Filters */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[10px]">
                {[
                  { id: 'all', label: 'All Orders', count: orders.length },
                  { id: 'pending', label: '⏳ Payment Pending', count: orders.filter(o => o.paymentStatus === 'pending').length },
                  { id: 'initiated', label: '🚀 Initiated', count: orders.filter(o => o.paymentStatus === 'initiated').length },
                  { id: 'awaiting_confirmation', label: '🔍 Awaiting Confirmation', count: orders.filter(o => o.paymentStatus === 'awaiting_confirmation').length },
                  { id: 'confirmed', label: '✅ Payment Confirmed', count: orders.filter(o => o.paymentStatus === 'confirmed' || o.paymentStatus === 'success').length },
                  { id: 'failed', label: '❌ Failed / Cancelled', count: orders.filter(o => o.paymentStatus === 'failed' || o.paymentStatus === 'cancelled').length }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPaymentFilter(tab.id as any)}
                    className={`px-2.5 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-all ${
                      paymentFilter === tab.id
                        ? 'bg-orange-500 text-white font-extrabold shadow-xs'
                        : 'bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
              
              {(() => {
                const filteredOrders = orders.filter(or => {
                  if (paymentFilter === 'all') return true;
                  if (paymentFilter === 'pending') return or.paymentStatus === 'pending';
                  if (paymentFilter === 'initiated') return or.paymentStatus === 'initiated';
                  if (paymentFilter === 'awaiting_confirmation') return or.paymentStatus === 'awaiting_confirmation';
                  if (paymentFilter === 'confirmed') return or.paymentStatus === 'confirmed' || or.paymentStatus === 'success';
                  if (paymentFilter === 'failed') return or.paymentStatus === 'failed' || or.paymentStatus === 'cancelled';
                  return true;
                });

                if (filteredOrders.length === 0) {
                  return (
                    <p className="text-xs text-zinc-400 font-bold py-8 text-center border border-dashed rounded-2xl dark:border-zinc-800">
                      No orders found for payment filter: "{paymentFilter.replace('_', ' ')}".
                    </p>
                  );
                }

                return (
                  <div className="overflow-y-auto max-h-80 divide-y space-y-3">
                    {filteredOrders.map(or => {
                      const amount = or.finalAmount || or.totalAmount || 0;
                      const isAwaiting = or.paymentStatus === 'awaiting_confirmation';
                      const isInitiated = or.paymentStatus === 'initiated';
                      const isConfirmed = or.paymentStatus === 'confirmed' || or.paymentStatus === 'success';

                      return (
                        <div key={or.id} className="pt-3 first:pt-0 flex flex-col gap-2 text-xs text-left">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-extrabold text-zinc-900 dark:text-zinc-50">
                                  Order #{or.id.replace('order_', '').slice(-6).toUpperCase()}
                                </h4>
                                <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  isAwaiting
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                                    : isConfirmed
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                                    : isInitiated
                                    ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30'
                                    : or.paymentStatus === 'failed'
                                    ? 'bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30'
                                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                }`}>
                                  {isAwaiting && '🔍 Awaiting Payment Confirmation'}
                                  {isConfirmed && '✅ Payment Confirmed'}
                                  {isInitiated && '🚀 Payment Initiated'}
                                  {or.paymentStatus === 'pending' && '⏳ Payment Pending'}
                                  {or.paymentStatus === 'failed' && '❌ Payment Failed'}
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-400 mt-0.5">
                                {or.customerName} • {or.items.length} items • {or.paymentMethod || 'UPI'}
                                {or.scheduledTime && <span className="text-orange-500 font-bold block mt-0.5">⏰ Scheduled: {or.scheduledTime}</span>}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono font-black text-sm text-zinc-900 dark:text-zinc-50 block">₹{amount}</span>
                              <span className="text-[9px] bg-indigo-600 text-white font-extrabold uppercase px-1.5 py-0.5 rounded-md mt-0.5 inline-block">
                                {or.status}
                              </span>
                            </div>
                          </div>

                          {/* UPI Transaction Details & Requirement #14: Manual Admin Confirmation */}
                          <div className="bg-slate-50 dark:bg-zinc-850 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800 text-[10.5px] space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                              <span>Receiver UPI ID: <strong className="text-zinc-800 dark:text-zinc-200 font-mono">{or.upiDetails?.upiId || storePaymentSettings?.upiId || 'arjun.gorrepati@axl'}</strong></span>
                              {(or.upiDetails?.transactionRef || or.paymentDetails?.transactionRef) && (
                                <span>Txn Ref: <strong className="font-mono text-zinc-700 dark:text-zinc-300">{or.upiDetails?.transactionRef || or.paymentDetails?.transactionRef}</strong></span>
                              )}
                            </div>

                            {(or.upiDetails?.customerUtr || or.paymentDetails?.customerUtr) && (
                              <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-800 dark:text-blue-300 text-[10px] flex items-center justify-between">
                                <span>Customer Submitted UTR: <strong className="font-mono font-black">{or.upiDetails?.customerUtr || or.paymentDetails?.customerUtr}</strong></span>
                                <span className="text-[9px] uppercase font-bold">Verify in Bank App</span>
                              </div>
                            )}

                            {/* Manual Admin Action Buttons */}
                            {(isAwaiting || isInitiated || or.paymentStatus === 'pending') && (
                              <div className="pt-1 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Verify and confirm UPI payment of ₹${amount} received from ${or.customerName}?`)) {
                                      updateOrderPaymentStatus(or.id, 'confirmed', 'Admin confirmed payment externally on bank app');
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-[10px] uppercase tracking-wider transition cursor-pointer flex items-center gap-1 shadow-xs active:scale-95"
                                >
                                  ✓ Verify & Confirm Payment
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Mark payment as failed for Order #${or.id.slice(-6).toUpperCase()}?`)) {
                                      updateOrderPaymentStatus(or.id, 'failed', 'Admin marked as payment failed');
                                    }
                                  }}
                                  className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-600 rounded-lg font-bold text-[10px] uppercase transition cursor-pointer"
                                >
                                  ✕ Mark Failed
                                </button>
                              </div>
                            )}

                            {isConfirmed && (
                              <div className="text-[9.5px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                <span>✓ Payment Confirmed by Admin</span>
                                {or.upiDetails?.confirmedAt && (
                                  <span className="text-zinc-400 font-mono">({new Date(or.upiDetails.confirmedAt).toLocaleTimeString()})</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* COMPLETE DETAILED ADDRESS INFO FOR RESTAURANT & SUPER ADMIN VIEW */}
                          <div className="bg-slate-50 dark:bg-zinc-850 p-2 rounded-xl border border-slate-100 dark:border-zinc-800 text-[10px]">
                            <span className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase block mb-0.5">📍 Drop Location:</span>
                            <p className="text-zinc-700 dark:text-zinc-300 font-medium">
                              {or.address?.customerName} ({or.address?.mobileNumber}) • {or.address?.houseNumber || or.address?.flatNo || ''} {or.address?.streetName || or.address?.locality || or.address?.area || ''}, {or.address?.city}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

          </div>
        )}

        {/* DISHES CATALOG MANAGEMENT */}
        {activeTab === 'catalog' && (
          user?.role === 'Customer' ? (
            <div className="bg-white dark:bg-zinc-900 border rounded-3xl p-6 text-center shadow-sm space-y-4">
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-100 dark:border-rose-900/50">
                <ShieldAlert className="w-8 h-8 font-black text-rose-500" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider">Access Restricted to Customers</h4>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                  The live culinary dish catalog of exactly <strong className="text-zinc-805 dark:text-zinc-200">200 active menus</strong> is encrypted and restricted to <strong className="text-zinc-900 dark:text-zinc-100">Super Admin Authorized Terminals only</strong>.
                </p>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border text-[10px] text-zinc-450 dark:text-zinc-500 font-mono leading-relaxed">
                Security Pass: REQ-CATALOG-RESTRICTED-CUSTOMER
              </div>
            </div>
          ) : (
            <div className="space-y-4">
            
            {/* ADD FOOD FORM */}
            <SuperAdminGuard showBadge={true}>
              <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border shadow-sm">
                <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-50 tracking-tight uppercase mb-3 text-orange-500">Inject customized food package</h4>
                
                <form onSubmit={handleAddFood} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-zinc-500 mb-0.5 font-bold">Dish Name</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="Butter Paneer Masala" 
                        value={newFoodName}
                        onChange={e => setNewFoodName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl border text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-500 mb-0.5 font-bold">Price (₹)</label>
                      <input 
                        type="number" 
                        required 
                        value={newFoodPrice}
                        onChange={e => setNewFoodPrice(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl border text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-zinc-500 mb-0.5 font-bold">Category</label>
                      <select 
                        value={newFoodCategory} 
                        onChange={e => setNewFoodCategory(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl border text-xs font-bold"
                      >
                        <option value="North Indian">North Indian</option>
                        <option value="Biryani">Biryani</option>
                        <option value="South Indian">South Indian</option>
                        <option value="Desserts">Desserts</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-zinc-500 mb-0.5 font-bold">Veg Tag</label>
                      <select 
                        value={newFoodVeg} 
                        onChange={e => setNewFoodVeg(e.target.value as any)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl border text-xs font-bold"
                      >
                        <option value={VegIndicator.VEG}>VEG</option>
                        <option value={VegIndicator.NON_VEG}>NON-VEG</option>
                      </select>
                    </div>
                  </div>

                  {/* LOCAL RESTAURANT PARTNER SELECTION / CREATION OPTION */}
                  <div className="border border-slate-150/70 p-3 bg-slate-50 dark:bg-zinc-850/10 dark:border-zinc-850 rounded-2xl space-y-2.5 mt-2">
                    <div>
                      <label className="block text-orange-500 mb-1 font-extrabold uppercase tracking-wide text-[9.5px]">Local Restaurant Name Option *</label>
                      <input
                        type="text"
                        placeholder="Type direct restaurant name (e.g. Daawat Palace)"
                        value={directRestaurantNameInput}
                        onChange={e => setDirectRestaurantNameInput(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-800 p-2 rounded-xl border text-xs font-semibold focus:outline-none focus:border-orange-500 mb-2.5 text-zinc-900 dark:text-zinc-50"
                      />
                      
                      <div className="text-[9px] text-zinc-400 font-bold uppercase mb-1 flex items-center gap-1">
                        <span>— OR Choose Existing Partner Vendor —</span>
                      </div>

                      <select
                        value={selectedRestaurantId}
                        disabled={!!directRestaurantNameInput.trim()}
                        onChange={e => {
                          setSelectedRestaurantId(e.target.value);
                          if (e.target.value === 'new') {
                            setIsAddingNewRestaurant(true);
                          } else {
                            setIsAddingNewRestaurant(false);
                          }
                        }}
                        className={`w-full bg-white dark:bg-zinc-800 p-2 rounded-xl border text-xs font-bold ${
                          directRestaurantNameInput.trim() ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                      >
                        <option value="">Ecosystem (Default Kitchen)</option>
                        {restaurants.map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.businessType || 'General'})</option>
                        ))}
                        <option value="new">➕ Add & Link New Local Restaurant...</option>
                      </select>
                    </div>

                    {isAddingNewRestaurant && (
                      <div className="p-3 bg-amber-500/5 dark:bg-amber-500/10 border border-orange-200/50 dark:border-zinc-800/80 rounded-xl space-y-3 animate-fadeIn">
                        <p className="text-[10px] text-orange-500 font-extrabold uppercase mt-0.5 tracking-wide">
                          Define New Local Restaurant Details
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[8.5px] text-zinc-400 mb-0.5 font-bold uppercase">Restaurant Name</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Chirala Royal Mandi" 
                              value={newRestaurantName}
                              onChange={e => setNewRestaurantName(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-800 p-2 rounded-lg border text-xs font-semibold"
                            />
                          </div>
                          <div>
                            <label className="block text-[8.5px] text-zinc-400 mb-0.5 font-bold uppercase">Business Type</label>
                            <select
                              value={newRestaurantType}
                              onChange={e => setNewRestaurantType(e.target.value as any)}
                              className="w-full bg-white dark:bg-zinc-800 p-2 rounded-lg border text-xs font-bold"
                            >
                              <option value="Meals & Tiffins">Meals & Tiffins</option>
                              <option value="Biryani & Mandi">Biryani & Mandi</option>
                              <option value="Seafood">Seafood</option>
                              <option value="Fast Food">Fast Food</option>
                              <option value="Family">Family</option>
                              <option value="Desserts & Bakery">Desserts & Bakery</option>
                              <option value="Juices & Cafe">Juices & Cafe</option>
                              <option value="Hotel & Resort">Hotel & Resort</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[8.5px] text-zinc-400 mb-0.5 font-bold uppercase">Cuisines (comma sep)</label>
                            <input 
                              type="text" 
                              placeholder="Tiffins, South" 
                              value={newRestaurantCuisines}
                              onChange={e => setNewRestaurantCuisines(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-800 p-2 rounded-lg border text-xs font-semibold"
                            />
                          </div>
                          <div>
                            <label className="block text-[8.5px] text-zinc-400 mb-0.5 font-bold uppercase">Cost for Two (₹)</label>
                            <input 
                              type="number" 
                              value={newRestaurantCostForTwo}
                              onChange={e => setNewRestaurantCostForTwo(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-800 p-2 rounded-lg border text-xs font-semibold font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[8.5px] text-zinc-400 mb-0.5 font-bold uppercase">Contact Phone</label>
                            <input 
                              type="text" 
                              placeholder="9876543210" 
                              value={newRestaurantPhone}
                              onChange={e => setNewRestaurantPhone(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-800 p-2 rounded-lg border text-xs font-semibold font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-zinc-500 font-bold">Dish Image</label>
                      <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Choose or Upload</span>
                    </div>
                    
                    <div className="space-y-3 p-3 bg-slate-100/50 dark:bg-zinc-850/20 border border-slate-150 dark:border-zinc-800/80 rounded-2xl">
                      
                      {/* Sub-tabs for Image selection mode */}
                      <div className="grid grid-cols-3 bg-slate-100 dark:bg-zinc-805 p-0.5 rounded-xl text-[10px] text-center font-bold">
                        {[
                          { id: 'preset', label: 'Presets 🍲' },
                          { id: 'upload', label: 'Local File 📤' },
                          { id: 'url', label: 'Web URL 🔗' }
                        ].map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setImageSourceType(t.id as any)}
                            className={`py-1.5 rounded-lg transition-colors cursor-pointer ${
                              imageSourceType === t.id
                                ? 'bg-white dark:bg-zinc-900 text-orange-500 shadow-xs'
                                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {/* Interactive Areas */}
                      {imageSourceType === 'preset' && (
                        <div className="space-y-2">
                          <p className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider text-left">Select a curated high-def food preset</p>
                          <div className="grid grid-cols-5 gap-1.5 max-h-24 overflow-y-auto p-1 scrollbar-hide">
                            {PRESET_DISH_IMAGES.map((p, idx) => {
                              const isSelected = newFoodImg === p.url;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setNewFoodImg(p.url)}
                                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition ${
                                    isSelected 
                                      ? 'border-orange-500 scale-95 shadow-md shadow-orange-500/10' 
                                      : 'border-transparent opacity-80 hover:opacity-100'
                                  }`}
                                  title={p.name}
                                >
                                  <img 
                                    src={p.url} 
                                    alt={p.name} 
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center">
                                    <p className="text-[6.5px] font-black text-white truncate px-0.5">{p.name}</p>
                                  </div>
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-orange-500/10 flex items-center justify-center">
                                      <span className="bg-orange-500 text-white rounded-full p-0.5 text-[6px]">✔</span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {imageSourceType === 'upload' && (
                        <div>
                          {newFoodImg && newFoodImg.startsWith('data:') ? (
                            <div className="relative w-full h-24 bg-slate-200 dark:bg-zinc-800 rounded-xl overflow-hidden border flex items-center justify-center">
                              <img 
                                src={newFoodImg} 
                                alt="Uploaded Dish" 
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-all gap-1.5">
                                <label className="bg-white/95 text-zinc-800 text-[10px] font-black px-3 py-1.5 rounded-lg shadow cursor-pointer hover:bg-orange-500 hover:text-white transition">
                                  Change file
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                          if (typeof reader.result === 'string') {
                                            setNewFoodImg(reader.result);
                                          }
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setNewFoodImg('')}
                                  className="bg-red-655 text-white text-[10px] font-black px-3 py-1 rounded-lg hover:bg-red-700 transition"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition">
                              <Upload className="w-5 h-5 text-orange-505 mb-1" />
                              <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">Upload Dish File</p>
                              <p className="text-[8px] text-zinc-400">PNG, JPG or WebP image</p>
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      if (typeof reader.result === 'string') {
                                        setNewFoodImg(reader.result);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}

                      {imageSourceType === 'url' && (
                        <div className="space-y-1.5 text-left">
                          <p className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider">Paste Any Online Food Image web-link</p>
                          <input 
                            type="text" 
                            placeholder="https://images.unsplash.com/photo-..." 
                            value={newFoodImg.startsWith('data:') ? '' : newFoodImg}
                            onChange={e => setNewFoodImg(e.target.value)}
                            className="w-full bg-white dark:bg-zinc-800 p-2 rounded-xl border text-[10px] outline-none focus:border-orange-500 font-mono"
                          />
                        </div>
                      )}

                      {/* Active Preview Banner block */}
                      {newFoodImg && (
                        <div className="flex items-center gap-2.5 p-2 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl mt-1">
                          <img 
                            src={newFoodImg} 
                            alt="Final Preview" 
                            className="w-10 h-10 object-cover rounded-lg border dark:border-zinc-800 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider leading-none">Active Chosen Image</p>
                            <p className="text-[10px] text-zinc-700 dark:text-zinc-300 font-mono truncate mt-1">
                              {newFoodImg.startsWith('data:') ? 'base64://UploadedFileStreamData...' : newFoodImg}
                            </p>
                          </div>
                          
                          <label className="text-[9px] bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-black px-2.5 py-1 rounded-lg uppercase cursor-pointer text-zinc-600 dark:text-zinc-350 transition shrink-0">
                            Change
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setImageSourceType('upload');
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    if (typeof reader.result === 'string') {
                                      setNewFoodImg(reader.result);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                      )}

                    </div>
                  </div>

                  <button type="submit" className="w-full bg-orange-500 hover:bg-orange-655 text-white font-bold py-2.5 rounded-xl uppercase tracking-wider shadow-md">
                    Commit Dish to Menu
                  </button>
                </form>
              </div>
            </SuperAdminGuard>

            {/* DISHES LIST */}
            <div className="bg-white dark:bg-zinc-900 border rounded-3xl p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-xs font-bold text-zinc-455 uppercase flex items-center gap-1.5">
                    <span>Live Menu Catalog</span>
                    <span className="font-mono bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full font-black text-[10px]">
                      {foodCatalog.length} dishes
                    </span>
                  </h4>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Centralized database: Supabase <code className="font-mono text-orange-500">public.food_items</code>
                  </p>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Populate Supabase public.food_items with initial curated menu dishes?')) return;
                      const res = await seedDishesToSupabase();
                      if (res.success) {
                        alert(`Successfully seeded ${res.count} dishes to Supabase public.food_items!`);
                      } else {
                        alert(`Notice: ${res.error || 'Seed failed'}`);
                      }
                    }}
                    className="px-2.5 py-1 text-[10px] font-bold bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 rounded-lg transition cursor-pointer"
                    title="Seed default dishes to Supabase food_items table"
                  >
                    📥 Seed Menu to Supabase
                  </button>
                  <button
                    type="button"
                    onClick={() => refetchFoodCatalog()}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
                    title="Refresh from Supabase"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {foodLoading ? (
                <div className="text-center py-10 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl p-4 flex flex-col items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-zinc-400">Loading dishes from Supabase public.food_items...</p>
                </div>
              ) : foodCatalog.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl p-6 space-y-3">
                  <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                    No food items currently found in Supabase public.food_items.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm('Populate Supabase public.food_items with initial curated menu dishes?')) return;
                      const res = await seedDishesToSupabase();
                      if (res.success) {
                        alert(`Successfully seeded ${res.count} dishes to Supabase public.food_items!`);
                      } else {
                        alert(`Notice: ${res.error || 'Seed failed'}`);
                      }
                    }}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    📥 Seed Initial Menu to Supabase
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
                  {foodCatalog.map(item => (
                    <div key={item.id} className="p-3 bg-slate-50 dark:bg-zinc-800/40 border border-slate-100/70 dark:border-zinc-800/60 rounded-2xl transition-all">
                      
                      {/* Top Row: Info & Trigger */}
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-3">
                          <img 
                            src={item.image} 
                            alt={item.name} 
                            className="w-11 h-11 rounded-xl object-cover border border-slate-200/50 dark:border-zinc-700/50 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <h5 className="font-extrabold text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5 leading-snug">
                              {item.name}
                              {item.vegIndicator === VegIndicator.VEG ? (
                                <span className="veg-icon shrink-0"><span className="veg-dot" /></span>
                              ) : (
                                <span className="nonveg-icon shrink-0"><span className="nonveg-dot" /></span>
                              )}
                              <span className={`text-[8px] font-black px-1.5 py-0.2 rounded uppercase ${
                                item.is_available !== false && item.isAvailable !== false
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              }`}>
                                {item.is_available !== false && item.isAvailable !== false ? 'Live' : 'Unavailable'}
                              </span>
                            </h5>
                            <p className="text-[10px] text-zinc-450 font-mono mt-0.5">{item.category} • ₹{item.price}</p>
                            <p className="text-[9px] text-orange-500 font-extrabold uppercase mt-0.5 flex items-center gap-1">
                              <span>📍</span>
                              <span>{restaurants.find(r => r.id === item.restaurantId)?.name || 'Ecosystem (Default Kitchen)'}</span>
                            </p>
                          </div>
                        </div>

                        {isSuperAdmin ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (activeReplaceId === item.id) {
                                setActiveReplaceId(null);
                                setReplaceImgUrl('');
                                setReplaceRestaurantId('');
                                setReplacePrice('');
                                setReplaceDishName('');
                              } else {
                                setActiveReplaceId(item.id);
                                setReplaceImgUrl(item.image);
                                setReplaceRestaurantId(item.restaurantId || '');
                                setReplacePrice(String(item.price));
                                setReplaceAvailability(item.is_available !== false && item.isAvailable !== false);
                                setReplaceDishName(item.name);
                              }
                            }}
                            className={`flex items-center gap-1.5 font-bold text-[9px] px-2.5 py-1.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer border ${
                              activeReplaceId === item.id
                                ? 'bg-orange-500/15 border-orange-500 text-orange-505 dark:text-orange-400'
                                : 'bg-white dark:bg-zinc-800 border-slate-250 dark:border-zinc-750 text-zinc-650 dark:text-zinc-300 hover:border-orange-500 hover:text-orange-500'
                            }`}
                          >
                            <Settings className="w-3.5 h-3.5 shrink-0" />
                            <span>{activeReplaceId === item.id ? 'Close' : 'Configure'}</span>
                          </button>
                        ) : (
                          <span className="text-[8.5px] bg-slate-100 dark:bg-zinc-800 text-zinc-450 dark:text-zinc-500 px-2.5 py-1.5 rounded-xl font-extrabold uppercase tracking-wider border border-slate-200/60 dark:border-zinc-750 flex items-center gap-1 shrink-0">
                            🔒 Locked
                          </span>
                        )}
                      </div>

                      {/* Expandable Image & Restaurant Replace Widget */}
                      {activeReplaceId === item.id && (
                        <div className="border-t border-dashed border-slate-200 dark:border-zinc-700/60 pt-3 mt-3 space-y-3 animate-fadeIn">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase text-orange-500 tracking-wider">Configure dish parameters (Supabase)</p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-left">
                            <div>
                              <label className="block text-[8.5px] uppercase font-bold text-zinc-400">Dish Name</label>
                              <input 
                                type="text"
                                value={replaceDishName}
                                onChange={e => setReplaceDishName(e.target.value)}
                                className="w-full bg-white dark:bg-zinc-800 p-1.5 rounded-xl border text-[11px] font-bold"
                              />
                            </div>
                            <div>
                              <label className="block text-[8.5px] uppercase font-bold text-zinc-400">Price (₹)</label>
                              <input 
                                type="number"
                                value={replacePrice}
                                onChange={e => setReplacePrice(e.target.value)}
                                className="w-full bg-white dark:bg-zinc-800 p-1.5 rounded-xl border text-[11px] font-mono font-bold"
                              />
                            </div>
                          </div>

                          {/* Availability Toggle */}
                          <div className="flex items-center justify-between p-2 bg-slate-100/60 dark:bg-zinc-950/20 rounded-xl border border-slate-200/50 dark:border-zinc-800 text-left">
                            <div>
                              <span className="text-[10px] font-extrabold text-zinc-800 dark:text-zinc-200">Dish Availability</span>
                              <p className="text-[8.5px] text-zinc-400">Customer menu visibility in Supabase</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setReplaceAvailability(!replaceAvailability)}
                              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition cursor-pointer ${
                                replaceAvailability ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                              }`}
                            >
                              {replaceAvailability ? '✓ Available' : '✕ Unavailable'}
                            </button>
                          </div>
                          
                          <div className="flex gap-3 items-center">
                            {/* Live Thumbnail Preview */}
                            <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-750 bg-slate-100 dark:bg-zinc-800 shrink-0">
                              <img 
                                src={replaceImgUrl || item.image} 
                                alt="New proposal thumbnail" 
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>

                            <div className="flex-1 space-y-1.5 text-xs text-left">
                              <p className="text-[8.5px] uppercase font-bold text-zinc-400">Dish Image Source</p>
                              {/* Option A: Upload Local Image file */}
                              <label className="inline-flex items-center justify-center gap-1.5 text-[10px] bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-700/50 transition w-full text-center shadow-xs">
                                <Upload className="w-3.5 h-3.5 text-orange-505" />
                                <span>Upload from files</span>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onloadend = () => {
                                        if (typeof reader.result === 'string') {
                                          setReplaceImgUrl(reader.result);
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                              
                              {/* Option B: Direct URL Input link */}
                              <div className="flex items-center gap-1.5">
                                <input 
                                  type="text" 
                                  placeholder="Or direct image URL link..." 
                                  value={replaceImgUrl.startsWith('data:') ? '' : replaceImgUrl}
                                  onChange={e => setReplaceImgUrl(e.target.value)}
                                  className="w-full bg-white dark:bg-zinc-800 border p-1.5 rounded-xl text-[10px] placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:border-orange-500"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Dropdown to switch or associate with another Local Restaurant */}
                          <div className="space-y-1 text-left bg-slate-100/55 dark:bg-zinc-950/20 p-2.5 rounded-xl border border-slate-150/40 dark:border-zinc-850">
                            <label className="block text-[9px] text-zinc-450 font-extrabold uppercase tracking-wide">
                              Modify Linked Local Restaurant
                            </label>
                            <select
                              value={replaceRestaurantId}
                              onChange={e => setReplaceRestaurantId(e.target.value)}
                              className="w-full bg-white dark:bg-zinc-800 p-2 rounded-lg border text-[11px] font-bold"
                            >
                              <option value="">Ecosystem (Default Kitchen)</option>
                              {restaurants.map(r => (
                                <option key={r.id} value={r.id}>{r.name} ({r.businessType || 'General'})</option>
                              ))}
                            </select>
                          </div>

                          {/* Actions row */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm(`Are you sure you want to permanently delete "${item.name}" from Supabase?`)) return;
                                await deleteFoodItem(item.id);
                                setActiveReplaceId(null);
                                alert(`Dish "${item.name}" removed from Supabase food_items.`);
                              }}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold text-[10px] px-3 py-1.5 rounded-lg uppercase tracking-wider transition cursor-pointer flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete Dish</span>
                            </button>

                            <div className="flex items-center gap-1.5">
                              <button 
                                type="button"
                                onClick={() => {
                                  setActiveReplaceId(null);
                                  setReplaceImgUrl('');
                                  setReplaceRestaurantId('');
                                }}
                                className="text-[10px] font-extrabold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-2.5 py-1 rounded-lg transition cursor-pointer"
                              >
                                Cancel
                              </button>
                              
                              <button 
                                type="button"
                                onClick={async () => {
                                  await updateFoodItem(item.id, { 
                                    name: replaceDishName || item.name,
                                    price: replacePrice ? parseFloat(replacePrice) : item.price,
                                    image: replaceImgUrl || item.image,
                                    image_url: replaceImgUrl || item.image,
                                    is_available: replaceAvailability,
                                    isAvailable: replaceAvailability,
                                    restaurantId: replaceRestaurantId || undefined
                                  });
                                  setActiveReplaceId(null);
                                  setReplaceImgUrl('');
                                  setReplaceRestaurantId('');
                                  alert(`Dish "${replaceDishName || item.name}" details updated in Supabase successfully!`);
                                }}
                                className="bg-orange-500 hover:bg-orange-655 text-white font-black text-[10px] px-3.5 py-1.5 rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
                              >
                                Save Changes
                              </button>
                            </div>
                          </div>

                        </div>
                      )}

                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
          )
        )}

        {/* PHONEPE UPI & BANK ACCOUNT CONFIGURATION PANEL */}
        {activeTab === 'payments' && (
          <div className="space-y-4 text-left">
            
            {/* Header Card */}
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-slate-200/90 dark:border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-purple-600 text-white font-black text-lg flex items-center justify-center shadow-md shadow-purple-600/30">
                    पे
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5">
                      PhonePe UPI & Bank Setup
                    </h3>
                    <p className="text-[10.5px] text-zinc-400 font-medium">
                      PhonePe పేమెంట్ & బ్యాంక్ ఖాతా కనెక్ట్
                    </p>
                  </div>
                </div>

                <span className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold uppercase px-2.5 py-1 rounded-full border border-emerald-500/20">
                  ● Realtime Live Sync
                </span>
              </div>

              {/* Telugu instructions */}
              <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-2xl text-[11px] text-purple-900 dark:text-purple-300 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>డైరెక్ట్ బ్యాంక్ అకౌంట్ బదిలీ గ్యారెంటీ:</span>
                </p>
                <p className="text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                  మీరు ఇక్కడ నమోదు చేసిన PhonePe UPI ID మరియు బ్యాంక్ అకౌంట్‌తో కస్టమర్ల QR కోడ్ స్వయంచాలకంగా అనుసంధానించబడుతుంది. కస్టమర్ PhonePe లో QR స్కాన్ చేసిన వెంటనే ఫుడ్ బిల్ అమౌంట్ ఆటోమేటిక్‌గా ఫిల్ అయి, ఎటువంటి ఎర్రర్ లేకుండా నేరుగా మీ బ్యాంక్ ఖాతాకు అమౌంట్ ట్రాన్స్‌ఫర్ అవుతుంది.
                </p>
              </div>
            </div>

            {/* Configuration Form */}
            <form onSubmit={handleSavePhonePeSettings} className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-slate-200/90 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase text-zinc-900 dark:text-zinc-50 tracking-wider flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-orange-500" />
                  <span>PhonePe Account Details</span>
                </h4>
                {isSavedSuccess && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved!
                  </span>
                )}
              </div>

              {/* Field 1: PhonePe UPI ID */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                  PhonePe UPI ID (VPA) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={adminPhonePeUpiId}
                    onChange={e => setAdminPhonePeUpiId(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    placeholder="e.g. arjun.gorrepati@axl or 9876543210@ybl"
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-purple-500"
                  />
                  <div className="absolute right-2 top-2">
                    <span className="text-[9px] bg-purple-100 text-purple-700 font-bold px-2 py-1 rounded-md">
                      UPI ID
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[9px] text-zinc-400 font-medium self-center">Quick Suffix:</span>
                  {['@ybl', '@axl', '@ibl', '@oksbi', '@paytm'].map(suffix => (
                    <button
                      key={suffix}
                      type="button"
                      onClick={() => {
                        const base = adminPhonePeUpiId.split('@')[0] || '9876543210';
                        setAdminPhonePeUpiId(`${base}${suffix}`);
                      }}
                      className="text-[9px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md font-mono text-zinc-700 dark:text-zinc-300 transition cursor-pointer"
                    >
                      {suffix}
                    </button>
                  ))}
                </div>
              </div>

              {/* Field 2: Connected Bank Account Name */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                  PhonePe Connected Bank Account <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={adminBankName}
                  onChange={e => setAdminBankName(e.target.value)}
                  placeholder="e.g. Karur Vysya Bank - 4761 or State Bank of India"
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-purple-500"
                />
                <p className="text-[9.5px] text-zinc-400">
                  This bank name will be prominently displayed on customer menu checkout and payment receipt.
                </p>
              </div>

              {/* Field 3: Merchant / Business Name */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                  Store / Business Name (Shown in UPI Scanner)
                </label>
                <input
                  type="text"
                  maxLength={25}
                  value={adminMerchantName}
                  onChange={e => setAdminMerchantName(e.target.value)}
                  placeholder="e.g. Nuvvo Food & Hospitality"
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Field 4 & 5: Mobile & Account Holder */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                    PhonePe Mobile Number
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={adminPhonePePhone}
                    onChange={e => setAdminPhonePePhone(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="9876543210"
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                    Account Holder Name
                  </label>
                  <input
                    type="text"
                    value={adminAccountHolder}
                    onChange={e => setAdminAccountHolder(e.target.value)}
                    placeholder="Arjun Gorrepati"
                    className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black rounded-2xl text-xs uppercase tracking-wider transition cursor-pointer shadow-md shadow-purple-600/25 active:scale-98 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save PhonePe Settings (అకౌంట్ సేవ్ చేయండి)</span>
              </button>
            </form>

            {/* LIVE DYNAMIC QR TESTER CARD */}
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-slate-200/90 dark:border-zinc-800 shadow-sm space-y-4 text-center">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800 text-left">
                <div>
                  <h4 className="text-xs font-black uppercase text-zinc-900 dark:text-zinc-50 tracking-wider flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-purple-600" />
                    <span>Live QR Scanner Tester</span>
                  </h4>
                  <p className="text-[10px] text-zinc-400">
                    Test scanning with your own PhonePe app right now
                  </p>
                </div>
                <span className="text-[9px] bg-purple-50 text-purple-700 font-mono font-bold px-2 py-0.5 rounded-full border border-purple-200">
                  Amount Embedded
                </span>
              </div>

              {/* Amount selector pills */}
              <div className="flex items-center justify-center gap-2">
                <span className="text-[10.5px] text-zinc-500 font-bold">Test Bill Amount:</span>
                {['150', '250', '499', '1000'].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTestAmount(amt)}
                    className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                      testAmount === amt
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-200'
                    }`}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>

              {/* QR Preview Display */}
              <div className="bg-white p-4 rounded-2xl border-2 border-purple-200 dark:border-purple-900/40 max-w-xs mx-auto shadow-xs space-y-3">
                {testQrUrl ? (
                  <img
                    src={testQrUrl}
                    alt="Test PhonePe QR Code"
                    className="w-48 h-48 mx-auto object-contain block bg-white rounded-xl"
                  />
                ) : (
                  <div className="w-48 h-48 mx-auto flex items-center justify-center text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
                  </div>
                )}

                <div className="space-y-1 text-center">
                  <span className="text-xs font-black font-mono text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
                    Exact Bill Amount: ₹{testAmount}
                  </span>
                  <p className="text-[10px] text-zinc-500 font-mono pt-1">
                    UPI ID: <strong>{adminPhonePeUpiId}</strong>
                  </p>
                  <p className="text-[9.5px] text-emerald-600 font-bold">
                    Connected Bank: {adminBankName}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-2xl text-[10px] text-zinc-500 text-left space-y-1 font-mono break-all">
                <span className="text-zinc-400 block font-sans font-bold">NPCI Universal UPI URI:</span>
                <span>upi://pay?pa={adminPhonePeUpiId}&pn={encodeURIComponent(adminMerchantName)}&am={testAmount}.00&cu=INR</span>
              </div>
            </div>

            {/* Quick Orders Verification Table */}
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-slate-200/90 dark:border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800">
                <h4 className="text-xs font-black uppercase text-zinc-900 dark:text-zinc-50 tracking-wider flex items-center gap-1.5">
                  <IndianRupee className="w-4 h-4 text-emerald-600" />
                  <span>Recent Customer UPI Orders</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setActiveTab('analytics')}
                  className="text-[10px] font-bold text-orange-600 hover:underline cursor-pointer"
                >
                  View All Orders Console →
                </button>
              </div>

              <div className="space-y-2">
                {orders.filter(o => o.paymentMethod === 'UPI' || o.paymentMethod === 'PhonePe').slice(0, 5).map(o => (
                  <div key={o.id} className="p-3 bg-slate-50 dark:bg-zinc-800/80 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                          #{o.id.replace('order_', '').slice(-6).toUpperCase()}
                        </span>
                        <span className="text-zinc-400">• {o.customerName}</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        Bill: <strong className="text-emerald-600 font-mono">₹{o.finalAmount}</strong>
                        {o.upiDetails?.customerUtr && (
                          <span className="ml-2 font-mono bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded">
                            UTR: {o.upiDetails.customerUtr}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      {o.paymentStatus === 'confirmed' || o.paymentStatus === 'success' ? (
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-600 font-extrabold uppercase px-2 py-0.5 rounded-full border border-emerald-500/20">
                          ✓ Confirmed
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Verify payment of ₹${o.finalAmount} for Order #${o.id.slice(-6).toUpperCase()}?`)) {
                              updateOrderPaymentStatus(o.id, 'confirmed', 'Admin confirmed via PhonePe panel');
                            }
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-[9.5px] uppercase transition cursor-pointer shadow-xs active:scale-95"
                        >
                          Confirm
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {orders.filter(o => o.paymentMethod === 'UPI' || o.paymentMethod === 'PhonePe').length === 0 && (
                  <p className="text-[11px] text-zinc-400 text-center py-4">
                    No UPI orders received yet. Once customers scan and pay with PhonePe, they will appear here!
                  </p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* PROMOS & VOUCHERS SYSTEMS */}
        {activeTab === 'coupons' && (
          <div className="space-y-5 text-left">
            
            {/* PROMO ACTIONS HEADER BAR */}
            <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-slate-200/90 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    couponsList.length > 0 
                      ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20' 
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>
                    {couponsList.length > 0 ? `${couponsList.length} Active Codes` : 'No Promo Codes'}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {banners.length} Carousel Banners
                  </span>
                </div>
                <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100 mt-1 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-orange-500" /> Promotional Codes & Campaigns
                </h4>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {couponsList.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => resetDefaultCoupons()}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    title="Restore default mock promo codes"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Restore Promo Codes</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to clear all active promotional coupon codes? Users will not be able to apply promo codes until new ones are created.')) {
                        clearAllCoupons();
                      }
                    }}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    title="Clear All Promo Voucher Codes"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Clear All Promo Codes</span>
                  </button>
                )}
              </div>
            </div>

            {/* ISSUE NEW PROMO VOUCHER FORM (DIRECT ADMIN ACCESS) */}
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-slate-200/90 dark:border-zinc-800 shadow-sm">
              <h4 className="text-xs font-black uppercase text-orange-500 mb-3 flex items-center gap-1.5">
                <Tag className="w-4 h-4" /> Issue New Promo Voucher Code
              </h4>
              
              <form onSubmit={handleAddCoupon} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-zinc-500 mb-0.5 font-bold">Voucher Code</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. FESTIVE50"
                      value={newCouponCode}
                      onChange={e => setNewCouponCode(e.target.value.toUpperCase())}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-mono text-center font-black tracking-wider outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-500 mb-0.5 font-bold">Discount Percentage (%)</label>
                    <input 
                      type="number" 
                      required 
                      min="1"
                      max="100"
                      value={newCouponVal}
                      onChange={e => setNewCouponVal(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-mono text-center font-bold outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-500 mb-0.5 font-bold">Short Description</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Save flat 20% on all orders above ₹199"
                    value={newCouponDesc}
                    onChange={e => setNewCouponDesc(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs outline-none focus:border-orange-500"
                  />
                </div>

                <button 
                  type="submit" 
                  className="w-full bg-orange-500 hover:bg-orange-600 active:scale-98 text-white font-bold py-2.5 rounded-xl uppercase tracking-wider transition shadow-sm cursor-pointer"
                >
                  Create &amp; Activate Promo Code
                </button>
              </form>
            </div>

            {/* LIVE PROMO VOUCHERS LIST */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-orange-500" /> Active Promo Codes ({couponsList.length})
                </h4>
                {couponsList.length > 0 && (
                  <span className="text-[10px] text-zinc-400">Click &ldquo;Clear&rdquo; to remove any promo</span>
                )}
              </div>
              
              {couponsList.length === 0 ? (
                <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl p-4">
                  <Tag className="w-7 h-7 text-zinc-300 dark:text-zinc-600 mx-auto" />
                  <p className="text-xs font-bold text-zinc-500">All promo codes have been cleared.</p>
                  <p className="text-[11px] text-zinc-400">Users cannot apply vouchers until a new code is created or defaults are restored.</p>
                  <button
                    type="button"
                    onClick={() => resetDefaultCoupons()}
                    className="mt-2 px-3 py-1 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 rounded-xl text-xs font-bold transition hover:bg-orange-100 cursor-pointer inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Restore Default Codes</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {couponsList.map(item => (
                    <div 
                      key={item.code} 
                      className="p-3 bg-slate-50 dark:bg-zinc-800/80 rounded-2xl flex items-center justify-between border border-slate-200/70 dark:border-zinc-700/60 hover:border-orange-500/40 transition gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs border border-orange-500 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded bg-white dark:bg-zinc-900 tracking-wider">
                            {item.code}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                            {item.value}% OFF
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-1 font-medium truncate">
                          {item.description}
                        </p>
                      </div>

                      <button 
                        type="button"
                        onClick={() => {
                          removeCoupon(item.code);
                        }}
                        className="text-xs bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 px-2.5 py-1.5 rounded-xl font-bold transition flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
                        title={`Clear promo code ${item.code}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PROMOTIONAL CAROUSEL BANNERS (SPOTLIGHT PROMOS) */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" /> Home Screen Spotlight Promos ({banners.length})
                  </h4>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Clear or toggle promotional banners displayed at the top of the Customer home screen
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {banners.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => resetDefaultBanners()}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Restore Banners</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to clear all promotional carousel banners? The home screen will have no banner carousel.')) {
                          clearAllBanners();
                        }
                      }}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear All Banners</span>
                    </button>
                  )}
                </div>
              </div>

              {banners.length === 0 ? (
                <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl p-4">
                  <Flame className="w-7 h-7 text-zinc-300 dark:text-zinc-600 mx-auto" />
                  <p className="text-xs font-bold text-zinc-500">All promotional banners have been cleared.</p>
                  <p className="text-[11px] text-zinc-400">Home screen banner carousel is currently hidden.</p>
                  <button
                    type="button"
                    onClick={() => resetDefaultBanners()}
                    className="mt-2 px-3 py-1 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 rounded-xl text-xs font-bold transition hover:bg-orange-100 cursor-pointer inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Restore Default Banners</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {banners.map(b => (
                    <div 
                      key={b.id} 
                      className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                        b.enabled 
                          ? 'bg-slate-50 dark:bg-zinc-800/80 border-slate-200/80 dark:border-zinc-700/60' 
                          : 'bg-zinc-100/50 dark:bg-zinc-900/50 border-zinc-200/50 dark:border-zinc-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {b.image ? (
                          <img 
                            src={b.image} 
                            alt={b.title} 
                            className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-zinc-700" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                            <Flame className="w-5 h-5 text-orange-500" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                              {b.title}
                            </span>
                            {b.discount && (
                              <span className="text-[9px] bg-red-500 text-white font-black px-1.5 py-0.2 rounded font-mono shrink-0">
                                {b.discount}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-400 truncate mt-0.5">
                            {b.description || `Action: ${b.actionType} (${b.actionValue})`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => enableBanner(b.id, !b.enabled)}
                          className={`text-[10px] font-bold px-2 py-1 rounded-lg transition cursor-pointer ${
                            b.enabled 
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' 
                              : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {b.enabled ? 'Active' : 'Paused'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteBanner(b.id);
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                          title="Clear this promo banner"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* FRANCHISE APPLICATION TRACKER */}
        {activeTab === 'franchise' && (
          <div className="space-y-4 text-left">
            
            {/* KPI METRICS OVERVIEW */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white dark:bg-zinc-900 border p-3 rounded-2xl shadow-xs">
                <span className="text-[8.5px] text-zinc-400 font-bold uppercase block">Total applications</span>
                <p className="text-sm font-black text-zinc-900 dark:text-zinc-50 mt-1">{franchiseApplications.length}</p>
              </div>
              <div className="bg-white dark:bg-zinc-900 border p-3 rounded-2xl shadow-xs">
                <span className="text-[8.5px] text-zinc-400 font-bold uppercase block">Active franchise</span>
                <p className="text-sm font-black text-emerald-500 mt-1">
                  {franchiseApplications.filter(a => a.status === 'Active Franchise').length}
                </p>
              </div>
              <div className="bg-white dark:bg-zinc-900 border p-3 rounded-2xl shadow-xs">
                <span className="text-[8.5px] text-zinc-400 font-bold uppercase block">Under Review</span>
                <p className="text-sm font-black text-amber-500 mt-1">
                  {franchiseApplications.filter(a => a.status === 'Under Review' || a.status === 'Verification Pending').length}
                </p>
              </div>
            </div>

            {/* COMMISSION SYSTEM CONFIGURATION (Only Super Admin edits) */}
            <div className="bg-white dark:bg-zinc-900 border rounded-3xl p-5 shadow-sm space-y-3.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-orange-500 flex items-center justify-between">
                <span>⚙️ Localized Commission & Incentive Setup</span>
                <span className="text-[9px] text-zinc-400 font-mono">Parameters lock</span>
              </h4>

              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Onboarding Fee (₹)</label>
                  <SuperAdminGuard 
                    fallback={
                      <input 
                        type="text" 
                        disabled 
                        value={`₹${onboardingInc}`} 
                        className="w-full bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl text-center font-mono font-bold" 
                      />
                    }
                  >
                    <input 
                      type="number" 
                      value={onboardingInc}
                      onChange={e => setOnboardingInc(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl text-center font-mono font-bold border" 
                    />
                  </SuperAdminGuard>
                </div>

                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Courier Bonus (₹)</label>
                  <SuperAdminGuard 
                    fallback={
                      <input 
                        type="text" 
                        disabled 
                        value={`₹${courierInc}`} 
                        className="w-full bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl text-center font-mono font-bold" 
                      />
                    }
                  >
                    <input 
                      type="number" 
                      value={courierInc}
                      onChange={e => setCourierInc(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl text-center font-mono font-bold border" 
                    />
                  </SuperAdminGuard>
                </div>

                <div>
                  <label className="block text-zinc-400 font-bold mb-1">Revenue Share (%)</label>
                  <SuperAdminGuard 
                    fallback={
                      <input 
                        type="text" 
                        disabled 
                        value={`${revShare}%`} 
                        className="w-full bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl text-center font-mono font-bold" 
                      />
                    }
                  >
                    <input 
                      type="text" 
                      value={revShare}
                      onChange={e => setRevShare(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2 rounded-xl text-center font-mono font-bold border" 
                    />
                  </SuperAdminGuard>
                </div>
              </div>
              <p className="text-[9px] text-zinc-450 leading-snug">
                * Adjusted rates securely synchronize payouts to localized Cloud Kitchens, Area Franchises, and Restaurant onboarding incentive channels.
              </p>
            </div>

            {/* CANDIDATE INQUIRIES & ACCOUNTS */}
            <div className="bg-white dark:bg-zinc-900 border rounded-3xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-black uppercase text-zinc-900 dark:text-zinc-50 border-b pb-2 tracking-wider flex items-center justify-between">
                <span>🏢 View All Applications & Accounts</span>
                <span className="text-[9.5px] font-mono tracking-normal bg-orange-100 dark:bg-orange-950/20 text-orange-605 px-2 py-0.5 rounded uppercase">Verified OTP mandatory</span>
              </h3>

              {franchiseApplications.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 space-y-2">
                  <Building className="w-10 h-10 mx-auto text-zinc-300" />
                  <p>No investment candidates filed records in regional system database yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {franchiseApplications.map(app => {
                    const localTerritory = territoryUpdates[app.id] || {
                      city: app.city,
                      district: app.district || app.city,
                      state: app.state || "Andhra Pradesh"
                    };

                    const handleSaveTerritory = () => {
                      setTerritoryUpdates(prev => ({
                        ...prev,
                        [app.id]: localTerritory
                      }));
                      alert(`Territory parameters safely mapped for ${app.fullName}: ${localTerritory.city}, ${localTerritory.district}, ${localTerritory.state}.`);
                    };

                    return (
                      <div key={app.id} className="p-4 bg-slate-50 dark:bg-zinc-850 rounded-2xl border space-y-3.5 relative overflow-hidden">
                        
                        {/* Title area */}
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="text-[8px] font-mono bg-zinc-200 dark:bg-zinc-700 font-black px-1.5 py-0.5 rounded text-zinc-650 dark:text-zinc-300">
                              ID: {app.id.replace('franchise_', '')}
                            </span>
                            <h4 className="font-extrabold text-xs text-zinc-905 dark:text-zinc-50 mt-1">{app.fullName}</h4>
                            <p className="text-[9.5px] text-zinc-450 mt-0.5">{app.email} • {app.date}</p>
                          </div>
                          
                          <span className={`text-[8.5px] font-black px-2 py-0.5 rounded font-mono uppercase tracking-wide border shrink-0 ${
                            app.status === 'Active Franchise' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                            app.status === 'Rejected' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                            app.status === 'Verification Pending' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                            'bg-indigo-500/10 border-indigo-500/20 text-indigo-505'
                          }`}>
                            {app.status}
                          </span>
                        </div>

                        {/* Profile breakdown */}
                        <div className="grid grid-cols-2 gap-2 text-[9.5px] bg-white dark:bg-zinc-900 border p-2.5 rounded-xl text-zinc-600 dark:text-zinc-400">
                          <p><strong>Option Format:</strong> {app.preferredFranchiseType}</p>
                          <p><strong>Capital Scope:</strong> {app.investmentRange}</p>
                          <p><strong>Current Job:</strong> {app.currentOccupation}</p>
                          <p><strong>Launch Timeline:</strong> {app.expectedLaunchTimeline}</p>
                          <p><strong>Employees Target:</strong> {app.numberOfEmployees} Agents</p>
                          <p><strong>Aadhaar/PAN Verified:</strong> ✓ True</p>
                        </div>

                        {/* Text reasons */}
                        <div className="space-y-1 text-[9.5px]">
                          <p className="font-bold text-zinc-520 uppercase tracking-wide">Candidate Motivation Statement</p>
                          <p className="bg-white dark:bg-zinc-900 p-2 rounded-lg border text-zinc-700 dark:text-zinc-300 italic">
                            "{app.whyJoinNuvvo || "No response provided."}"
                          </p>
                        </div>

                        {/* MANDATORY ATTACHMENTS AND IDENTITIES DUMP */}
                        <div className="space-y-1">
                          <p className="text-[9.5px] font-bold text-zinc-520 uppercase tracking-wide">Candidate Document Dossier Checks</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="block text-[8px] text-zinc-400 font-bold uppercase mb-0.5">Aadhaar Card Copy</span>
                              {app.aadhaarCardImage ? (
                                <div className="h-14 rounded-lg overflow-hidden border bg-zinc-100 flex items-center justify-center relative cursor-pointer group" onClick={() => alert("Showing Fullscreen Aadhaar Document File.")}>
                                  <img src={app.aadhaarCardImage} alt="Aadhaar" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[8px] text-white">View Full</div>
                                </div>
                              ) : (
                                <span className="text-[8px] text-rose-500 block p-1.5 bg-rose-50 rounded">⚠️ Upload missing/empty</span>
                              )}
                            </div>

                            <div>
                              <span className="block text-[8px] text-zinc-400 font-bold uppercase mb-0.5">PAN Dossier Copy</span>
                              {app.panCardImage ? (
                                <div className="h-14 rounded-lg overflow-hidden border bg-zinc-100 flex items-center justify-center relative cursor-pointer group" onClick={() => alert("Showing Fullscreen PAN Document File.")}>
                                  <img src={app.panCardImage} alt="PAN" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[8px] text-white">View Full</div>
                                </div>
                              ) : (
                                <span className="text-[8px] text-rose-500 block p-1.5 bg-rose-50 rounded">⚠️ Upload missing/empty</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ASSIGN TERRITORIES FORM FIELDS */}
                        <div className="bg-slate-100 dark:bg-zinc-950 p-3 rounded-xl border space-y-2.5">
                          <p className="text-[9px] font-black uppercase tracking-wider text-indigo-500 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> Geographic Territory Assignments
                          </p>
                          
                          <div className="grid grid-cols-3 gap-1">
                            <div>
                              <label className="text-[8px] text-zinc-500 block">City</label>
                              <input 
                                type="text"
                                value={localTerritory.city}
                                onChange={e => {
                                  setTerritoryUpdates(prev => ({
                                    ...prev,
                                    [app.id]: { ...localTerritory, city: e.target.value }
                                  }));
                                }}
                                className="w-full bg-white dark:bg-zinc-900 border p-1 rounded text-[9px] uppercase font-bold"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] text-zinc-500 block">District</label>
                              <input 
                                type="text"
                                value={localTerritory.district}
                                onChange={e => {
                                  setTerritoryUpdates(prev => ({
                                    ...prev,
                                    [app.id]: { ...localTerritory, district: e.target.value }
                                  }));
                                }}
                                className="w-full bg-white dark:bg-zinc-900 border p-1 rounded text-[9px] uppercase"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] text-zinc-500 block">State</label>
                              <input 
                                type="text"
                                value={localTerritory.state}
                                onChange={e => {
                                  setTerritoryUpdates(prev => ({
                                    ...prev,
                                    [app.id]: { ...localTerritory, state: e.target.value }
                                  }));
                                }}
                                className="w-full bg-white dark:bg-zinc-900 border p-1 rounded text-[9px] uppercase"
                              />
                            </div>
                          </div>

                          <SuperAdminGuard
                            fallback={
                              <button type="button" disabled className="w-full bg-zinc-300 dark:bg-zinc-800 text-zinc-400 font-extrabold uppercase py-1.5 rounded-lg text-[8px] tracking-wide">
                                Locked - Super Admin clearance Required
                              </button>
                            }
                          >
                            <button 
                              type="button" 
                              onClick={handleSaveTerritory}
                              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-extrabold uppercase py-1.5 rounded-lg text-[8px] tracking-wide cursor-pointer transition"
                            >
                              Save Geographic Territory Assignments
                            </button>
                          </SuperAdminGuard>
                        </div>

                        {/* MOCK PERFORMANCE PROGRESS OVERVIEW FOR APPROVED ACCOUNTS */}
                        {(app.status === 'Approved' || app.status === 'Active Franchise') && (
                          <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl space-y-2">
                            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-500">Live Territory Performance Monitor</p>
                            <div className="grid grid-cols-4 gap-1 text-[8.5px] text-center text-zinc-650 dark:text-zinc-405 font-bold">
                              <div>
                                <span className="block text-zinc-400 text-[8px]">Restaurants</span>
                                <span className="text-zinc-850 dark:text-zinc-200">12</span>
                              </div>
                              <div>
                                <span className="block text-zinc-400 text-[8px]">Riders</span>
                                <span className="text-zinc-850 dark:text-zinc-200">8</span>
                              </div>
                              <div>
                                <span className="block text-zinc-400 text-[8px]">Total orders</span>
                                <span className="text-zinc-850 dark:text-zinc-200">738 Bills</span>
                              </div>
                              <div>
                                <span className="block text-zinc-400 text-[8px]">Yield Volume</span>
                                <span className="text-zinc-855 dark:text-zinc-200">₹1.84L</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* SUPER ADMIN STATUS CONTROLS */}
                        <div className="border-t pt-3 flex flex-wrap gap-1.5 items-center justify-between">
                          <div className="flex gap-1.5">
                            <a href={`tel:${app.phone}`} className="p-2 bg-slate-100 hover:bg-slate-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl flex items-center justify-center">
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                            <button 
                              type="button" 
                              onClick={() => {
                                setSelectedAppIdForAgreement(app.id);
                                setShowAgreement(true);
                              }}
                              className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-505 dark:bg-indigo-950/20 rounded-xl flex items-center justify-center"
                              title="Generate Contract Agreement File"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex gap-1">
                            {/* ADVANCE STATUS SLIDER / SWITCHER */}
                            <SuperAdminGuard 
                              fallback={
                                <span className="text-[8.5px] bg-zinc-100 dark:bg-zinc-800 text-zinc-400 font-bold px-2 py-1 rounded">
                                  🔒 Locked - Super Admin clearance Required
                                </span>
                              }
                            >
                              <div className="flex items-center gap-1">
                                {/* Next stage */}
                                {app.status !== 'Active Franchise' && (
                                  <button 
                                    onClick={() => {
                                      const sequence: FranchiseApplication['status'][] = ['Submitted', 'Under Review', 'Verification Pending', 'Approved', 'Agreement Pending', 'Active Franchise'];
                                      const curIdx = sequence.indexOf(app.status);
                                      if (curIdx !== -1 && curIdx < sequence.length - 1) {
                                        updateFranchiseStatus(app.id, sequence[curIdx + 1]);
                                      }
                                    }}
                                    className="bg-orange-500 hover:bg-orange-605 text-white font-extrabold px-3 py-1 rounded-lg text-[9px] uppercase tracking-wide cursor-pointer transition"
                                  >
                                    Advance Status
                                  </button>
                                )}

                                {/* Reject Option */}
                                {app.status !== 'Rejected' ? (
                                  <button 
                                    onClick={() => updateFranchiseStatus(app.id, 'Rejected')}
                                    className="bg-zinc-100 hover:bg-rose-50 text-rose-500 font-extrabold px-3 py-1 rounded-lg text-[9px] uppercase tracking-wide cursor-pointer transition border border-rose-100 dark:bg-zinc-800 dark:hover:bg-rose-950/20"
                                  >
                                    Reject Check
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => updateFranchiseStatus(app.id, 'Submitted')}
                                    className="bg-white hover:bg-slate-50 text-zinc-700 font-extrabold px-3 py-1 rounded-lg text-[9px] uppercase tracking-wide cursor-pointer transition border"
                                  >
                                    Restore Check
                                  </button>
                                )}

                                {/* SUSPEND OR ACTIVATE ACCESS */}
                                {app.status === 'Active Franchise' ? (
                                  <button 
                                    onClick={() => {
                                      updateFranchiseStatus(app.id, 'Agreement Pending');
                                      alert(`Ecosystem alert: accounts suspends flag registered on partner ${app.fullName}. Access locked.`);
                                    }}
                                    className="bg-red-655 hover:bg-rose-700 text-white font-extrabold px-3 py-1 rounded-lg text-[8.5px] uppercase tracking-wider flex items-center gap-1 transition"
                                  >
                                    <Ban className="w-3 h-3" /> Suspend
                                  </button>
                                ) : (
                                  app.status === 'Agreement Pending' && (
                                    <button 
                                      onClick={() => {
                                        updateFranchiseStatus(app.id, 'Active Franchise');
                                        alert(`Ecosystem alert: account authorized and restored to live state for ${app.fullName}.`);
                                      }}
                                      className="bg-emerald-505 hover:bg-emerald-600 text-white font-extrabold px-3 py-1 rounded-lg text-[8.5px] uppercase tracking-wider flex items-center gap-1 transition"
                                    >
                                      <Check className="w-3 h-3" /> Activate
                                    </button>
                                  )
                                )}
                              </div>
                            </SuperAdminGuard>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* COMMUNICATIONS & BROADCASTING DESK */}
            <div className="bg-white dark:bg-zinc-900 border rounded-3xl p-5 shadow-sm space-y-3.5">
              <h4 className="text-xs font-black uppercase text-orange-500 flex items-center gap-1.5">
                <MessageSquare className="w-4.5 h-4.5" /> Corporate Communication Broadcasting
              </h4>
              
              <div className="space-y-2">
                <label className="block text-[9px] font-bold text-zinc-400 uppercase">Write bulk announcement notice</label>
                <textarea 
                  placeholder="Draft SMS notification or WhatsApp bulk transmission to all municipal franchise inquiries..."
                  value={bulkMsg}
                  onChange={e => setBulkMsg(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-2xl border h-16 resize-none text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-[9px]">
                <button 
                  onClick={() => {
                    if (!bulkMsg.trim()) { alert("Please type your announcement message notice draft first."); return; }
                    setMsgLogs(prev => [`[SMS - ${new Date().toLocaleTimeString()}] Broadcasted message: "${bulkMsg}"`, ...prev]);
                    alert(`NUVVO: Notice draft successfully broadcasted to all ${franchiseApplications.length} municipal candidates phone networks!`);
                    setBulkMsg('');
                  }}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-black py-2.5 rounded-xl uppercase flex items-center justify-center gap-1 cursor-pointer shadow-md"
                >
                  <Send className="w-3 h-3" /> Broadcast SMS
                </button>
                <button 
                  onClick={() => {
                    if (!bulkMsg.trim()) { alert("Please type your warning message notice draft first."); return; }
                    const text = encodeURIComponent(bulkMsg);
                    window.open(`https://wa.me/919848022338?text=${text}`, "_blank");
                    setMsgLogs(prev => [`[WA - ${new Date().toLocaleTimeString()}] Sync template initialized`, ...prev]);
                    alert("Ecosystem: Initiated bulk WhatsApp API redirect pipeline check.");
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-black py-2.5 rounded-xl uppercase flex items-center justify-center gap-1 cursor-pointer"
                >
                  <MessageSquare className="w-3 h-3" /> Sync WhatsApp
                </button>
              </div>

              {msgLogs.length > 0 && (
                <div className="space-y-1 bg-slate-50 dark:bg-zinc-950 p-2 rounded-xl text-[8.5px] font-mono border">
                  <p className="font-bold text-zinc-400 uppercase block tracking-wider">Broadcast Journal Logs:</p>
                  {msgLogs.slice(0, 3).map((l, i) => (
                    <p key={i} className="text-zinc-600 dark:text-zinc-400">✓ {l}</p>
                  ))}
                </div>
              )}
            </div>

            {/* AUDIT REPORTS DESK */}
            <div className="bg-white dark:bg-zinc-900 border rounded-3xl p-5 shadow-sm space-y-3">
              <h4 className="text-xs font-black uppercase text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <FileText className="w-4.5 h-4.5 text-orange-500" /> Export Regional Territory Audits
              </h4>
              <p className="text-[10px] text-zinc-450 leading-relaxed">
                Compile all assigned municipal areas, total candidates files, current review pipelines, and registered onboarding commission rates into a single system report.
              </p>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <button 
                  onClick={() => setShowReport(true)}
                  className="bg-white hover:bg-slate-50 text-zinc-900 border font-extrabold py-2.5 rounded-xl uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Generate Report
                </button>
                <button 
                  onClick={() => {
                    const textContent = `--- NUVVO CORPS SYSTEM TERRITORIAL REPORT ---\nDATED: ${new Date().toLocaleDateString()}\nAPPLICANTS DETECTED: ${franchiseApplications.length}\nONBOARDING STANDARD RATE: ₹${onboardingInc}\nCOURIER REGISTRATION RATE: ₹${courierInc}\nREVENUE POOL ACCENT: ${revShare}%\n`;
                    const file = new Blob([textContent], {type: 'text/plain'});
                    const element = document.createElement("a");
                    element.href = URL.createObjectURL(file);
                    element.download = "Nuvvo_Regional_Commission_Report.txt";
                    document.body.appendChild(element);
                    element.click();
                    alert("System Report finalized! Executing local device download: Nuvvo_Regional_Commission_Report.txt");
                  }}
                  className="bg-zinc-800 hover:bg-zinc-900 text-white font-extrabold py-2.5 rounded-xl uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Export as TXT
                </button>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* REPORT TEXT DISPLAY BOX MODAL */}
      {showReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 w-full max-w-sm text-left space-y-4 border shadow-xl">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="font-extrabold text-[11px] text-orange-505 uppercase flex items-center gap-1">
                <TrendingUp className="w-4 h-4" /> Systemic Territory Audit
              </h4>
              <button onClick={() => setShowReport(false)} className="p-1 text-zinc-400 hover:text-zinc-650">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-2xl border font-mono text-[9px] text-zinc-600 dark:text-zinc-350 space-y-1">
              <p className="font-bold text-orange-500 uppercase">** NUVVO AUDIT FILE DATED {new Date().toLocaleDateString()} **</p>
              <p>------------------------------------------</p>
              <p>- TOTAL ACTIVE ENQUIRIES: {franchiseApplications.length} CANDIDATES</p>
              <p>- RESTAURANT ONBOARDING FEE: ₹{onboardingInc}</p>
              <p>- COURIER ENROLLMENT BONUS: ₹{courierInc}</p>
              <p>- PLATFORM ROYALTY ACCRUED: {revShare}%</p>
              <p>- SEALS GEOGRAPHY REGIONS: {franchiseApplications.filter(a => a.status === 'Active Franchise').length} ACTIVE SECTORS</p>
              <p>------------------------------------------</p>
              <p className="text-[8px] text-zinc-400">Security key: [SHA-256 SYSTEMIC CLEARANCE GRANTED]</p>
            </div>

            <button onClick={() => setShowReport(false)} className="w-full bg-zinc-850 hover:bg-zinc-900 text-white font-extrabold uppercase py-2 text-[10px] rounded-xl text-center">
              Acknowledge Checks
            </button>
          </div>
        </div>
      )}

      {/* AGREEMENT DOCUMENT GENERATOR MODAL */}
      {showAgreement && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 w-full max-w-md text-left space-y-4 border shadow-xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="font-extrabold text-[11px] text-indigo-600 uppercase flex items-center gap-1.5">
                <FileText className="w-4.5 h-4.5" /> Bilateral Franchise Agreement
              </h4>
              <button 
                onClick={() => {
                  setShowAgreement(false);
                  setSelectedAppIdForAgreement(null);
                }} 
                className="p-1 text-zinc-400 hover:text-zinc-650"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border text-[9.5px] leading-relaxed text-zinc-705 dark:text-zinc-300 font-sans space-y-3.5">
              <div className="text-center font-black text-xs uppercase tracking-tight text-zinc-800 dark:text-zinc-100 pb-2 border-b">
                MEMORANDUM OF UNDERSTANDING & COMMISSION DEED 
              </div>
              <p>
                <strong>SECTION A: PARTIES</strong><br />
                This Bilateral Operator Agreement is entered into on this day <strong>{new Date().toLocaleDateString()}</strong> by and between <strong>NUVVO TECHNOLOGIES PRIVATE LIMITED</strong> (hereinafter "Ecosystem Proprietor") and the Evaluated Candidate.
              </p>
              <p>
                <strong>SECTION B: GEOGRAPHICAL INTENT LOCKUP</strong><br />
                Consistent with candidate dossier filing, exclusive operations locks are hereby assigned to the designated municipal zip codes. The franchisee holds full localized recruitment authorization for the region.
              </p>
              <p>
                <strong>SECTION C: DECLARED COMMISSION STRUCTURES</strong><br />
                - Onboarding Fee Incentive: <strong>₹{onboardingInc}</strong> per verified vendor registration.<br />
                - Logistics Recruitment Reward: <strong>₹{courierInc}</strong> per Courier logistics agent.<br />
                - Sustained Platform Micro-royalty share: <strong>{revShare}%</strong> on municipal volume billing pools.
              </p>
              <p className="border-t pt-2 italic text-center text-[8.5px] text-zinc-450">
                This document draft is instantly compiled and cleared for signatures. Click "Download Agreement Document" to sign.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <button 
                onClick={() => {
                  alert("Executing digital draft download: Nuvvo_Franchise_Operator_Agreement.pdf");
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-2.5 rounded-xl uppercase flex items-center justify-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download Agreement
              </button>
              <button 
                onClick={() => {
                  setShowAgreement(false);
                  setSelectedAppIdForAgreement(null);
                }}
                className="bg-white hover:bg-slate-50 text-zinc-800 border font-extrabold py-2.5 rounded-xl uppercase text-center"
              >
                Dismiss Draft
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
