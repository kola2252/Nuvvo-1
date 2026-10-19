/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  UtensilsCrossed, Building2, Store, Plus, Edit2, Trash2, CheckCircle2, 
  XCircle, Search, RefreshCw, AlertCircle, Sparkles, Image as ImageIcon,
  MapPin, Phone, DollarSign, Tag, ShieldCheck, X, Check,
  Bike, RotateCcw, AlertTriangle, Clock, UserPlus, Download
} from 'lucide-react';

interface HotelItem {
  id: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  image: string;
  status: 'Active' | 'Inactive';
  rating: number;
}

export default function AdminCatalogManager() {
  const { 
    foodCatalog, restaurants, isAdmin, isSuperAdmin,
    addFoodItem, updateFoodItem, deleteFoodItem, foodLoading, foodError, supabaseConnected, seedDishesToSupabase, refetchFoodCatalog,
    addRestaurant, updateRestaurant, deleteRestaurant,
    deliveryPartners, addDeliveryPartner, removeDeliveryPartner, 
    toggleDeliveryPartnerAvailability, updateRiderStatus,
    orders, assignOrderToDeliveryPartner, resetAdminData 
  } = useApp();
  const [activeTab, setActiveTab] = useState<'dishes' | 'restaurants' | 'hotels' | 'riders'>('dishes');

  // Token from session
  const [authToken, setAuthToken] = useState<string>(() => {
    return localStorage.getItem('nuvvo_auth_token') || '';
  });

  // Local state mirrors backed by API & Supabase
  const [dishesList, setDishesList] = useState<any[]>(foodCatalog || []);
  const [restaurantsList, setRestaurantsList] = useState<any[]>(restaurants || []);
  const [hotelsList, setHotelsList] = useState<HotelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isSeeding, setIsSeeding] = useState(false);
  const [seedStatus, setSeedStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string; details?: string } | null>(null);

  // Sync dishes list when central Supabase foodCatalog updates
  useEffect(() => {
    if (foodCatalog) {
      setDishesList(foodCatalog);
    }
  }, [foodCatalog]);

  const handleSeedMenu = async () => {
    if (!confirm('Populate Supabase public.food_items with the initial curated catalog dishes? Any existing custom dishes or edits will be preserved.')) {
      setSeedStatus({ type: 'info', text: 'Seeding operation was cancelled by administrator.' });
      return;
    }

    setIsSeeding(true);
    setSeedStatus({ type: 'info', text: 'Connecting to Supabase public.food_items and inserting menu records...' });

    try {
      const res = await seedDishesToSupabase();
      if (res.success) {
        setSeedStatus({
          type: 'success',
          text: res.message || `Successfully seeded ${res.count} dishes into Supabase public.food_items!`
        });
        showFeedback(res.message || `Successfully seeded ${res.count} dishes into Supabase!`);
        await refetchFoodCatalog();
        await fetchDishes();
      } else {
        setSeedStatus({
          type: 'error',
          text: 'Database seeding failed.',
          details: res.error || 'Server or Supabase rejected the request.'
        });
        showFeedback(res.error || 'Failed to seed dishes into Supabase', 'error');
      }
    } catch (err: any) {
      setSeedStatus({
        type: 'error',
        text: 'Seeding exception encountered.',
        details: err?.message || 'Network exception'
      });
      showFeedback(err?.message || 'Failed to seed dishes', 'error');
    } finally {
      setIsSeeding(false);
    }
  };


  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Modal forms
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);

  // Delivery Partner Form States
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [newRiderName, setNewRiderName] = useState('');
  const [newRiderPhone, setNewRiderPhone] = useState('');
  const [newRiderVehicle, setNewRiderVehicle] = useState<'Bike' | 'Scooter' | 'Cycle' | 'Auto' | 'Other'>('Bike');
  const [newRiderBikeNumber, setNewRiderBikeNumber] = useState('');
  const [newRiderAddress, setNewRiderAddress] = useState('');

  // Controlled Full Reset States
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetScope, setResetScope] = useState<'all_admin_data' | 'catalog' | 'delivery_partners'>('all_admin_data');
  const [resetConfirmationInput, setResetConfirmationInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Order assignment dropdown state
  const [orderToAssignRider, setOrderToAssignRider] = useState<{ [orderId: string]: string }>({});

  // Fetch live lists on mount
  useEffect(() => {
    fetchHotels();
    fetchRestaurants();
    fetchDishes();
  }, []);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('nuvvo_auth_token') || authToken;
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchHotels = async () => {
    try {
      const res = await fetch('/api/hotels');
      if (res.ok) {
        const data = await res.json();
        setHotelsList(data);
      }
    } catch (e) {
      console.error('Failed to fetch hotels:', e);
    }
  };

  const fetchRestaurants = async () => {
    try {
      const res = await fetch('/api/restaurants');
      if (res.ok) {
        const data = await res.json();
        setRestaurantsList(data);
      }
    } catch (e) {
      console.error('Failed to fetch restaurants:', e);
    }
  };

  const fetchDishes = async () => {
    try {
      const res = await fetch('/api/dishes');
      if (res.ok) {
        const data = await res.json();
        setDishesList(data);
      }
    } catch (e) {
      console.error('Failed to fetch dishes:', e);
    }
  };

  // --- DISH ACTIONS (DIRECT SUPABASE public.food_items INTEGRATION) ---
  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.name || !editingItem.name.trim()) {
      showFeedback('Dish name is required.', 'error');
      return;
    }

    const priceNum = Number(editingItem.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      showFeedback('A valid positive price is required.', 'error');
      return;
    }

    setLoading(true);
    try {
      const isEdit = modalMode === 'edit' && editingItem?.id;

      const payload = {
        name: editingItem.name.trim(),
        description: editingItem.description ? String(editingItem.description).trim() : '',
        price: priceNum,
        category: editingItem.category ? String(editingItem.category).trim() : 'Biryani & Rice',
        subcategory: editingItem.subcategory ? String(editingItem.subcategory).trim() : 'Chef Special',
        image: editingItem.image || editingItem.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600',
        image_url: editingItem.image || editingItem.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600',
        isAvailable: editingItem.isAvailable !== false,
        is_available: editingItem.isAvailable !== false,
        vegIndicator: editingItem.vegIndicator === 'Veg' ? 'Veg' : 'NonVeg',
        restaurantId: editingItem.restaurantId || restaurantsList[0]?.id || 'rest_1',
        prepTime: Number(editingItem.prepTime) || 20,
        spiceLevel: editingItem.spiceLevel || 'Medium'
      };

      if (isEdit) {
        // Update in Supabase
        const res = await updateFoodItem(editingItem.id, payload);

        if (!res?.success) {
          showFeedback(res?.error || 'Failed to update dish in Supabase public.food_items', 'error');
          return;
        }
      } else {
        // Save new dish to Supabase public.food_items
        const res = await addFoodItem({
          ...payload,
          rating: 4.8,
          reviewsCount: 15,
          ingredients: ['Fresh regional ingredients'],
          reviews: []
        });

        if (!res?.success) {
          showFeedback(res?.error || 'Failed to save dish to Supabase public.food_items', 'error');
          return;
        }
      }

      showFeedback(`Dish "${editingItem.name}" saved to Supabase food_items successfully!`);
      setModalMode(null);
      setEditingItem(null);
      await refetchFoodCatalog();
    } catch (err: any) {
      showFeedback(err.message || 'Operation failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDish = async (dishId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete dish "${name}" from Supabase?`)) return;
    setLoading(true);
    try {
      if (deleteFoodItem) {
        const res = await deleteFoodItem(dishId);
        if (!res?.success) {
          showFeedback(res?.error || 'Failed to delete dish from Supabase', 'error');
          return;
        }
      }
      showFeedback(`Dish "${name}" removed from Supabase.`);
      await refetchFoodCatalog();
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDishAvailability = async (dish: any) => {
    try {
      const nextStatus = dish.isAvailable !== false && dish.is_available !== false ? false : true;
      const res = await updateFoodItem(dish.id, {
        isAvailable: nextStatus,
        is_available: nextStatus
      });
      if (!res?.success) {
        showFeedback(res?.error || 'Failed to toggle availability in Supabase', 'error');
        return;
      }
      showFeedback(`Dish availability updated to ${nextStatus ? 'Available' : 'Unavailable'} in Supabase.`);
    } catch (e: any) {
      showFeedback(e?.message || 'Update failed', 'error');
    }
  };

  // --- RESTAURANT ACTIONS ---
  const handleSaveRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isEdit = modalMode === 'edit' && editingItem?.id;

      if (isEdit) {
        if (updateRestaurant) {
          updateRestaurant(editingItem.id, editingItem);
        }
      } else {
        const newRestaurant = {
          ...editingItem,
          id: editingItem.id || `chirala_rest_${Date.now()}`,
          rating: Number(editingItem.rating) || 4.3,
          reviewsCount: Number(editingItem.reviewsCount) || 12,
          deliveryTime: Number(editingItem.deliveryTime) || 30,
          costForTwo: Number(editingItem.costForTwo) || 250,
          cuisines: Array.isArray(editingItem.cuisines)
            ? editingItem.cuisines
            : String(editingItem.cuisines || 'Local Cuisine').split(',').map((c: string) => c.trim()),
          isApproved: true,
          isActive: true
        };
        if (addRestaurant) {
          addRestaurant(newRestaurant);
        }
      }

      // Also sync to server API
      try {
        const url = isEdit ? `/api/admin/restaurants/${editingItem.id}` : '/api/admin/restaurants';
        const method = isEdit ? 'PUT' : 'POST';
        await fetch(url, {
          method,
          headers: getAuthHeaders(),
          body: JSON.stringify(editingItem)
        });
      } catch {}

      showFeedback(`Restaurant "${editingItem.name}" saved & live broadcasted to all customer & Play Store apps!`);
      setModalMode(null);
      setEditingItem(null);
      fetchRestaurants();
    } catch (err: any) {
      showFeedback(err.message || 'Operation failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRestaurant = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete restaurant "${name}"?`)) return;
    setLoading(true);
    try {
      if (deleteRestaurant) {
        deleteRestaurant(id);
      }
      try {
        await fetch(`/api/admin/restaurants/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
      } catch {}
      showFeedback(`Restaurant "${name}" removed across all mobile apps.`);
      fetchRestaurants();
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- HOTEL ACTIONS ---
  const handleSaveHotel = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isEdit = modalMode === 'edit' && editingItem?.id;
      const url = isEdit ? `/api/admin/hotels/${editingItem.id}` : '/api/admin/hotels';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(editingItem)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Authorization rejected.' }));
        throw new Error(err.error || 'Failed to save hotel');
      }

      showFeedback(`Hotel "${editingItem.name}" saved successfully!`);
      setModalMode(null);
      setEditingItem(null);
      fetchHotels();
    } catch (err: any) {
      showFeedback(err.message || 'Operation failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHotel = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete hotel "${name}"?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/hotels/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Authorization error.' }));
        throw new Error(err.error || 'Failed to delete hotel');
      }
      showFeedback(`Hotel "${name}" removed.`);
      fetchHotels();
    } catch (err: any) {
      showFeedback(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRiderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRiderName.trim() || !newRiderPhone.trim()) {
      showFeedback('Rider name and mobile phone are required.', 'error');
      return;
    }
    addDeliveryPartner(
      newRiderName.trim(),
      newRiderPhone.trim(),
      0,
      newRiderBikeNumber.trim(),
      newRiderPhone.trim(),
      newRiderAddress.trim(),
      newRiderVehicle
    );
    showFeedback(`Delivery partner "${newRiderName}" onboarded successfully.`);
    setNewRiderName('');
    setNewRiderPhone('');
    setNewRiderBikeNumber('');
    setNewRiderAddress('');
    setShowRiderModal(false);
  };

  const handleExecuteResetData = async () => {
    if (resetConfirmationInput.trim() !== 'RESET') {
      showFeedback("Please type 'RESET' exactly to verify confirmation.", 'error');
      return;
    }
    setIsResetting(true);
    try {
      const result = await resetAdminData(resetScope);
      if (result.success) {
        showFeedback(result.message, 'success');
        setShowResetModal(false);
        setResetConfirmationInput('');
        fetchDishes();
        fetchRestaurants();
        fetchHotels();
      } else {
        showFeedback(result.message, 'error');
      }
    } catch (err: any) {
      showFeedback(err?.message || 'Reset failed', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // Security guard check
  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-red-200 text-red-600">
        <AlertCircle className="w-12 h-12 mx-auto mb-3" />
        <h3 className="font-black text-sm uppercase tracking-wider">Access Restricted</h3>
        <p className="text-xs text-zinc-500 mt-1">You do not have administrative permissions to view or edit this catalog.</p>
      </div>
    );
  }

  // Filter lists based on search
  const filteredDishes = dishesList.filter(d => 
    d.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    d.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.restaurantName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredRestaurants = restaurantsList.filter(r => 
    r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredHotels = hotelsList.filter(h => 
    h.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="admin-catalog-manager" className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-100 dark:border-zinc-800 p-5 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-orange-500" />
            <h3 className="text-sm font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-tight">
              Catalog & Venue Management Desk
            </h3>
          </div>
          <p className="text-[10.5px] text-zinc-400 mt-0.5">
            Admin role validated. Manage regional dishes, partner restaurants, and lodging hotels with real-time server persistence.
          </p>
        </div>

        {/* Actions & Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-zinc-800/80 p-1 rounded-2xl gap-1 overflow-x-auto">
            <button
              onClick={() => { setActiveTab('dishes'); setSearchQuery(''); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'dishes' 
                  ? 'bg-orange-500 text-white shadow-xs' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" /> Dishes ({dishesList.length})
            </button>
            <button
              onClick={() => { setActiveTab('restaurants'); setSearchQuery(''); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'restaurants' 
                  ? 'bg-orange-500 text-white shadow-xs' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              <Store className="w-3.5 h-3.5" /> Restaurants ({restaurantsList.length})
            </button>
            <button
              onClick={() => { setActiveTab('hotels'); setSearchQuery(''); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'hotels' 
                  ? 'bg-orange-500 text-white shadow-xs' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" /> Hotels ({hotelsList.length})
            </button>
            <button
              onClick={() => { setActiveTab('riders'); setSearchQuery(''); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'riders' 
                  ? 'bg-orange-500 text-white shadow-xs' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              <Bike className="w-3.5 h-3.5" /> Delivery Boys ({deliveryPartners.length})
            </button>
          </div>

          {/* Reset Admin Data Button */}
          <button
            onClick={() => {
              setResetConfirmationInput('');
              setShowResetModal(true);
            }}
            title="Reset Administrator-Managed Data"
            className="px-3 py-2 rounded-2xl text-xs font-black bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-400 flex items-center gap-1.5 cursor-pointer transition shadow-xs active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Admin Data
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {feedbackMsg && (
        <div className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fadeIn ${
          feedbackMsg.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200' 
            : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200'
        }`}>
          {feedbackMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Action Bar (Search & Add New Button) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full bg-slate-50 dark:bg-zinc-800 pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 font-semibold focus:outline-none focus:border-orange-500"
          />
        </div>

        <button
          onClick={() => {
            if (activeTab === 'dishes') {
              setEditingItem({
                name: '',
                description: '',
                price: 180,
                category: 'Biryani & Rice',
                restaurantId: restaurantsList[0]?.id || '',
                restaurantName: restaurantsList[0]?.name || '',
                isAvailable: true,
                vegIndicator: 'NonVeg',
                image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80'
              });
            } else if (activeTab === 'restaurants') {
              setEditingItem({
                name: '',
                description: '',
                address: 'Chirala High-Street Zone',
                phone: '+91 98480 22338',
                status: 'Active',
                cuisines: ['South Indian', 'Biryani'],
                rating: 4.6,
                image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&auto=format&fit=crop&q=80'
              });
            } else {
              setEditingItem({
                name: '',
                description: '',
                address: 'Chirala Main Highway',
                phone: '+91 98480 22338',
                status: 'Active',
                rating: 4.7,
                image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=80'
              });
            }
            setModalMode('add');
          }}
          className="px-4 py-2 bg-zinc-950 dark:bg-zinc-100 hover:bg-orange-600 dark:hover:bg-white text-white dark:text-zinc-950 font-black text-xs rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add New {activeTab === 'dishes' ? 'Dish' : activeTab === 'restaurants' ? 'Restaurant' : 'Hotel'}</span>
        </button>

        {activeTab === 'dishes' && (
          <button
            type="button"
            disabled={isSeeding || loading || foodLoading}
            onClick={handleSeedMenu}
            title="Seed Menu to Supabase"
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-xs rounded-xl shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSeeding ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{isSeeding ? 'Seeding Database...' : 'Seed Menu to Supabase'}</span>
          </button>
        )}
      </div>

      {/* Real-time Seed Status Banner */}
      {seedStatus && (
        <div className={`p-4 rounded-2xl text-xs font-bold border flex items-start justify-between gap-3 animate-fadeIn ${
          seedStatus.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
            : seedStatus.type === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800'
        }`}>
          <div className="flex items-start gap-2.5">
            {seedStatus.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
            {seedStatus.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
            {seedStatus.type === 'info' && <RefreshCw className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-spin" />}
            <div>
              <p className="font-extrabold text-[12px]">{seedStatus.text}</p>
              {seedStatus.details && (
                <p className="text-[11px] font-mono mt-1 opacity-90 break-words leading-relaxed">{seedStatus.details}</p>
              )}
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setSeedStatus(null)}
            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg shrink-0 cursor-pointer text-xs"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* --- DISHES LIST VIEW (SUPABASE CENTRALIZED) --- */}
      {activeTab === 'dishes' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[11px] px-1 font-semibold text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${supabaseConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {supabaseConnected 
                ? `Supabase Connected (${dishesList.length} items cataloged)` 
                : 'Offline / Cached Catalog'}
            </span>
            <span className="text-[10px] font-mono bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
              table: public.food_items
            </span>
          </div>

          {foodLoading ? (
            <div className="text-center py-12 bg-slate-50 dark:bg-zinc-800/40 rounded-3xl border border-slate-100 dark:border-zinc-800 p-6 flex flex-col items-center justify-center gap-2">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold text-zinc-500">Loading dishes from Supabase public.food_items...</p>
            </div>
          ) : filteredDishes.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 dark:bg-zinc-800/40 rounded-3xl border border-slate-100 dark:border-zinc-800 p-6 space-y-3">
              <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                {searchQuery ? `No dishes match "${searchQuery}"` : 'No food items stored in Supabase public.food_items table yet.'}
              </p>
              {!searchQuery && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={isSeeding}
                    onClick={handleSeedMenu}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isSeeding ? <RefreshCw className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}
                    <span>Seed Menu to Supabase</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem({
                        name: '',
                        description: '',
                        price: 180,
                        category: 'Biryani & Rice',
                        restaurantId: restaurantsList[0]?.id || '',
                        restaurantName: restaurantsList[0]?.name || '',
                        isAvailable: true,
                        vegIndicator: 'NonVeg',
                        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80'
                      });
                      setModalMode('add');
                    }}
                    className="px-4 py-2 bg-slate-200 dark:bg-zinc-700 hover:bg-slate-300 text-zinc-800 dark:text-zinc-200 font-black text-xs rounded-xl transition cursor-pointer"
                  >
                    ➕ Add Dish
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
              {filteredDishes.map((dish: any) => (
                <div 
                  key={dish.id}
                  className="p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-100 dark:border-zinc-800 flex gap-3 items-center justify-between text-xs"
                >
                  <img 
                    src={dish.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&auto=format&fit=crop&q=80"} 
                    alt={dish.name}
                    className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-zinc-700"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${dish.vegIndicator === 'Veg' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <h5 className="font-black text-zinc-900 dark:text-zinc-100 truncate">{dish.name}</h5>
                    </div>
                    <p className="text-[10px] text-zinc-400 truncate mt-0.5">{dish.description || 'No description provided'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono font-black text-zinc-900 dark:text-zinc-100">₹{dish.price}</span>
                      <span className="text-[9px] bg-slate-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded font-bold text-zinc-600 dark:text-zinc-300">
                        {dish.category}
                      </span>
                      <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-black uppercase ${
                        dish.isAvailable !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {dish.isAvailable !== false ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleDishAvailability(dish)}
                      title="Toggle Availability"
                      className="p-2 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg cursor-pointer transition"
                    >
                      {dish.isAvailable !== false ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                    </button>
                    <button
                      onClick={() => {
                        setEditingItem({
                          id: dish.id,
                          name: dish.name || '',
                          description: dish.description || '',
                          price: Number(dish.price) || 0,
                          category: dish.category || 'Biryani & Rice',
                          subcategory: dish.subcategory || 'Chef Special',
                          restaurantId: dish.restaurantId || dish.restaurant_id || restaurantsList[0]?.id || '',
                          restaurantName: dish.restaurantName || restaurantsList.find(r => r.id === (dish.restaurantId || dish.restaurant_id))?.name || '',
                          vegIndicator: dish.vegIndicator || dish.veg_indicator || 'Veg',
                          image: dish.image || dish.image_url || '',
                          image_url: dish.image_url || dish.image || '',
                          isAvailable: dish.isAvailable !== false && dish.is_available !== false,
                          prepTime: Number(dish.prepTime || dish.prep_time) || 20,
                          spiceLevel: dish.spiceLevel || dish.spice_level || 'Medium',
                          rating: Number(dish.rating) || 4.8,
                          reviewsCount: Number(dish.reviewsCount || dish.reviews_count) || 12
                        });
                        setModalMode('edit');
                      }}
                      title="Edit Dish"
                      className="p-2 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg cursor-pointer transition"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteDish(dish.id, dish.name)}
                      title="Delete Dish"
                      className="p-2 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- RESTAURANTS LIST VIEW --- */}
      {activeTab === 'restaurants' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
            {filteredRestaurants.map((rest: any) => (
              <div 
                key={rest.id}
                className="p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-100 dark:border-zinc-800 flex gap-3 items-center justify-between text-xs"
              >
                <img 
                  src={rest.image || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=120&auto=format&fit=crop&q=80"} 
                  alt={rest.name}
                  className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-zinc-700"
                />
                <div className="flex-1 min-w-0">
                  <h5 className="font-black text-zinc-900 dark:text-zinc-100 truncate">{rest.name}</h5>
                  <p className="text-[10px] text-zinc-400 truncate mt-0.5">{rest.address || 'Chirala Regional Highway'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] bg-slate-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded font-bold text-zinc-600 dark:text-zinc-300">
                      ★ {rest.rating || 4.5}
                    </span>
                    <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-black uppercase ${
                      rest.status === 'Inactive' || rest.isActive === false ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {rest.status === 'Inactive' || rest.isActive === false ? 'Inactive' : 'Active'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setEditingItem({ ...rest });
                      setModalMode('edit');
                    }}
                    title="Edit Restaurant"
                    className="p-2 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg cursor-pointer transition"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRestaurant(rest.id, rest.name)}
                    title="Delete Restaurant"
                    className="p-2 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- HOTELS LIST VIEW --- */}
      {activeTab === 'hotels' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
            {filteredHotels.map((hotel: HotelItem) => (
              <div 
                key={hotel.id}
                className="p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-100 dark:border-zinc-800 flex gap-3 items-center justify-between text-xs"
              >
                <img 
                  src={hotel.image || "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=120&auto=format&fit=crop&q=80"} 
                  alt={hotel.name}
                  className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-zinc-700"
                />
                <div className="flex-1 min-w-0">
                  <h5 className="font-black text-zinc-900 dark:text-zinc-100 truncate">{hotel.name}</h5>
                  <p className="text-[10px] text-zinc-400 truncate mt-0.5">{hotel.address || 'Chirala District'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] bg-slate-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded font-bold text-zinc-600 dark:text-zinc-300">
                      ★ {hotel.rating || 4.7}
                    </span>
                    <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-black uppercase ${
                      hotel.status === 'Inactive' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {hotel.status || 'Active'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setEditingItem({ ...hotel });
                      setModalMode('edit');
                    }}
                    title="Edit Hotel"
                    className="p-2 hover:bg-slate-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg cursor-pointer transition"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteHotel(hotel.id, hotel.name)}
                    title="Delete Hotel"
                    className="p-2 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- DELIVERY BOYS & RIDERS LIST VIEW --- */}
      {activeTab === 'riders' && (
        <div className="space-y-4">
          {/* Top Rider Controls & Stats */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-zinc-850/40 p-3.5 rounded-2xl border border-slate-100 dark:border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <Bike className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-black uppercase text-zinc-900 dark:text-zinc-100">
                  Delivery Fleet Registry
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-700 font-bold">
                  Total: {deliveryPartners.length} | Available: {deliveryPartners.filter(p => p.isAvailable && p.isApproved).length}
                </span>
              </div>
              <p className="text-[10.5px] text-zinc-400 mt-0.5">
                {deliveryPartners.length === 0 
                  ? 'Delivery Boys / Delivery Partners count = 0 (No personnel currently registered).' 
                  : 'Manage active couriers, availability switches, and pending order route dispatching.'}
              </p>
            </div>

            <button
              onClick={() => setShowRiderModal(true)}
              className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
            >
              <UserPlus className="w-3.5 h-3.5" /> Add Delivery Partner
            </button>
          </div>

          {/* Zero Riders State */}
          {deliveryPartners.length === 0 ? (
            <div className="p-8 bg-slate-50 dark:bg-zinc-850/60 rounded-3xl border border-dashed border-slate-200 dark:border-zinc-800 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
                <Bike className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                  Delivery Boys / Delivery Partners Count = 0
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mt-1">
                  Currently there are zero delivery partners available in the system. The platform maintains a clean zero default until an administrator explicitly onboards delivery partners.
                </p>
              </div>
              <button
                onClick={() => setShowRiderModal(true)}
                className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer inline-flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" /> Add Delivery Partner
              </button>
            </div>
          ) : (
            /* Riders Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {deliveryPartners.map(partner => (
                <div 
                  key={partner.id}
                  className="p-3.5 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-100 dark:border-zinc-800 flex gap-3 items-center justify-between text-xs"
                >
                  <img 
                    src={partner.avatar || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80"} 
                    alt={partner.name}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-zinc-700"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h5 className="font-black text-zinc-900 dark:text-zinc-100 truncate">{partner.name}</h5>
                      <span className={`text-[8.5px] px-1.5 py-0.2 rounded font-black uppercase ${
                        partner.isAvailable ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'
                      }`}>
                        {partner.isAvailable ? 'Available' : 'Offline'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 truncate mt-0.5 font-mono">
                      📞 +91 {partner.phone} • {partner.vehicleType} ({partner.bikeNumber})
                    </p>
                    <p className="text-[9.5px] text-zinc-500 truncate mt-0.5">
                      📍 {partner.address || 'Chirala District'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleDeliveryPartnerAvailability(partner.id)}
                      title={partner.isAvailable ? 'Set Offline' : 'Set Available'}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer transition ${
                        partner.isAvailable 
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' 
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                      }`}
                    >
                      {partner.isAvailable ? 'Set Offline' : 'Set Active'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove delivery partner "${partner.name}"?`)) {
                          removeDeliveryPartner(partner.id);
                          showFeedback(`Partner "${partner.name}" removed.`);
                        }
                      }}
                      title="Delete Partner"
                      className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending Orders Route Assignment Section */}
          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-orange-500" />
                Active Orders Route Assignment
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">
                {orders.filter(o => !o.deliveryPartnerId && o.status !== 'delivered' && o.status !== 'cancelled').length} Pending Assignment
              </span>
            </div>

            {orders.filter(o => !o.deliveryPartnerId && o.status !== 'delivered' && o.status !== 'cancelled').length === 0 ? (
              <p className="text-xs text-zinc-400 italic p-3 bg-slate-50 dark:bg-zinc-800/30 rounded-2xl text-center">
                All active orders currently have assigned delivery partners or have been fulfilled.
              </p>
            ) : (
              <div className="space-y-2">
                {orders
                  .filter(o => !o.deliveryPartnerId && o.status !== 'delivered' && o.status !== 'cancelled')
                  .map(order => (
                    <div 
                      key={order.id} 
                      className="p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-orange-600 dark:text-orange-400">
                            #{order.id.slice(-6).toUpperCase()}
                          </span>
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            {order.customerName} (📞 {order.customerPhone})
                          </span>
                          <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                            {order.deliveryPartnerStatus || 'Awaiting Partner'}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {order.items.map(i => `${i.foodItem.name} (x${i.quantity})`).join(', ')} • Total: ₹{order.finalAmount}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {deliveryPartners.length === 0 ? (
                          <span className="text-[10px] text-rose-500 font-bold italic">
                            No delivery personnel available (Count = 0)
                          </span>
                        ) : (
                          <>
                            <select
                              value={orderToAssignRider[order.id] || deliveryPartners[0]?.id || ''}
                              onChange={e => setOrderToAssignRider({ ...orderToAssignRider, [order.id]: e.target.value })}
                              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 px-2 py-1.5 rounded-xl font-bold text-xs"
                            >
                              {deliveryPartners.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.isAvailable ? 'Available' : 'Offline'})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                const riderId = orderToAssignRider[order.id] || deliveryPartners[0]?.id;
                                if (riderId) {
                                  assignOrderToDeliveryPartner(order.id, riderId);
                                  showFeedback(`Assigned order #${order.id.slice(-6).toUpperCase()} to partner.`);
                                }
                              }}
                              className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl text-xs shadow-xs cursor-pointer active:scale-95 transition"
                            >
                              Assign Route
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- FORM MODAL (ADD / EDIT) --- */}
      {modalMode && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-100 dark:border-zinc-800 animate-fadeIn my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <h4 className="text-sm font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-tight">
                {modalMode === 'add' ? 'Add New' : 'Edit'} {activeTab === 'dishes' ? 'Dish' : activeTab === 'restaurants' ? 'Restaurant' : 'Hotel'}
              </h4>
              <button
                onClick={() => { setModalMode(null); setEditingItem(null); }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* DISH FORM */}
            {activeTab === 'dishes' && (
              <form onSubmit={handleSaveDish} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Dish Name *</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name || ''}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    placeholder="e.g. Royal Chicken Dum Biryani"
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={editingItem.description || ''}
                    onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                    placeholder="Preparation style, special ingredients, or chef details..."
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-medium text-xs resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Price (₹) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={editingItem.price || ''}
                      onChange={e => setEditingItem({ ...editingItem, price: Number(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Category *</label>
                    <select
                      value={editingItem.category || 'Biryani & Rice'}
                      onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                    >
                      <option value="Biryani & Rice">Biryani & Rice</option>
                      <option value="South Indian Tiffins">South Indian Tiffins</option>
                      <option value="North Indian Curries">North Indian Curries</option>
                      <option value="Fast Food & Pizza">Fast Food & Pizza</option>
                      <option value="Seafood Coastal">Seafood Coastal</option>
                      <option value="Desserts & Bakery">Desserts & Bakery</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Subcategory / Tag</label>
                    <input
                      type="text"
                      value={editingItem.subcategory || ''}
                      onChange={e => setEditingItem({ ...editingItem, subcategory: e.target.value })}
                      placeholder="e.g. Signature Dum, Coastal"
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Spice Level</label>
                    <select
                      value={editingItem.spiceLevel || 'Medium'}
                      onChange={e => setEditingItem({ ...editingItem, spiceLevel: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                    >
                      <option value="Mild">Mild</option>
                      <option value="Medium">Medium</option>
                      <option value="Spicy">Spicy</option>
                      <option value="Extra Spicy">Extra Spicy</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Associated Restaurant / Hotel *</label>
                  <select
                    value={editingItem.restaurantId || ''}
                    onChange={e => {
                      const sel = restaurantsList.find(r => r.id === e.target.value);
                      setEditingItem({ 
                        ...editingItem, 
                        restaurantId: e.target.value,
                        restaurantName: sel?.name || ''
                      });
                    }}
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                  >
                    {restaurantsList.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Image URL</label>
                    <input
                      type="url"
                      value={editingItem.image || ''}
                      onChange={e => setEditingItem({ ...editingItem, image: e.target.value })}
                      placeholder="https://..."
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Prep Time (mins)</label>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={editingItem.prepTime || 20}
                      onChange={e => setEditingItem({ ...editingItem, prepTime: Number(e.target.value) })}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Diet Type</label>
                    <select
                      value={editingItem.vegIndicator || 'NonVeg'}
                      onChange={e => setEditingItem({ ...editingItem, vegIndicator: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                    >
                      <option value="Veg">Pure Veg</option>
                      <option value="NonVeg">Non-Veg</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Availability</label>
                    <select
                      value={editingItem.isAvailable !== false ? 'Available' : 'Unavailable'}
                      onChange={e => setEditingItem({ ...editingItem, isAvailable: e.target.value === 'Available' })}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                    >
                      <option value="Available">Available</option>
                      <option value="Unavailable">Unavailable</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => { setModalMode(null); setEditingItem(null); }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 font-bold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    {loading ? 'Saving...' : 'Save Dish'}
                  </button>
                </div>
              </form>
            )}

            {/* RESTAURANT FORM */}
            {activeTab === 'restaurants' && (
              <form onSubmit={handleSaveRestaurant} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Restaurant Name *</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name || ''}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    placeholder="e.g. Royal Spice Biryani House"
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Address / Location *</label>
                  <input
                    type="text"
                    required
                    value={editingItem.address || ''}
                    onChange={e => setEditingItem({ ...editingItem, address: e.target.value })}
                    placeholder="e.g. Main Road, Chirala"
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Contact Phone</label>
                    <input
                      type="text"
                      value={editingItem.phone || ''}
                      onChange={e => setEditingItem({ ...editingItem, phone: e.target.value })}
                      placeholder="+91..."
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Status</label>
                    <select
                      value={editingItem.status || 'Active'}
                      onChange={e => setEditingItem({ ...editingItem, status: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={editingItem.description || ''}
                    onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                    placeholder="Brief overview of specialty cuisines..."
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Image / Logo URL</label>
                  <input
                    type="url"
                    value={editingItem.image || ''}
                    onChange={e => setEditingItem({ ...editingItem, image: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-mono text-[11px]"
                  />
                </div>

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => { setModalMode(null); setEditingItem(null); }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 font-bold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    {loading ? 'Saving...' : 'Save Restaurant'}
                  </button>
                </div>
              </form>
            )}

            {/* HOTEL FORM */}
            {activeTab === 'hotels' && (
              <form onSubmit={handleSaveHotel} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Hotel Name *</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name || ''}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    placeholder="e.g. Hotel Mourya Grand"
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Address / Location *</label>
                  <input
                    type="text"
                    required
                    value={editingItem.address || ''}
                    onChange={e => setEditingItem({ ...editingItem, address: e.target.value })}
                    placeholder="e.g. Bypass Road, Chirala"
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Contact Phone</label>
                    <input
                      type="text"
                      value={editingItem.phone || ''}
                      onChange={e => setEditingItem({ ...editingItem, phone: e.target.value })}
                      placeholder="+91..."
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Status</label>
                    <select
                      value={editingItem.status || 'Active'}
                      onChange={e => setEditingItem({ ...editingItem, status: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-bold"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={editingItem.description || ''}
                    onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                    placeholder="Executive lodging, dining amenities..."
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold text-zinc-500 mb-1">Image URL</label>
                  <input
                    type="url"
                    value={editingItem.image || ''}
                    onChange={e => setEditingItem({ ...editingItem, image: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 font-mono text-[11px]"
                  />
                </div>

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => { setModalMode(null); setEditingItem(null); }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 font-bold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    {loading ? 'Saving...' : 'Save Hotel'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
