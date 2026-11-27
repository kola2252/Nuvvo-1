/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Utensils, Flame, Clock } from 'lucide-react';
import NuvvoLogo from './NuvvoLogo';

interface FoodSlide {
  title: string;
  cuisine: string;
  caption: string;
  eta: string;
  image: string;
}

const APPETIZING_FOOD_SLIDES: FoodSlide[] = [
  {
    title: 'Hyderabadi Chicken Dum Biryani',
    cuisine: 'Signature Dum',
    caption: 'Layering fragrant saffron basmati & spices...',
    eta: '25 mins',
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=85&w=720',
  },
  {
    title: 'Woodfired Artisan Margherita',
    cuisine: 'Hot From Oven',
    caption: 'Pulling hand-stretched sourdough crust...',
    eta: '22 mins',
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=85&w=720',
  },
  {
    title: 'Crispy Ghee Podi Masala Dosa',
    cuisine: 'South Indian',
    caption: 'Crisping golden tiffins & fresh chutneys...',
    eta: '18 mins',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=85&w=720',
  },
  {
    title: 'Double Smoke Grill Burger',
    cuisine: 'Chef Craft',
    caption: 'Searing flame-grilled gourmet patties...',
    eta: '20 mins',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=85&w=720',
  },
  {
    title: 'Royal Paneer Butter Masala',
    cuisine: 'North Indian',
    caption: 'Simmering rich velvet tomato gravy...',
    eta: '24 mins',
    image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=85&w=720',
  },
];

export interface LoadingScreenProps {
  /** Use full viewport height for initial splash boot, or main container height for Suspense component fetching */
  fullScreen?: boolean;
  /** Presentation mode: 'splash' for initial app boot or 'suspense' for lazy component fetching */
  variant?: 'splash' | 'suspense';
  /** Optional completion callback when splash progress reaches 100% */
  onComplete?: () => void;
  /** Optional custom status message */
  statusText?: string;
}

