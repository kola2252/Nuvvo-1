import React from 'react';
import { useApp } from '../context/AppContext';
import { Home as HomeIcon, Bike, ShoppingBag, Clock, User, Building } from 'lucide-react';
import { motion } from 'motion/react';
import { t } from '../utils/translations';

export default function BottomNav() {
  const { currentPage, setCurrentPage, cart, language } = useApp();

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const getDeliveryLabel = () => {
    if (language === 'te') return 'డెలివరీ';
    if (language === 'hi') return 'डिलीवरी';
    return 'Delivery';
  };

  const getFranchiseLabel = () => {
    if (language === 'te') return 'ఫ్రాంచైజ్';
    if (language === 'hi') return 'फ्रेंचाइजी';
    return 'Franchise';
  };

  // Exactly six items in specified order: Home, Delivery, Cart, Orders, Settings, Franchise
  const navItems = [
    { 
      id: 'delivery', 
      target: 'delivery',
      label: getDeliveryLabel(), 
      icon: Bike, 
      title: 'Delivery Tracking' 
    },
    { 
      id: 'cart', 
      target: 'cart',
      label: t('cart', language) || 'Cart', 
      icon: ShoppingBag, 
      badge: totalCartCount, 
      title: 'Cart' 
    },
    { 
      id: 'orders', 
      target: 'orders',
      label: t('orders', language) || 'Orders', 
      icon: Clock, 
      title: 'Order History' 
    },
    { 
      id: 'account', 
      target: 'account',
      label: t('settings', language) || 'Settings', 
      icon: User, 
      title: 'Settings' 
    },
    { 
      id: 'franchise', 
      target: 'franchise',
      label: getFranchiseLabel(), 
      icon: Building, 
      title: 'Franchise' 
    },
  ];

  const fullNavItems = [
    {
      id: 'home',
      target: 'home',
      label: t('home', language) || 'Home',
      icon: HomeIcon,
      title: 'Home'
    },
    ...navItems
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-slate-200 dark:border-zinc-800 shadow-lg safe-bottom">
      <div className="max-w-md mx-auto px-1 py-1.5 flex items-center justify-around">
        {fullNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = 
            (item.id === 'home' && currentPage === 'home') ||
            (item.id === 'delivery' && (currentPage === 'delivery' || currentPage === 'tracking' || currentPage === 'delivery-options')) ||
            (item.id === 'cart' && currentPage === 'cart') ||
            (item.id === 'orders' && (currentPage === 'orders' || currentPage === 'order-history')) ||
            (item.id === 'account' && (currentPage === 'account' || currentPage === 'settings')) ||
            (item.id === 'franchise' && currentPage === 'franchise');

          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.target)}
              title={item.title}
              aria-label={item.title}
              data-testid={`nav-${item.id}`}
              className={`relative flex flex-col items-center justify-center py-1 px-1.5 rounded-2xl transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'text-orange-600 dark:text-orange-500 font-bold'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                {Boolean(item.badge && item.badge > 0) && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1.5 -right-2 bg-orange-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm"
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </motion.span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 font-medium tracking-tight truncate max-w-[58px]">
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute bottom-0 w-8 h-0.5 bg-orange-600 dark:bg-orange-500 rounded-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
