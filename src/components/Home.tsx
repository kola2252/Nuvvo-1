import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Search, 
  MapPin, 
  Star, 
  Plus, 
  Minus, 
  Clock, 
  Flame, 
  SlidersHorizontal,
  ChevronDown,
  Sparkles,
  Bike
} from 'lucide-react';
import LazyImage from './LazyImage';
import PromotionalCarousel from './PromotionalCarousel';
import PWAInstallBanner from './PWAInstallBanner';
import AddressSelectorModal from './AddressSelectorModal';
import { FoodItem } from '../types';

export default function Home() {
  const { 
    foodCatalog, 
    foodLoading, 
    restaurants, 
    searchQuery, 
    setSearchQuery, 
    setSelectedFoodItem, 
    addToCart, 
    cart, 
    updateCartQuantity,
    currentAddress,
    favoriteFoods,
    toggleFavoriteFood,
    setCurrentPage,
    language
  } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [vegOnly, setVegOnly] = useState<boolean>(false);
  const [showAddressModal, setShowAddressModal] = useState<boolean>(false);

  const categories = ['All', 'Biryani', 'Starters', 'Fast Food', 'Desserts', 'Beverages', 'Thali'];

  // Map cart items by foodId for quick lookup
  const cartItemMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      const current = map.get(item.foodItem.id) || 0;
      map.set(item.foodItem.id, current + item.quantity);
    }
    return map;
  }, [cart]);

  // Filtered dishes based on category, veg indicator, and search query
  const filteredDishes = useMemo(() => {
    return foodCatalog.filter((item) => {
      // Category filter
      if (selectedCategory !== 'All') {
        const matchesCat = item.category?.toLowerCase() === selectedCategory.toLowerCase() ||
                           item.subcategory?.toLowerCase() === selectedCategory.toLowerCase();
        if (!matchesCat) return false;
      }

      // Veg only toggle
      if (vegOnly && item.vegIndicator !== 'veg') {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesDesc = (item.description || '').toLowerCase().includes(q);
        const matchesCat = (item.category || '').toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesCat) return false;
      }

      return true;
    });
  }, [foodCatalog, selectedCategory, vegOnly, searchQuery]);

  return (
    <div className="min-h-screen pb-24 max-w-2xl mx-auto px-4 pt-3">
      {/* Top Bar with Location and App Identity */}
      <header className="flex items-center justify-between gap-3 mb-3">
        <button
          onClick={() => setShowAddressModal(true)}
          className="flex items-center gap-1.5 text-left bg-transparent border-0 cursor-pointer p-0 group"
        >
          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-orange-600 dark:text-orange-400">
              <span>{currentAddress?.type || 'Delivery to'}</span>
              <ChevronDown className="w-3 h-3 group-hover:translate-y-0.5 transition-transform" />
            </div>
            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[180px] sm:max-w-[260px]">
              {currentAddress?.street || 'Chirala Town, Andhra Pradesh'}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm">
            <Sparkles className="w-3 h-3" />
            Nuvvo
          </span>
        </div>
      </header>

      {/* Search Input Bar */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search biryani, starters, pizzas, sweets..."
          className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* PWA Banner if applicable */}
      <PWAInstallBanner />

      {/* Promotional Slider */}
      {!searchQuery && <PromotionalCarousel />}

      {/* Categories & Dietary Filters */}
      <div className="my-3 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-1">
        <div className="flex items-center gap-1.5 shrink-0">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-orange-600 text-white shadow-sm shadow-orange-500/20'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800 hover:border-orange-300'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setVegOnly(!vegOnly)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold shrink-0 border cursor-pointer transition-all ${
            vegOnly
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
              : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Veg</span>
        </button>
      </div>

      {/* Food Items Catalog */}
      <section className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-orange-500" />
            {searchQuery ? 'Search Results' : selectedCategory === 'All' ? 'Popular in Chirala' : selectedCategory}
          </h2>
          <span className="text-xs text-zinc-400 font-medium">
            {filteredDishes.length} items
          </span>
        </div>

        {foodLoading && filteredDishes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-xs text-zinc-500 font-medium">Loading delicious items...</p>
          </div>
        ) : filteredDishes.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 text-center my-6">
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">No dishes found</p>
            <p className="text-xs text-zinc-500 mt-1">Try searching for something else or clearing filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredDishes.map((dish) => {
              const qtyInCart = cartItemMap.get(dish.id) || 0;
              const isFav = favoriteFoods.includes(dish.id);

              return (
                <div
                  key={dish.id}
                  className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-3 flex gap-3 shadow-xs hover:shadow-md transition-all group relative"
                >
                  {/* Dish Thumbnail */}
                  <div 
                    onClick={() => setSelectedFoodItem(dish)}
                    className="relative w-28 h-28 rounded-2xl overflow-hidden shrink-0 cursor-pointer bg-slate-100 dark:bg-zinc-800"
                  >
                    <LazyImage
                      src={dish.image}
                      alt={dish.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {dish.vegIndicator && (
                      <span className={`absolute top-1.5 left-1.5 w-4 h-4 rounded-md border flex items-center justify-center bg-white/90 dark:bg-zinc-900/90 ${
                        dish.vegIndicator === 'veg' ? 'border-emerald-600' : 'border-red-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dish.vegIndicator === 'veg' ? 'bg-emerald-600' : 'bg-red-600'}`} />
                      </span>
                    )}
                  </div>

                  {/* Dish Info */}
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div onClick={() => setSelectedFoodItem(dish)} className="cursor-pointer">
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                          {dish.name}
                        </h3>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                        {dish.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-zinc-800/60">
                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                            ₹{dish.price}
                          </span>
                          {dish.discountPrice && dish.discountPrice < dish.price && (
                            <span className="text-[11px] text-zinc-400 line-through">
                              ₹{dish.discountPrice}
                            </span>
                          )}
                        </div>
                        {dish.rating && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-500 mt-0.5">
                            <Star className="w-3 h-3 fill-amber-400 stroke-amber-400" />
                            <span>{dish.rating}</span>
                          </div>
                        )}
                      </div>

                      {/* Add to Cart Control */}
                      {qtyInCart > 0 ? (
                        <div className="flex items-center bg-orange-600 text-white rounded-xl shadow-xs overflow-hidden">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateCartQuantity(dish.id, -1);
                            }}
                            className="p-1.5 hover:bg-orange-700 transition-colors cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 text-xs font-black">{qtyInCart}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(dish);
                            }}
                            className="p-1.5 hover:bg-orange-700 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(dish);
                          }}
                          className="px-3 py-1.5 bg-orange-50 hover:bg-orange-600 text-orange-600 hover:text-white dark:bg-orange-950/40 dark:text-orange-400 dark:hover:bg-orange-600 dark:hover:text-white border border-orange-200 dark:border-orange-800 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          ADD
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Address Selector Modal */}
      {showAddressModal && (
        <AddressSelectorModal onClose={() => setShowAddressModal(false)} />
      )}
    </div>
  );
}
