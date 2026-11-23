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
  AlertCircle, Database, Sparkles, Filter, FileText, Trash2, AlertTriangle,
  X, Eye, Receipt, Info, Check, ArrowUpDown
} from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { fetchUserOrdersFromSupabase } from '../services/supabaseOrders';
import { downloadOrderInvoice } from '../utils/orderInvoiceGenerator';
import WhatsAppOrderConfirmation from './WhatsAppOrderConfirmation';

export type OrderSortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

export default function OrderHistoryScreen() {
  const { 
    user, 
    orders: localOrders, 
    setCurrentPage, 
    goBack, 
    reorderItems, 
    setActiveTrackingOrder,
    submitOrderRating,
    submitDeliveryPartnerRating,
    cancelOrder,
    removeOrder,
    clearOrderHistory
  } = useApp();

  const [supabaseOrders, setSupabaseOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFromSupabase, setIsFromSupabase] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered' | 'cancelled'>('all');
  const [sortBy, setSortBy] = useState<OrderSortOption>('date_desc');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);


  // Rating states for delivered orders
  const [ratingStates, setRatingStates] = useState<{
    [orderId: string]: { rating: number; hoverRating: number; feedback: string; submitted?: boolean }
  }>({});

  // Delivery Boy Rating states for delivered orders
  const [partnerRatingStates, setPartnerRatingStates] = useState<{
    [orderId: string]: {
      rating: number;
      hoverRating: number;
      feedback: string;
      tags: string[];
      submitted?: boolean;
    }
  }>({});

  // Fetch orders from Supabase on mount and authenticated user change
  const loadOrders = useCallback(async (showRefreshIndicator = false) => {
    if (!user?.id && !user?.phone) {
      setSupabaseOrders([]);
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
      const result = await fetchUserOrdersFromSupabase(user?.phone || '', showRefreshIndicator, user?.id);
      if (result.error) {
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
  }, [user?.id, user?.phone]);

  useEffect(() => {
    setSupabaseOrders([]);
    loadOrders();
  }, [loadOrders]);

  // Combine Supabase orders with local orders (deduplicating by ID, prioritizing latest)
  const combinedOrders = useMemo(() => {
    if (!user) return [];
    const userPhoneClean = user?.phone ? user.phone.replace(/\D/g, '') : '';
    const relevantLocal = localOrders.filter(o => {
      if (o.customerId && user?.id) {
        return o.customerId === user.id;
      }
      const oPhone = o.customerPhone ? o.customerPhone.replace(/\D/g, '') : '';
      return Boolean(userPhoneClean && oPhone === userPhoneClean);
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
  }, [localOrders, supabaseOrders, user]);

  // Filter and sort orders by search term, status tab, and selected sort option
  const filteredOrders = useMemo(() => {
    const list = combinedOrders.filter(order => {
      // Status filtering
      if (statusFilter === 'active') {
        const isActive = ['placed', 'accepted', 'preparing', 'ready', 'picked', 'on_the_way'].includes(order.status);
        if (!isActive) return false;
      } else if (statusFilter === 'delivered') {
        if (order.status !== 'delivered') return false;
      } else if (statusFilter === 'cancelled') {
        if (order.status !== 'cancelled' && order.status !== 'rejected') return false;
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

    // Apply sorting
    return [...list].sort((a, b) => {
      const timeA = new Date(a.date).getTime() || 0;
      const timeB = new Date(b.date).getTime() || 0;
      const amountA = Number(a.finalAmount ?? a.totalAmount ?? a.subtotal ?? 0);
      const amountB = Number(b.finalAmount ?? b.totalAmount ?? b.subtotal ?? 0);

      switch (sortBy) {
        case 'date_asc':
          return timeA - timeB; // Oldest first
        case 'amount_desc':
          return amountB - amountA; // Highest amount first
        case 'amount_asc':
          return amountA - amountB; // Lowest amount first
        case 'date_desc':
        default:
          return timeB - timeA; // Newest first
      }
    });
  }, [combinedOrders, statusFilter, searchQuery, sortBy]);


  const toggleExpand = (orderId: string) => {
    setExpandedOrderId(prev => (prev === orderId ? null : orderId));
  };

  const handleReorder = (order: Order) => {
    const result = reorderItems(order);
    if (result && result.addedCount === 0) {
      setActionNotice('None of the dishes from this order are currently available to reorder.');
      setTimeout(() => setActionNotice(null), 4000);
    } else if (result && result.skippedNames.length > 0) {
      setActionNotice(`Added ${result.addedCount} item(s). Skipped unavailable: ${result.skippedNames.join(', ')}`);
      setTimeout(() => setActionNotice(null), 4500);
    }
  };

  const handleTrackLive = (order: Order) => {
    setActiveTrackingOrder(order);
    setCurrentPage('tracking');
  };

  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleDownloadInvoice = async (order: Order) => {
    try {
      setDownloadingOrderId(order.id);
      await downloadOrderInvoice(order);
      setActionNotice(`Receipt for order #${order.id.slice(-6).toUpperCase()} downloaded!`);
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: any) {
      alert(`Unable to generate PDF invoice: ${err?.message || 'Error creating document'}`);
    } finally {
      setDownloadingOrderId(null);
    }
  };

  const handleRemoveOrder = async (order: Order) => {
    const orderRef = `#${order.id.slice(-6).toUpperCase()}`;
    const confirmed = window.confirm(`Are you sure you want to remove Order ${orderRef} from your order history?`);
    if (!confirmed) return;

    setDeletingOrderId(order.id);
    try {
      if (removeOrder) {
        await removeOrder(order.id);
      }
      setSupabaseOrders(prev => prev.filter(o => o.id !== order.id));
      setActionNotice(`Order ${orderRef} has been removed from your history.`);
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: any) {
      alert(`Failed to remove order: ${err?.message || 'An error occurred'}`);
    } finally {
      setDeletingOrderId(null);
    }
  };

  const handleResetAllOrders = async () => {
    const confirmed = window.confirm('Are you sure you want to reset and clear all past order history? This cannot be undone.');
    if (!confirmed) return;

    try {
      if (clearOrderHistory) {
        await clearOrderHistory(user?.phone);
      }
      setSupabaseOrders([]);
      setShowClearHistoryConfirm(false);
      setActionNotice('Order history has been successfully reset.');
      setTimeout(() => setActionNotice(null), 3500);
    } catch (err: any) {
      alert(`Failed to reset order history: ${err?.message || 'An error occurred'}`);
    }
  };

  const [selectedOrderForModal, setSelectedOrderForModal] = useState<Order | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState<boolean>(false);
  const [clearFromHistoryOption, setClearFromHistoryOption] = useState<boolean>(false);

  const handleCancelOrder = async (order: Order, clearFromHistory: boolean = false) => {
    const orderRef = `#${order.id.slice(-6).toUpperCase()}`;
    setCancellingOrderId(order.id);

    try {
      if (cancelOrder) {
        const res = await cancelOrder(order.id, clearFromHistory);
        if (res.success) {
          if (res.cleared || clearFromHistory) {
            setSupabaseOrders(prev => prev.filter(o => o.id !== order.id));
            setSelectedOrderForModal(null);
            setIsCancelConfirmOpen(false);
            setActionNotice(`Order ${orderRef} was cancelled and removed from your history.`);
          } else {
            setSupabaseOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled', paymentStatus: 'refund_initiated' } : o));
            setSelectedOrderForModal(prev => prev && prev.id === order.id ? { ...prev, status: 'cancelled', paymentStatus: 'refund_initiated' } : prev);
            setIsCancelConfirmOpen(false);
            setActionNotice(`Order ${orderRef} has been cancelled successfully. Refund initiated if pre-paid.`);
          }
        } else {
          alert(`Could not cancel order: ${res.error || 'Server rejected cancellation request.'}`);
        }
      }
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      alert(`Error cancelling order: ${err?.message || 'Network error occurred.'}`);
    } finally {
      setCancellingOrderId(null);
    }
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

  const handleRateDeliveryPartner = (orderId: string) => {
    const state = partnerRatingStates[orderId];
    if (!state || state.rating === 0) return;

    if (submitDeliveryPartnerRating) {
      submitDeliveryPartnerRating(orderId, state.rating, state.feedback || '', state.tags || []);
    }

    setPartnerRatingStates(prev => ({
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
      case 'placed':
        return {
          label: 'Order Placed',
          icon: Clock,
          bg: 'bg-sky-50 dark:bg-sky-950/40',
          text: 'text-sky-700 dark:text-sky-300',
          border: 'border-sky-200 dark:border-sky-900/40'
        };
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
      case 'ready':
        return {
          label: 'Ready for Pickup',
          icon: ChefHat,
          bg: 'bg-indigo-50 dark:bg-indigo-950/40',
          text: 'text-indigo-700 dark:text-indigo-300',
          border: 'border-indigo-200 dark:border-indigo-900/40'
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
      case 'rejected':
        return {
          label: 'Rejected',
          icon: XCircle,
          bg: 'bg-rose-50 dark:bg-rose-950/40',
          text: 'text-rose-700 dark:text-rose-300',
          border: 'border-rose-200 dark:border-rose-900/40'
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
      <div className="max-w-5xl mx-auto space-y-4">
        
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

            {/* Reset / Clear All Orders Button */}
            {combinedOrders.length > 0 && (
              <button
                type="button"
                onClick={handleResetAllOrders}
                className="px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-300 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer active:scale-95"
                title="Reset or clear all order history"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span className="hidden sm:inline">Reset History</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Notice Alert Banner */}
        {actionNotice && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Search, Filter & Sort Controls */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-slate-200/80 dark:border-zinc-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by dish name, order ID, or category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Sorting Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-2.5 py-1.5 shrink-0 text-xs shadow-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <label htmlFor="order-sort-select" className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
                Sort:
              </label>
              <select
                id="order-sort-select"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as OrderSortOption)}
                className="bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none cursor-pointer pr-1"
                aria-label="Sort orders by date or amount"
              >
                <option value="date_desc" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                  Date: Newest First
                </option>
                <option value="date_asc" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                  Date: Oldest First
                </option>
                <option value="amount_desc" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                  Total Amount: High to Low (₹)
                </option>
                <option value="amount_asc" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                  Total Amount: Low to High (₹)
                </option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-zinc-800/60">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs flex-1">
              {[
                { id: 'all', label: 'All Orders' },
                { id: 'active', label: 'Active', badge: combinedOrders.filter(o => ['placed', 'accepted', 'preparing', 'ready', 'picked', 'on_the_way'].includes(o.status)).length },
                { id: 'delivered', label: 'Delivered', badge: combinedOrders.filter(o => o.status === 'delivered').length },
                { id: 'cancelled', label: 'Cancelled / Rejected' }
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

            <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 whitespace-nowrap pl-2">
              {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
            </span>
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
              const isActiveOrder = ['placed', 'accepted', 'preparing', 'ready', 'picked', 'on_the_way'].includes(order.status);
              const totalItemsCount = order.items.reduce((acc, i) => acc + (i.quantity || 1), 0);
              const relativeTime = getRelativeTime(order.date);
              const ratingState = ratingStates[order.id] || { 
                rating: order.rating || 0, 
                hoverRating: 0, 
                feedback: order.feedback || '', 
                submitted: !!order.rating 
              };
              const partnerRatingState = partnerRatingStates[order.id] || {
                rating: order.deliveryPartnerRating || 0,
                hoverRating: 0,
                feedback: order.deliveryPartnerFeedback || '',
                tags: order.deliveryPartnerRatingTags || [],
                submitted: !!order.deliveryPartnerRating
              };

              return (
                <div
                  key={order.id}
                  className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-800 shadow-sm overflow-hidden transition-all hover:border-slate-300 dark:hover:border-zinc-700"
                >
                  {/* Order Top Bar: ID, Status, Timestamp */}
                  <div 
                    onClick={() => {
                      setSelectedOrderForModal(order);
                      setIsCancelConfirmOpen(false);
                      setClearFromHistoryOption(order.status === 'accepted');
                    }}
                    className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-850/30 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-zinc-800/40 transition group"
                    title="Click to view full order details"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-zinc-900 dark:text-zinc-100 group-hover:text-orange-600 transition">
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

                    <div className="flex items-center justify-between gap-1 text-[11px] text-zinc-400 font-mono mt-1.5">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        <span>{formatTimestamp(order.date)}</span>
                      </div>
                      <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold opacity-0 group-hover:opacity-100 transition">
                        View details →
                      </span>
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

                    {/* Delivery Instructions Drop-off Notes */}
                    {(order.deliveryInstructions || order.instructions) && (
                      <div className="mt-1.5 p-2 bg-orange-500/5 dark:bg-orange-950/20 rounded-xl border border-orange-500/15 flex items-start gap-1.5 text-[11px] text-orange-900 dark:text-orange-300">
                        <FileText className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                        <div className="line-clamp-2">
                          <span className="font-bold text-orange-700 dark:text-orange-400">Drop-off note: </span>
                          <span>{order.deliveryInstructions || order.instructions}</span>
                        </div>
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

                    {/* Delivery Boy Rating Section for Delivered Orders */}
                    {order.status === 'delivered' && (
                      <div className="mt-2 pt-2 border-t border-dashed border-slate-200 dark:border-zinc-800">
                        {order.deliveryPartnerRating || partnerRatingState.submitted ? (
                          <div className="flex items-center justify-between text-xs bg-emerald-50/80 dark:bg-emerald-950/20 p-2 rounded-xl border border-emerald-200/50 dark:border-emerald-900/30">
                            <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
                              <Truck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Rider Rating: {order.deliveryPartnerRating || partnerRatingState.rating} / 5 ⭐</span>
                            </div>
                            <span className="text-[10px] text-emerald-600 font-medium">
                              {order.deliveryPartner?.name ? `(${order.deliveryPartner.name})` : 'Delivery Boy'}
                            </span>
                          </div>
                        ) : (
                          <div className="p-2.5 bg-amber-50/40 dark:bg-zinc-800/40 rounded-xl border border-amber-200/50 dark:border-zinc-700/50 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200">
                                  Rate Delivery Boy {order.deliveryPartner?.name ? `(${order.deliveryPartner.name})` : ''}:
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map(star => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => {
                                      setPartnerRatingStates(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || { feedback: '', tags: [] }),
                                          rating: star,
                                          hoverRating: 0
                                        }
                                      }));
                                    }}
                                    onMouseEnter={() => {
                                      setPartnerRatingStates(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || { rating: 0, feedback: '', tags: [] }),
                                          hoverRating: star
                                        }
                                      }));
                                    }}
                                    onMouseLeave={() => {
                                      setPartnerRatingStates(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || { rating: 0, feedback: '', tags: [] }),
                                          hoverRating: 0
                                        }
                                      }));
                                    }}
                                    className="p-0.5 cursor-pointer text-zinc-300 dark:text-zinc-700 hover:scale-110 transition"
                                  >
                                    <Star 
                                      className={`w-4 h-4 ${
                                        star <= (partnerRatingState.hoverRating || partnerRatingState.rating)
                                          ? 'fill-amber-400 text-amber-400'
                                          : 'text-zinc-300 dark:text-zinc-600'
                                      }`} 
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>

                            {partnerRatingState.rating > 0 && (
                              <div className="space-y-2 pt-1">
                                <div className="flex flex-wrap gap-1">
                                  {['⚡ Fast Delivery', '😊 Polite Rider', '🍲 Hot Food Intact', '😷 Masked & Safe'].map(tag => {
                                    const isSelected = (partnerRatingState.tags || []).includes(tag);
                                    return (
                                      <button
                                        key={tag}
                                        type="button"
                                        onClick={() => {
                                          const currentTags = partnerRatingState.tags || [];
                                          const newTags = isSelected 
                                            ? currentTags.filter(t => t !== tag)
                                            : [...currentTags, tag];
                                          setPartnerRatingStates(prev => ({
                                            ...prev,
                                            [order.id]: {
                                              ...(prev[order.id] || { rating: partnerRatingState.rating, hoverRating: 0, feedback: '', tags: [] }),
                                              tags: newTags
                                            }
                                          }));
                                        }}
                                        className={`text-[9.5px] px-2 py-0.5 rounded-full font-bold cursor-pointer transition ${
                                          isSelected
                                            ? 'bg-amber-500 text-white'
                                            : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700'
                                        }`}
                                      >
                                        {tag}
                                      </button>
                                    );
                                  })}
                                </div>

                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="Optional compliment or notes..."
                                    value={partnerRatingState.feedback || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setPartnerRatingStates(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || { rating: partnerRatingState.rating, hoverRating: 0, feedback: '', tags: [] }),
                                          feedback: val
                                        }
                                      }));
                                    }}
                                    className="flex-1 text-[11px] px-2 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRateDeliveryPartner(order.id)}
                                    className="text-[10.5px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg cursor-pointer transition active:scale-95 shrink-0"
                                  >
                                    Save Rider Rating
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons Toolbar */}
                  <div className="p-3 bg-slate-50/70 dark:bg-zinc-850/50 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* View Details Modal Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrderForModal(order);
                          setIsCancelConfirmOpen(false);
                          setClearFromHistoryOption(order.status === 'accepted');
                        }}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
                        title="View full order details, tracking & bill breakdown"
                      >
                        <Eye className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Details</span>
                      </button>

                      {/* Download Invoice Button with jsPDF generator */}
                      <button
                        type="button"
                        disabled={downloadingOrderId === order.id}
                        onClick={() => handleDownloadInvoice(order)}
                        className="px-3 py-1.5 rounded-xl border border-orange-200 dark:border-orange-850 bg-orange-50/80 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs disabled:opacity-60"
                        title="Generate and Download Clean Itemized PDF Receipt"
                      >
                        {downloadingOrderId === order.id ? (
                          <RefreshCw className="w-3.5 h-3.5 text-orange-600 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                        )}
                        <span>{downloadingOrderId === order.id ? 'Generating PDF...' : 'Invoice'}</span>
                      </button>

                      {/* Remove / Delete Order Button */}
                      <button
                        type="button"
                        disabled={deletingOrderId === order.id}
                        onClick={() => handleRemoveOrder(order)}
                        className="p-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-zinc-400 dark:text-zinc-500 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs disabled:opacity-50"
                        title="Remove this order from your history"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline text-[10px]">Remove</span>
                      </button>

                      {/* Automatic WhatsApp Cloud API Delivery Status Badge */}
                      <WhatsAppOrderConfirmation 
                        order={order} 
                        customerPhone={user?.phone || order.customerPhone} 
                        compact 
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Cancel Order shortcut button on card if not yet in kitchen or preparing */}
                      {['accepted', 'preparing'].includes(order.status) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOrderForModal(order);
                            setIsCancelConfirmOpen(true);
                            setClearFromHistoryOption(order.status === 'accepted');
                          }}
                          className="px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/80 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-300 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
                          title="Cancel this order"
                        >
                          <XCircle className="w-3.5 h-3.5 text-rose-500" />
                          <span>Cancel</span>
                        </button>
                      )}

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

        {/* Order Details Modal with Cancel Order & Clear from History */}
        {selectedOrderForModal && (() => {
          const modalBadge = getStatusBadge(selectedOrderForModal.status);
          const ModalBadgeIcon = modalBadge.icon;
          const isNotYetPrepared = selectedOrderForModal.status === 'placed' || selectedOrderForModal.status === 'accepted';
          const isPreparing = selectedOrderForModal.status === 'preparing';
          const isCancellable = ['placed', 'accepted', 'preparing'].includes(selectedOrderForModal.status);
          const isCancelled = selectedOrderForModal.status === 'cancelled' || selectedOrderForModal.status === 'rejected';
          const isDelivered = selectedOrderForModal.status === 'delivered';
          const totalModalItems = selectedOrderForModal.items.reduce((acc, i) => acc + (i.quantity || 1), 0);

          return (
            <div 
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
              onClick={() => {
                if (!cancellingOrderId) {
                  setSelectedOrderForModal(null);
                  setIsCancelConfirmOpen(false);
                }
              }}
            >
              <div 
                className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden my-auto max-h-[92vh] flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                {/* Modal Top Bar */}
                <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/60 dark:bg-zinc-850/60 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 flex items-center justify-center font-bold">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                        <span>Order Details</span>
                        <span className="font-mono text-xs font-bold text-orange-600 dark:text-orange-400">
                          #{selectedOrderForModal.id.replace('order_', 'ORD-').slice(-8).toUpperCase()}
                        </span>
                      </h2>
                      <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                        {formatTimestamp(selectedOrderForModal.date)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrderForModal(null);
                      setIsCancelConfirmOpen(false);
                    }}
                    className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition cursor-pointer"
                    aria-label="Close details modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Scrollable Body */}
                <div className="overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
                  
                  {/* Status Banner */}
                  <div className={`p-3.5 rounded-2xl border ${modalBadge.bg} ${modalBadge.border} flex items-center justify-between gap-3`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl bg-white/80 dark:bg-black/30 flex items-center justify-center shrink-0 ${modalBadge.text}`}>
                        <ModalBadgeIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className={`font-black text-xs block ${modalBadge.text}`}>
                          {modalBadge.label}
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {selectedOrderForModal.status === 'rejected'
                            ? `This order could not be fulfilled.${selectedOrderForModal.rejectionReason ? ` Reason: ${selectedOrderForModal.rejectionReason}` : ''}`
                            : isCancelled
                            ? `This order was cancelled. Payment refunded if charged.${selectedOrderForModal.cancellationReason ? ` (${selectedOrderForModal.cancellationReason})` : ''}`
                            : isDelivered
                            ? 'Delivered securely to your address.'
                            : selectedOrderForModal.status === 'ready'
                            ? 'Prepared and packed — ready for rider pickup.'
                            : isPreparing
                            ? 'Freshly preparing in the kitchen.'
                            : isNotYetPrepared
                            ? 'Order confirmed. Not yet started in kitchen.'
                            : 'Out for delivery to your doorstep.'}
                        </span>
                      </div>
                    </div>

                    {isNotYetPrepared && (
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800 shrink-0">
                        Not Yet Prepared
                      </span>
                    )}
                  </div>

                  {/* Status Progress Stepper */}
                  {!isCancelled && (
                    <div className="p-3 bg-slate-50 dark:bg-zinc-850/50 rounded-2xl border border-slate-200/60 dark:border-zinc-800">
                      <div className="grid grid-cols-4 gap-1 text-center relative">
                        {[
                          { key: 'accepted', label: 'Confirmed', icon: Clock },
                          { key: 'preparing', label: 'In Kitchen', icon: ChefHat },
                          { key: 'picked', label: 'On Way', icon: Truck },
                          { key: 'delivered', label: 'Delivered', icon: CheckCircle }
                        ].map((step, idx) => {
                          const statusOrder = ['accepted', 'preparing', 'picked', 'delivered'];
                          const normalizedStatus =
                            selectedOrderForModal.status === 'placed'
                              ? 'accepted'
                              : selectedOrderForModal.status === 'ready' || selectedOrderForModal.status === 'on_the_way'
                              ? 'picked'
                              : selectedOrderForModal.status;
                          const currentIdx = statusOrder.indexOf(normalizedStatus);
                          const isDone = currentIdx >= idx;
                          const isCurrent = currentIdx === idx;
                          const StepIcon = step.icon;

                          return (
                            <div key={step.key} className="flex flex-col items-center">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                                isDone 
                                  ? 'bg-orange-500 text-white shadow-xs' 
                                  : 'bg-slate-200 dark:bg-zinc-800 text-zinc-400'
                              } ${isCurrent ? 'ring-2 ring-orange-500/40 ring-offset-1' : ''}`}>
                                <StepIcon className="w-3.5 h-3.5" />
                              </div>
                              <span className={`text-[10px] mt-1 font-bold ${
                                isDone ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'
                              }`}>
                                {step.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Cancellation Alert / Confirmation Box */}
                  {isCancelConfirmOpen && (
                    <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-900/60 rounded-2xl space-y-3 animate-in fade-in duration-150">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-extrabold text-rose-950 dark:text-rose-100 text-xs">
                            Cancel Order Confirmation
                          </h3>
                          <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5 leading-relaxed">
                            {isNotYetPrepared 
                              ? 'This order has not yet been prepared by the restaurant. You can cancel it immediately.'
                              : 'The kitchen has already begun preparing this order. Cancelling will notify the store and initiate refund processing.'}
                          </p>
                        </div>
                      </div>

                      {/* Not yet prepared - Option to clear from order history */}
                      {isNotYetPrepared ? (
                        <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-rose-200 dark:border-rose-900/40">
                          <label className="flex items-start gap-2.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={clearFromHistoryOption}
                              onChange={(e) => setClearFromHistoryOption(e.target.checked)}
                              className="mt-0.5 w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                            />
                            <div>
                              <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                Clear from my order history
                              </span>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                Since the order is not yet prepared, permanently remove it from your past orders list and database.
                              </p>
                            </div>
                          </label>
                        </div>
                      ) : (
                        <div className="p-2.5 bg-white/70 dark:bg-zinc-900/70 rounded-xl border border-rose-200/60 dark:border-rose-900/30 text-[10.5px] text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>Order is in kitchen; it will be marked as 'Cancelled' for auditing and record-keeping.</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={cancellingOrderId === selectedOrderForModal.id}
                          onClick={() => handleCancelOrder(selectedOrderForModal, clearFromHistoryOption && isNotYetPrepared)}
                          className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition cursor-pointer active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          {cancellingOrderId === selectedOrderForModal.id ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Cancelling Order...</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{clearFromHistoryOption && isNotYetPrepared ? 'Cancel & Clear from History' : 'Confirm Cancel Order'}</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={cancellingOrderId === selectedOrderForModal.id}
                          onClick={() => setIsCancelConfirmOpen(false)}
                          className="py-2 px-3 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl text-xs transition cursor-pointer"
                        >
                          Keep Order
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Items Ordered List */}
                  <div className="space-y-2">
                    <h3 className="font-extrabold text-zinc-900 dark:text-zinc-100 text-xs uppercase tracking-wider flex items-center justify-between">
                      <span>Items Ordered ({totalModalItems})</span>
                      <span className="text-zinc-400 font-mono text-[11px] font-normal">
                        {selectedOrderForModal.items.length} {selectedOrderForModal.items.length === 1 ? 'Dish' : 'Dishes'}
                      </span>
                    </h3>

                    <div className="bg-slate-50 dark:bg-zinc-850/50 rounded-2xl p-3 border border-slate-200/70 dark:border-zinc-800 space-y-2.5">
                      {selectedOrderForModal.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span 
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                item.foodItem?.vegIndicator === 'veg' 
                                  ? 'border-emerald-500' 
                                  : 'border-rose-500'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                item.foodItem?.vegIndicator === 'veg' ? 'bg-emerald-500' : 'bg-rose-500'
                              }`} />
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                  {item.foodItem?.name || 'Gourmet Dish'}
                                </span>
                                <span className="text-zinc-400 font-mono font-bold text-[11px]">
                                  ×{item.quantity}
                                </span>
                              </div>
                              {item.foodItem?.category && (
                                <span className="text-[10px] text-zinc-400">
                                  {item.foodItem.category}
                                </span>
                              )}
                            </div>
                          </div>

                          <span className="font-bold text-zinc-800 dark:text-zinc-200 font-mono">
                            ₹{(item.foodItem?.price || 0) * (item.quantity || 1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Delivery Location & Drop-off Notes */}
                  <div className="space-y-2">
                    <h3 className="font-extrabold text-zinc-900 dark:text-zinc-100 text-xs uppercase tracking-wider">
                      Delivery Information
                    </h3>

                    <div className="bg-slate-50 dark:bg-zinc-850/50 rounded-2xl p-3 border border-slate-200/70 dark:border-zinc-800 space-y-2.5">
                      {selectedOrderForModal.address && (
                        <div className="flex items-start gap-2 text-xs">
                          <MapPin className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-zinc-800 dark:text-zinc-200 block">
                              {selectedOrderForModal.address.type || 'Delivery Location'}: {selectedOrderForModal.address.flatNo || ''}
                            </span>
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {[selectedOrderForModal.address.area, selectedOrderForModal.address.landmark, selectedOrderForModal.address.city || 'Chirala']
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Drop-off Notes / Delivery Instructions */}
                      {(selectedOrderForModal.deliveryInstructions || selectedOrderForModal.instructions) && (
                        <div className="p-2.5 bg-orange-500/10 dark:bg-orange-950/30 rounded-xl border border-orange-500/20 flex items-start gap-2 text-[11px] text-orange-950 dark:text-orange-200">
                          <FileText className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-orange-700 dark:text-orange-400 block">
                              Delivery Instructions (Drop-off notes):
                            </span>
                            <span className="italic">
                              "{selectedOrderForModal.deliveryInstructions || selectedOrderForModal.instructions}"
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bill Breakdown */}
                  <div className="space-y-2">
                    <h3 className="font-extrabold text-zinc-900 dark:text-zinc-100 text-xs uppercase tracking-wider">
                      Bill Summary
                    </h3>

                    <div className="bg-slate-50 dark:bg-zinc-850/50 rounded-2xl p-3 border border-slate-200/70 dark:border-zinc-800 space-y-1.5 font-mono text-xs">
                      <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                        <span>Items Subtotal</span>
                        <span>₹{selectedOrderForModal.subtotal || 0}</span>
                      </div>

                      {Number(selectedOrderForModal.discount || 0) > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                          <span>Discount {selectedOrderForModal.couponUsed ? `(${selectedOrderForModal.couponUsed})` : ''}</span>
                          <span>-₹{selectedOrderForModal.discount}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                        <span>Delivery Fee</span>
                        <span>
                          {Number(selectedOrderForModal.deliveryFee || 0) > 0 
                            ? `₹${selectedOrderForModal.deliveryFee}` 
                            : <span className="text-emerald-600 font-bold uppercase text-[10px]">Free</span>}
                        </span>
                      </div>

                      {Number(selectedOrderForModal.tax || 0) > 0 && (
                        <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                          <span>Taxes & Charges</span>
                          <span>₹{selectedOrderForModal.tax}</span>
                        </div>
                      )}

                      {Number(selectedOrderForModal.tip || 0) > 0 && (
                        <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                          <span>Delivery Tip</span>
                          <span>₹{selectedOrderForModal.tip}</span>
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-200 dark:border-zinc-700 flex justify-between items-center text-sm font-black text-zinc-900 dark:text-zinc-50 font-sans">
                        <span>Total Paid</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 font-mono">
                            {selectedOrderForModal.paymentMethod || 'UPI'}
                          </span>
                          <span className="font-mono text-base font-black">
                            ₹{selectedOrderForModal.finalAmount || selectedOrderForModal.subtotal || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Modal Actions Footer */}
                <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-zinc-850/80 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0 flex-wrap">
                  <div className="flex items-center gap-2">
                    {/* Cancel Order Button */}
                    {isCancellable && !isCancelConfirmOpen && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCancelConfirmOpen(true);
                          setClearFromHistoryOption(isNotYetPrepared);
                        }}
                        className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                      >
                        <XCircle className="w-4 h-4 text-rose-600" />
                        <span>Cancel Order</span>
                      </button>
                    )}

                    {/* Download Invoice Button */}
                    <button
                      type="button"
                      disabled={downloadingOrderId === selectedOrderForModal.id}
                      onClick={() => handleDownloadInvoice(selectedOrderForModal)}
                      className="py-2 px-3 rounded-xl bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition disabled:opacity-50"
                    >
                      <Download className="w-4 h-4 text-orange-600" />
                      <span>Invoice</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Live Tracking shortcut */}
                    {['placed', 'accepted', 'preparing', 'ready', 'picked', 'on_the_way'].includes(selectedOrderForModal.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          const ord = selectedOrderForModal;
                          setSelectedOrderForModal(null);
                          handleTrackLive(ord);
                        }}
                        className="py-2 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition shadow-xs"
                      >
                        <Truck className="w-4 h-4" />
                        <span>Track Live</span>
                      </button>
                    )}

                    {/* Reorder shortcut */}
                    {(isDelivered || isCancelled) && (
                      <button
                        type="button"
                        onClick={() => {
                          const ord = selectedOrderForModal;
                          setSelectedOrderForModal(null);
                          handleReorder(ord);
                        }}
                        className="py-2 px-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition shadow-xs"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Reorder</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderForModal(null);
                        setIsCancelConfirmOpen(false);
                      }}
                      className="py-2 px-3 rounded-xl bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs transition cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
