/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import { useApp } from './context/AppContext';
import { Bell, X, WifiOff, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Splash from './components/Splash';
import Auth from './components/Auth';
import Home from './components/Home';
import BottomNav from './components/BottomNav';
import DesktopSupportWidgets from './components/DesktopSupportWidgets';
import { AdminSaveWarningModal, AdminSaveAlertBanner } from './components/AdminSaveWarningModal';
import { isAdminRole, isSuperAdminRole } from './config/authConfig';

import OrderHistoryScreen from './components/OrderHistoryScreen';

/**
 * Resilient lazy loader with automatic retries for dynamic module imports.
 * Recovers seamlessly from transient network drops or server restarts.
 * If all attempts fail, gracefully displays a refresh card instead of crashing.
 */
function safeLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
  delayMs = 600
): React.LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve) => {
      const attempt = (remaining: number) => {
        factory()
          .then(resolve)
          .catch((err) => {
            if (remaining <= 1) {
              console.warn('[SafeLazy] Dynamic import failed after retries:', err?.message || err);
              const SafeFallbackComponent: React.ComponentType<any> = () => (
                <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950/40 text-orange-600 rounded-full flex items-center justify-center text-xl shadow-xs">
                    📦
                  </div>
                  <h4 className="text-sm font-black text-zinc-800 dark:text-zinc-200">Connection Refresh Required</h4>
                  <p className="text-xs text-zinc-500 max-w-xs">A network interruption occurred while loading this view.</p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    Refresh Screen
                  </button>
                </div>
              );
              resolve({ default: SafeFallbackComponent as unknown as T });
              return;
            }
            setTimeout(() => attempt(remaining - 1), delayMs);
          });
      };
      attempt(retries);
    })
  );
}

// Code-split screens to optimize initial bundle and accelerate app startup
const FavoritesScreen = safeLazy(() => import('./components/FavoritesScreen'));
const CartScreen = safeLazy(() => import('./components/CartScreen'));
const AccountScreen = safeLazy(() => import('./components/AccountScreen'));
const DeliveryOptionsScreen = safeLazy(() => import('./components/DeliveryOptionsScreen'));
const FoodDetails = safeLazy(() => import('./components/FoodDetails'));
const TrackingScreen = safeLazy(() => import('./components/TrackingScreen'));
const PartnerScreen = safeLazy(() => import('./components/PartnerScreen'));
const FranchiseScreen = safeLazy(() => import('./components/FranchiseScreen'));
const AdminPanel = safeLazy(() => import('./components/AdminPanel'));
const SuperAdminPanel = safeLazy(() => import('./components/SuperAdminPanel'));
const MapTracking = safeLazy(() => import('./components/MapTracking'));

