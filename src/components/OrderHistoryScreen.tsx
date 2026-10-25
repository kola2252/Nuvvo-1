/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { 
  History, ArrowLeft, RefreshCw, Search, Calendar, MapPin, 
  ShoppingBag, CheckCircle, Clock, Truck, ChefHat, XCircle, 
  ChevronDown, ChevronUp, Download, RotateCcw, Star, ShieldCheck,
  AlertCircle, Database, Sparkles, Filter
} from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { fetchUserOrdersFromSupabase } from '../services/supabaseOrders';
import { downloadOrderInvoice } from '../utils/orderInvoiceGenerator';

export default function OrderHistoryScreen() {
  const { 
    user, 
    orders: localOrders, 
    setCurrentPage, 
    goBack, 
    reorderItems, 
    setActiveTrackingOrder,
    submitOrderRating 
  } = useApp();

  const [supabaseOrders, setSupabaseOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFromSupabase, setIsFromSupabase] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered' | 'cancelled'>('all');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Rating states for delivered orders
  const [ratingStates, setRatingStates] = useState<{
    [orderId: string]: { rating: number; hoverRating: number; feedback: string; submitted?: boolean }
  }>({});

  // Fetch orders from Supabase on mount and user phone change
  const loadOrders = useCallback(async (showRefreshIndicator = false) => {
    if (!user?.phone) {
      setIsLoading(false);
      return;
    }

    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setFetchError(null);

    try {
      const result = await fetchUserOrdersFromSupabase(user.phone);
      if (result.error) {
        // Log friendly notice; Supabase table might be in initial bootstrap
        console.warn('Supabase orders query notification:', result.error?.message);
        setFetchError(result.error?.message || 'Notice: Connected to local device cache');
        setIsFromSupabase(false);
      } else if (result.data) {
        setSupabaseOrders(result.data);
        setIsFromSupabase(result.fromSupabase);
      }
    } catch (err: any) {
      console.warn('Orders query exception:', err);
      setFetchError(err?.message || 'Unable to sync with cloud database');
      setIsFromSupabase(false);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.phone]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Combine Supabase orders with local orders (deduplicating by ID, prioritizing latest)
  const combinedOrders = useMemo(() => {
    const userPhoneClean = user?.phone ? user.phone.replace(/\D/g, '') : '';
    const relevantLocal = localOrders.filter(o => {
      const oPhone = o.customerPhone ? o.customerPhone.replace(/\D/g, '') : '';
      return oPhone === userPhoneClean || o.customerId === user?.id;
    });

    const map = new Map<string, Order>();
    
    // Add local orders first
    relevantLocal.forEach(o => map.set(o.id, o));
    
    // Merge Supabase orders (overwriting with cloud state if present)
    supabaseOrders.forEach(o => map.set(o.id, o));

    // Convert to array and sort descending by timestamp
    return Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.date).getTime() || 0;
      const timeB = new Date(b.date).getTime() || 0;
      return timeB - timeA;
    });
  }, [localOrders, supabaseOrders, user?.phone, user?.id]);

  // Filter orders by search term and status tab
  const filteredOrders = useMemo(() => {
    return combinedOrders.filter(order => {
      // Status filtering
      if (statusFilter === 'active') {
        const isActive = ['accepted', 'preparing', 'picked', 'on_the_way'].includes(order.status);
        if (!isActive) return false;
      } else if (statusFilter === 'delivered') {
        if (order.status !== 'delivered') return false;
      } else if (statusFilter === 'cancelled') {
        if (order.status !== 'cancelled') return false;
      }

      // Search query filtering
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      const matchesId = order.id.toLowerCase().includes(q);
      const matchesStatus = order.status.toLowerCase().includes(q);
      const matchesRestaurant = order.items.some(i => i.foodItem?.category?.toLowerCase().includes(q));
      const matchesDish = order.items.some(i => i.foodItem?.name?.toLowerCase().includes(q));

      return matchesId || matchesStatus || matchesRestaurant || matchesDish;
    });
  }, [combinedOrders, statusFilter, searchQuery]);

  const toggleExpand = (orderId: string) => {
    setExpandedOrderId(prev => (prev === orderId ? null : orderId));
  };

  const handleReorder = (order: Order) => {
    reorderItems(order.items);
    setCurrentPage('cart');
  };

  const handleTrackLive = (order: Order) => {
    setActiveTrackingOrder(order);
    setCurrentPage('tracking');
  };

  const handleDownloadInvoice = (order: Order) => {
    downloadOrderInvoice(order);
  };

  const handleRateOrder = (orderId: string) => {
    const state = ratingStates[orderId];
    if (!state || state.rating === 0) return;

    if (submitOrderRating) {
      submitOrderRating(orderId, state.rating, state.feedback || '');
    }

    setRatingStates(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], submitted: true }
    }));
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;

      const datePart = d.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const timePart = d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `${datePart} • ${timePart}`;
    } catch {
      return dateStr;
    }
  };

  const getRelativeTime = (dateStr: string) => {
    try {
      const now = Date.now();
      const past = new Date(dateStr).getTime();
      const diffMs = now - past;
      if (isNaN(diffMs)) return '';

      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHr = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHr / 24);

      if (diffSec < 60) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHr < 24) return `${diffHr}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return '';
    } catch {
      return '';
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'accepted':
        return {
          label: 'Order Confirmed',
          icon: Clock,
          bg: 'bg-blue-50 dark:bg-blue-950/40',
          text: 'text-blue-700 dark:text-blue-300',
          border: 'border-blue-200 dark:border-blue-900/40'
        };
      case 'preparing':
        return {
          label: 'In Kitchen',
          icon: ChefHat,
          bg: 'bg-amber-50 dark:bg-amber-950/40',
          text: 'text-amber-700 dark:text-amber-300',
          border: 'border-amber-200 dark:border-amber-900/40'
        };
      case 'picked':
      case 'on_the_way':
        return {
          label: 'Out for Delivery',
          icon: Truck,
          bg: 'bg-purple-50 dark:bg-purple-950/40',
          text: 'text-purple-700 dark:text-purple-300',
          border: 'border-purple-200 dark:border-purple-900/40'
        };
      case 'delivered':
        return {
          label: 'Delivered',
          icon: CheckCircle,
          bg: 'bg-emerald-50 dark:bg-emerald-950/40',
          text: 'text-emerald-700 dark:text-emerald-300',
          border: 'border-emerald-200 dark:border-emerald-900/40'
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          icon: XCircle,
          bg: 'bg-rose-50 dark:bg-rose-950/40',
          text: 'text-rose-700 dark:text-rose-300',
          border: 'border-rose-200 dark:border-rose-900/40'
        };
      default:
        return {
          label: String(status).toUpperCase(),
          icon: Clock,
          bg: 'bg-zinc-100 dark:bg-zinc-800',
          text: 'text-zinc-700 dark:text-zinc-300',
          border: 'border-zinc-200 dark:border-zinc-700'
        };
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 pb-24 pt-6 px-4">
        <div className="max-w-md mx-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/40 flex items-center justify-center mx-auto text-orange-500">
            <History className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Account Required</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Please log in with your verified mobile number to view and track your complete past orders, reorder favorites, and download official tax invoices.
          </p>
          <button
            type="button"
            onClick={() => setCurrentPage('auth')}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-orange-500/20 active:scale-98 transition cursor-pointer text-sm"
          >
            Login with Mobile Number
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-zinc-950 pb-28 pt-4 px-3 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-4">
        
        {/* Top Header Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/80 dark:border-zinc-800 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (goBack) goBack();
                else setCurrentPage('home');
              }}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition cursor-pointer active:scale-95"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
                  <History className="w-5 h-5 text-orange-500" />
                  Past Orders
                </h1>
                <span className="text-[10px] bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 font-bold px-2 py-0.5 rounded-full">
                  {combinedOrders.length} {combinedOrders.length === 1 ? 'Order' : 'Orders'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                Registered Mobile: +91 {user.phone}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Supabase Status Indicator */}
            <div 
              className={`hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                isFromSupabase
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800'
                  : 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300'
              }`}
              title={isFromSupabase ? "Orders synchronized in real time from Supabase" : "Orders synchronized via native fast cache"}
            >
              <Database className="w-3 h-3" />
              <span>{isFromSupabase ? "Supabase Live" : "Fast Sync"}</span>
            </div>

            <button
              type="button"
              onClick={() => loadOrders(true)}
              disabled={isRefreshing}
              className="p-2 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer active:scale-95 disabled:opacity-50"
              title="Refresh order history"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-orange-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-slate-200/80 dark:border-zinc-800 shadow-sm space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by dish name, order ID, or category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
            {[
              { id: 'all', label: 'All Orders' },
              { id: 'active', label: 'Active', badge: combinedOrders.filter(o => ['accepted', 'preparing', 'picked', 'on_the_way'].includes(o.status)).length },
              { id: 'delivered', label: 'Delivered', badge: combinedOrders.filter(o => o.status === 'delivered').length },
              { id: 'cancelled', label: 'Cancelled' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer text-xs flex items-center gap-1.5 ${
                  statusFilter === tab.id
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-650 dark:text-zinc-350'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black ${
                    statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(n => (
              <div key={n} className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200 dark:border-zinc-800 animate-pulse space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded-md w-1/3" />
                  <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded-md w-1/4" />
                </div>
                <div className="h-12 bg-slate-100 dark:bg-zinc-800/60 rounded-xl" />
                <div className="h-6 bg-slate-200 dark:bg-zinc-800 rounded-md w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredOrders.length === 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-8 border border-slate-200/80 dark:border-zinc-800 shadow-sm text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/40 flex items-center justify-center mx-auto text-orange-500">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                {searchQuery ? "No matching orders found" : "No past orders yet"}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                {searchQuery 
                  ? `No orders matched "${searchQuery}". Try a different keyword or clear the search filter.`
                  : "You haven't placed any orders yet. Explore our authentic Chirala restaurants and order delicious food today!"}
              </p>
            </div>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 text-zinc-700 dark:text-zinc-200 font-bold text-xs rounded-xl cursor-pointer"
              >
                Clear Search
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentPage('home')}
                className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs rounded-xl shadow-md active:scale-95 transition cursor-pointer"
              >
                Explore Chirala Menus
              </button>
            )}
          </div>
        )}

        {/* Orders List */}
        {!isLoading && filteredOrders.length > 0 && (
          <div className="space-y-3.5">
            {filteredOrders.map(order => {
              const badge = getStatusBadge(order.status);
              const BadgeIcon = badge.icon;
              const isExpanded = expandedOrderId === order.id;
              const isActiveOrder = ['accepted', 'preparing', 'picked', 'on_the_way'].includes(order.status);
              const totalItemsCount = order.items.reduce((acc, i) => acc + (i.quantity || 1), 0);
              const relativeTime = getRelativeTime(order.date);
              const ratingState = ratingStates[order.id] || { 
                rating: order.rating || 0, 
                hoverRating: 0, 
                feedback: order.feedback || '', 
                submitted: !!order.rating 
              };

              return (
                <div
                  key={order.id}
                  className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 shadow-sm overflow-hidden transition-all hover:border-slate-300 dark:hover:border-zinc-700"
                >
                  {/* Order Top Bar: ID, Status, Timestamp */}
                  <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-850/30">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-zinc-900 dark:text-zinc-100">
                          #{order.id.replace('order_', 'ORD-').slice(-8).toUpperCase()}
                        </span>
                        {relativeTime && (
                          <span className="text-[10px] text-zinc-400 font-bold bg-slate-200/70 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                            {relativeTime}
                          </span>
                        )}
                      </div>

                      {/* Status Badge */}
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${badge.bg} ${badge.text} ${badge.border}`}>
                        <BadgeIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>{badge.label}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono mt-1.5">
                      <Calendar className="w-3 h-3 text-zinc-400" />
                      <span>{formatTimestamp(order.date)}</span>
                    </div>
                  </div>

                  {/* Summary of Items Ordered */}
                  <div className="p-3.5 sm:p-4 space-y-2.5">
                    <div className="space-y-2">
                      {order.items.slice(0, isExpanded ? order.items.length : 2).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            {/* Veg / Non-Veg Indicator */}
                            <span 
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                item.foodItem?.vegIndicator === 'veg' 
                                  ? 'border-emerald-500' 
                                  : 'border-rose-500'
                              }`}
                              title={item.foodItem?.vegIndicator === 'veg' ? 'Vegetarian' : 'Non-Vegetarian'}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                item.foodItem?.vegIndicator === 'veg' 
                                  ? 'bg-emerald-500' 
                                  : 'bg-rose-500'
                              }`} />
                            </span>

                            <span className="font-bold text-zinc-900 dark:text-zinc-50">
                              {item.foodItem?.name || 'Gourmet Dish'}
                            </span>
                            <span className="text-zinc-400 font-mono font-bold">
                              ×{item.quantity}
                            </span>
                          </div>

                          <span className="font-bold text-zinc-700 dark:text-zinc-300 font-mono">
                            ₹{(item.foodItem?.price || 0) * (item.quantity || 1)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* View all items toggle if more than 2 items */}
                    {order.items.length > 2 && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(order.id)}
                        className="text-[11px] text-orange-600 dark:text-orange-400 font-bold hover:underline flex items-center gap-1 cursor-pointer pt-1"
                      >
                        {isExpanded ? (
                          <>
                            <span>Show fewer items</span>
                            <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            <span>+ {order.items.length - 2} more {order.items.length - 2 === 1 ? 'item' : 'items'}</span>
                            <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    )}

                    {/* Delivery Address Marker */}
                    {order.address && (
                      <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-start gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-1">
                          {order.address.flatNo ? `${order.address.flatNo}, ` : ''}
                          {order.address.area || order.address.city || 'Chirala'}
                        </span>
                      </div>
                    )}

                    {/* Price and Payment Total Footer */}
                    <div className="pt-2.5 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Total</span>
                        <span className="text-base font-black text-zinc-900 dark:text-zinc-50 font-mono">
                          ₹{order.finalAmount || order.subtotal || 0}
                        </span>
                        <span className="text-[10px] bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold px-1.5 py-0.5 rounded">
                          {order.paymentMethod || 'UPI'}
                        </span>
                      </div>

                      <span className="text-[11px] text-zinc-400 font-bold">
                        {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'}
                      </span>
                    </div>

                    {/* Interactive Customer Rating for Delivered Orders */}
                    {order.status === 'delivered' && (
                      <div className="mt-2.5 pt-2.5 border-t border-dashed border-slate-200 dark:border-zinc-800">
                        {ratingState.submitted ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                            <Star className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" />
                            <span>Rated {ratingState.rating} / 5 • Thank you for your feedback!</span>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10.5px] font-bold text-zinc-500 uppercase tracking-wider">Rate this dining experience:</span>
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map(star => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => {
                                      setRatingStates(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || { feedback: '' }),
                                          rating: star,
                                          hoverRating: 0
                                        }
                                      }));
                                    }}
                                    onMouseEnter={() => {
                                      setRatingStates(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || { rating: 0, feedback: '' }),
                                          hoverRating: star
                                        }
                                      }));
                                    }}
                                    onMouseLeave={() => {
                                      setRatingStates(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || { rating: 0, feedback: '' }),
                                          hoverRating: 0
                                        }
                                      }));
                                    }}
                                    className="p-0.5 cursor-pointer text-zinc-300 dark:text-zinc-700 hover:scale-110 transition"
                                  >
                                    <Star 
                                      className={`w-4 h-4 ${
                                        star <= (ratingState.hoverRating || ratingState.rating)
                                          ? 'fill-amber-400 text-amber-400'
                                          : 'text-zinc-300 dark:text-zinc-600'
                                      }`} 
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                            {ratingState.rating > 0 && (
                              <button
                                type="button"
                                onClick={() => handleRateOrder(order.id)}
                                className="text-[10.5px] bg-amber-500 hover:bg-amber-600 text-white font-bold px-2.5 py-1 rounded-lg cursor-pointer transition active:scale-95"
                              >
                                Submit Rating
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons Toolbar */}
                  <div className="p-3 bg-slate-50/70 dark:bg-zinc-850/50 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadInvoice(order)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-200 font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
                      title="Download Official PDF Tax Invoice"
                    >
                      <Download className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Invoice</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {/* Active Order live tracking button */}
                      {isActiveOrder && (
                        <button
                          type="button"
                          onClick={() => handleTrackLive(order)}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs shadow-purple-500/20"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Track Live</span>
                        </button>
                      )}

                      {/* Reorder Button */}
                      <button
                        type="button"
                        onClick={() => handleReorder(order)}
                        className="px-3.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs shadow-orange-500/20"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reorder</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
