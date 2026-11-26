/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Utensils } from 'lucide-react';
import NuvvoLogo from './NuvvoLogo';

interface FoodSlide {
  title: string;
  cuisine: string;
  caption: string;
  image: string;
}

const APPETIZING_FOOD_SLIDES: FoodSlide[] = [
  {
    title: 'Hyderabadi Chicken Dum Biryani',
    cuisine: 'Signature Dum',
    caption: 'Layering fragrant saffron basmati & spices...',
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&q=85&w=720',
  },
  {
    title: 'Woodfired Artisan Margherita',
    cuisine: 'Hot From Oven',
    caption: 'Pulling hand-stretched sourdough crust...',
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=85&w=720',
  },
  {
    title: 'Crispy Ghee Podi Masala Dosa',
    cuisine: 'South Indian',
    caption: 'Crisping golden tiffins & fresh chutneys...',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=85&w=720',
  },
  {
    title: 'Double Smoke Grill Burger',
    cuisine: 'Chef Craft',
    caption: 'Searing flame-grilled gourmet patties...',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=85&w=720',
  },
  {
    title: 'Royal Paneer Butter Masala',
    cuisine: 'North Indian',
    caption: 'Simmering rich velvet tomato gravy...',
    image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&q=85&w=720',
  },
];

export interface LoadingScreenProps {
  /** Use full viewport height for initial splash boot, or main container height for Suspense component fetching */
  fullScreen?: boolean;
  /** Optional presentation mode: 'splash' for initial app boot or 'suspense' for lazy component fetching */
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
  const [progress, setProgress] = useState(variant === 'splash' ? 12 : 24);
  const [slideIndex, setSlideIndex] = useState(() =>
    Math.floor(Math.random() * APPETIZING_FOOD_SLIDES.length)
  );
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  // Preload food imagery for smooth visual transitions
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

  // Dynamically rotate appetizing food imagery while components initialize
  useEffect(() => {
    const slideTimer = setInterval(() => {
      setSlideIndex(prev => (prev + 1) % APPETIZING_FOOD_SLIDES.length);
    }, 1750);

    return () => clearInterval(slideTimer);
  }, []);

  const activeSlide = APPETIZING_FOOD_SLIDES[slideIndex];
  const isImageBroken = Boolean(failedImages[slideIndex]);
  const isSplash = variant === 'splash' || fullScreen;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Nuvvo"
      className={`relative overflow-hidden flex flex-col items-center justify-center w-full bg-slate-50 dark:bg-zinc-950 transition-colors duration-300 ${
        fullScreen ? 'min-h-screen min-h-[100dvh] px-6 py-10' : 'min-h-[70vh] px-6 py-10'
      }`}
    >
      {/* Decorative ambient background gradients */}
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

        {/* Brand Wordmark & Fetching Label */}
        <div className="mb-5">
          <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 leading-none">
            Nuvvo
          </h2>
          <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400">
            {isSplash ? 'Food & Fast Delivery' : 'Loading Kitchens'}
          </p>
        </div>

        {/* Dynamic Appetizing Food Imagery Showcase */}
        <div className="w-full relative h-44 rounded-3xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-zinc-900 shadow-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={slideIndex}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
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

              {/* Legible Gradient Overlay & Dish Details */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                <span className="text-[10px] font-black text-white uppercase tracking-wider">
                  {activeSlide.cuisine}
                </span>
              </div>

              <div className="absolute bottom-3 left-3.5 right-3.5 text-left">
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

        {/* Slide Indicator Dots */}
        <div className="flex items-center justify-center gap-1.5 mt-3" aria-hidden="true">
          {APPETIZING_FOOD_SLIDES.map((slide, idx) => (
            <span
              key={slide.title}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === slideIndex
                  ? 'w-5 bg-orange-500'
                  : 'w-1.5 bg-zinc-300 dark:bg-zinc-700'
              }`}
            />
          ))}
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
    </div>
  );
}

export default React.memo(LoadingScreen);