export default function App() {
  const { user, currentPage, selectedFoodItem, notifications, markNotificationAsRead, setCurrentPage, isOffline, cartSuccessAnimation, isAdmin, isSuperAdmin } = useApp();
  const [activeToast, setActiveToast] = useState<any>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);
  
  // Fast splash screen: skip if already seen this session, else quick 650ms intro
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return !sessionStorage.getItem('nuvvo_splash_seen');
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!showSplash) return;
    try {
      sessionStorage.setItem('nuvvo_splash_seen', 'true');
    } catch {}
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 650);
    return () => clearTimeout(timer);
  }, [showSplash]);

  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const latest = notifications[0];
      // Only serve toast for items created in the last 4 seconds
      const isRecent = (Date.now() - new Date(latest.timestamp).getTime()) < 4000;
      if (!latest.read && isRecent && latest.id !== 'permission_check') {
        setActiveToast(latest);
        const timer = setTimeout(() => {
          setActiveToast(null);
        }, 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [notifications]);

  // Memoize toast event handlers
  const handleToastClick = useCallback(() => {
    if (!activeToast) return;
    markNotificationAsRead(activeToast.id);
    if (activeToast.orderId) {
      setCurrentPage('orders');
    } else {
      setCurrentPage('home');
    }
    setActiveToast(null);
  }, [activeToast, markNotificationAsRead, setCurrentPage]);

  const handleToastDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveToast(null);
  }, []);

  // Memoize rendered active view so App-level toast/cart/notification updates don't cause page re-renders
  const renderedPage = useMemo(() => {
    if (!user) {
      return <Auth />;
    }

    switch (currentPage) {
      case 'auth':
        return <Auth />;
      case 'home':
        return <Home />;
      case 'delivery':
      case 'tracking':
        return <TrackingScreen />;
      case 'orders':
      case 'order-history':
        return <OrderHistoryScreen />;
      case 'favorites':
        return <FavoritesScreen />;
      case 'cart':
        return <CartScreen />;
      case 'account':
      case 'settings':
        return <AccountScreen />;
      case 'partner':
        return <PartnerScreen />;
      case 'franchise':
        return <FranchiseScreen />;
      case 'admin':
        if (!isAdmin || !isAdminRole(user?.role)) {
          return <AccountScreen />;
        }
        return <AdminPanel />;
      case 'super-admin':
        if (!isSuperAdmin || !isSuperAdminRole(user?.role)) {
          return <AccountScreen />;
        }
        return <SuperAdminPanel />;
      case 'delivery-options':
        return <DeliveryOptionsScreen />;
      case 'map-tracking':
        return <MapTracking />;
      default:
        return <Home />;
    }
  }, [user, currentPage, isAdmin, isSuperAdmin]);

  // Show Splash welcome animation screen at startup
  if (showSplash) {
    return <Splash />;
  }

  // Determine if we should show standard persistent bottom nav bar
  const showBottomNav = true;

  return (
    <div className="relative font-sans min-h-screen bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      
      {/* Google Maps Platform quota defense top banner */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-120 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Offline network connection status persistent banner */}
      {isOffline && (
        <motion.div
          id="offline-indicator-banner"
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-110 bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-amber-50 shadow-sm border-b border-amber-600/20 py-2.5 px-4 font-black text-[10.5px] uppercase tracking-wider flex items-center justify-center gap-2"
        >
          <WifiOff className="w-4 h-4 animate-pulse shrink-0" />
          <span>No internet connection. Operating in cached offline mode.</span>
        </motion.div>
      )}

      {/* Real-time Toast push alert banners */}
      {activeToast && (
        <motion.div
          initial={{ opacity: 0, y: -80, scale: 0.95, x: '-50%' }}
          animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
          exit={{ opacity: 0, y: -40, scale: 0.95, x: '-50%' }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          onClick={handleToastClick}
          className="fixed top-4 left-1/2 z-100 w-[92%] max-w-sm bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-orange-500/25 dark:border-orange-500/20 p-4 rounded-3xl shadow-xl shadow-zinc-950/20 flex gap-3 items-start cursor-pointer active:scale-98 transition-all"
        >
          <div className="p-2 bg-orange-500/10 text-orange-500 rounded-2xl relative shrink-0">
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            {activeToast.status === 'menu_update' || activeToast.foodId ? (
              <Utensils className="w-5 h-5 text-orange-600" />
            ) : (
              <Bell className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest font-mono">
                {activeToast.status === 'menu_update' || activeToast.foodId ? '⚡ Live Menu Update' : 'Real-time Order Alert'}
              </span>
              <button 
                onClick={handleToastDismiss}
                className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded bg-transparent text-zinc-400 hover:text-zinc-650 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 mt-1 truncate">
              {activeToast.title}
            </p>
            <p className="text-[11px] text-zinc-650 dark:text-zinc-350 mt-0.5 leading-relaxed font-medium line-clamp-2">
              {activeToast.body}
            </p>
            <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[10px] font-black text-orange-600 dark:text-orange-400">
              {activeToast.status === 'menu_update' || activeToast.foodId ? (
                <>
                  <span className="flex items-center gap-1">🍽️ Fresh In Menu</span>
                  <span>Explore Menu ➔</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1">📍 Tap to Track Live Location</span>
                  <span>View Map ➔</span>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Dynamic Viewport */}
      <main className="w-full">
        <Suspense fallback={
          <div className="min-h-[70vh] flex flex-col items-center justify-center p-8">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          {renderedPage}
        </Suspense>
      </main>

      {/* Global Product Customization overlay */}
      {selectedFoodItem && (
        <Suspense fallback={null}>
          <FoodDetails />
        </Suspense>
      )}

      {/* Persistent Swiggy Bottom Control Deck */}
      {showBottomNav && <BottomNav />}

      {/* Responsive WhatsApp & AI Chatbot desktop widgets */}
      <DesktopSupportWidgets />

      {/* Lightweight Add-To-Cart success notification - 300ms timing constraint */}
      <AnimatePresence>
        {cartSuccessAnimation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 25, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.85, y: -20, x: '-50%' }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 left-1/2 z-110 bg-emerald-500 text-white font-extrabold text-[11px] px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 select-none border border-emerald-400/20"
          >
            <span>✔</span> Added To Cart
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Admin & Super Admin Save Warning Modal & Live Alert Banner */}
      <AdminSaveWarningModal />
      <AdminSaveAlertBanner />
      
    </div>
  );
}