function LoadingScreen({
  fullScreen = false,
  variant = 'suspense',
  onComplete,
  statusText,
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(variant === 'splash' ? 14 : 26);
  const [slideIndex, setSlideIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  // Preload appetizing dish imagery so transitions stay instantaneous
  useEffect(() => {
    APPETIZING_FOOD_SLIDES.forEach((slide, idx) => {
      const img = new Image();
      img.onerror = () => {
        setFailedImages(prev => (prev[idx] ? prev : { ...prev, [idx]: true }));
      };
      img.src = slide.image;
    });
  }, []);

  // Existing splash progress timer logic
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(old => {
        if (old >= 100) {
          clearInterval(timer);
          if (onComplete) {
            setTimeout(() => {
              onComplete();
            }, 300);
          }
          return 100;
        }
        return Math.min(100, old + 4);
      });
    }, 80);

    return () => clearInterval(timer);
  }, [onComplete]);

  // Dynamically rotate appetizing food imagery while initializing
  useEffect(() => {
    const slideTimer = setInterval(() => {
      setSlideIndex(prev => (prev + 1) % APPETIZING_FOOD_SLIDES.length);
    }, 1800);

    return () => clearInterval(slideTimer);
  }, []);

  const activeSlide = APPETIZING_FOOD_SLIDES[slideIndex];
  const isImageBroken = Boolean(failedImages[slideIndex]);
  const isSplash = variant === 'splash' || fullScreen;

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-label="Loading Nuvvo"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`relative overflow-hidden flex flex-col items-center justify-center w-full bg-slate-50 dark:bg-zinc-950 transition-colors duration-300 ${
        fullScreen ? 'min-h-screen min-h-[100dvh] px-6 py-10' : 'min-h-[70vh] px-6 py-10'
      }`}
    >
      {/* Decorative ambient culinary glow orbs */}
      <div className="pointer-events-none absolute top-0 left-0 w-48 h-48 bg-orange-200/20 dark:bg-orange-900/10 blur-3xl rounded-full" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-64 h-64 bg-amber-200/20 dark:bg-amber-900/15 blur-3xl rounded-full" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center text-center">
        {/* Subtle Pulsing Branded Icon Centerpiece */}
        <div className="relative flex items-center justify-center mb-3">
          {/* Outer soft glowing halo */}
          <motion.div
            aria-hidden="true"
            animate={{
              scale: [0.95, 1.18, 0.95],
              opacity: [0.16, 0.36, 0.16],
            }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="pointer-events-none absolute w-24 h-24 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 blur-xl"
          />

          {/* Subtle expanding pulse ring */}
          <motion.div
            aria-hidden="true"
            animate={{
              scale: [0.95, 1.38],
              opacity: [0.45, 0],
            }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeOut',
            }}
            className="pointer-events-none absolute w-16 h-16 rounded-2xl border border-orange-500/40"
          />

          {/* Gently pulsing branded icon */}
          <motion.div
            animate={{
              scale: [1, 1.055, 1],
            }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <NuvvoLogo
              size={isSplash ? 'lg' : 'md'}
              showText={false}
              animate={false}
            />
          </motion.div>
        </div>

        {/* Brand Wordmark & Live Kitchen Subtitle */}
        <div className="mb-5">
          <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 leading-none">
            Nuvvo
          </h2>
          <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400">
            {isSplash ? 'Fresh Cravings, Delivered Fast' : 'Loading Fresh Kitchens'}
          </p>
        </div>

        {/* Dynamic Appetizing Food Imagery Showcase Card */}
        <div className="w-full relative h-48 rounded-3xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-zinc-900 shadow-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={slideIndex}
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 w-full h-full"
            >
              {!isImageBroken ? (
                <img
                  src={activeSlide.image}
                  alt={activeSlide.title}
                  onError={() =>
                    setFailedImages(prev => ({ ...prev, [slideIndex]: true }))
                  }
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center">
                  <Utensils className="w-10 h-10 text-white/90" />
                </div>
              )}

              {/* Legible Gradient Overlay & Dish Metadata */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

              <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/20">
                  <Flame className="w-3 h-3 text-orange-400" />
                  <span className="text-[10px] font-black text-white uppercase tracking-wider">
                    {activeSlide.cuisine}
                  </span>
                </div>

                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/20">
                  <Clock className="w-3 h-3 text-amber-300" />
                  <span className="text-[10px] font-bold text-white">
                    {activeSlide.eta}
                  </span>
                </div>
              </div>

              <div className="absolute bottom-3.5 left-4 right-4 text-left">
                <p className="text-sm font-black text-white truncate">
                  {activeSlide.title}
                </p>
                <p className="text-[11px] font-medium text-amber-300 truncate mt-0.5">
                  {statusText || activeSlide.caption}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Appetizing Dish Preview Strip */}
        <div className="flex items-center justify-center gap-2 mt-3.5" aria-hidden="true">
          {APPETIZING_FOOD_SLIDES.map((slide, idx) => {
            const isActive = idx === slideIndex;
            const thumbBroken = Boolean(failedImages[idx]);
            return (
              <div
                key={slide.title}
                className={`relative w-10 h-10 rounded-xl overflow-hidden border-2 transition-all duration-300 ${
                  isActive
                    ? 'border-orange-500 scale-110 shadow-md'
                    : 'border-slate-200 dark:border-zinc-800 opacity-60'
                }`}
              >
                {!thumbBroken ? (
                  <img
                    src={slide.image}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-orange-500/20 flex items-center justify-center">
                    <Utensils className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Smooth Progress Bar & Status Caption */}
        <div className="w-full mt-5 bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>

        <p className="mt-2.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
          {statusText || activeSlide.caption} {progress}%
        </p>
      </div>
    </motion.div>
  );
}

export default React.memo(LoadingScreen);
