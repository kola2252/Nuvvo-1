import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  UtensilsCrossed, 
  Store, 
  Hotel, 
  Plus, 
  Sparkles, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import LazyImage from './LazyImage';
import { FoodItem } from '../types';

export default function AdminCatalogManager() {
  const { 
    foodCatalog, 
    addFoodItem, 
    updateFoodItem, 
    deleteFoodItem, 
    seedDishesToSupabase,
    restaurants,
    foodLoading
  } = useApp();

  const [activeTab, setActiveTab] = useState<'dishes' | 'restaurants' | 'hotels'>('dishes');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const handleDeleteDish = async (dishId: string, dishName: string) => {
    setIsDeleting(true);
    setFeedback(null);
    try {
      const res = await deleteFoodItem(dishId);
      if (res.success) {
        setFeedback({ type: 'success', message: `Dish "${dishName}" removed successfully!` });
        setConfirmDeleteId(null);
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to remove dish' });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', message: e?.message || 'Error deleting dish' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Form modal state for dishes
  const [isAddingDish, setIsAddingDish] = useState(false);
  const [editingDishId, setEditingDishId] = useState<string | null>(null);
  const [dishForm, setDishForm] = useState({
    name: '',
    category: 'Biryani & Rice',
    subcategory: 'Chef Special',
    price: '',
    discountPrice: '',
    description: '',
    image: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&auto=format&fit=crop&q=80',
    vegIndicator: 'non-veg' as 'veg' | 'non-veg',
    isAvailable: true,
  });

  const handleSeed = async () => {
    setIsSeeding(true);
    setFeedback(null);
    try {
      const res = await seedDishesToSupabase();
      if (res.success) {
        setFeedback({ type: 'success', message: `Successfully seeded ${res.count || 28} curated dishes!` });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to seed dishes into Supabase' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Network exception during seeding' });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSaveDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishForm.name.trim()) {
      setFeedback({ type: 'error', message: 'Dish name is required.' });
      return;
    }
    const priceNum = Number(dishForm.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setFeedback({ type: 'error', message: 'A valid positive price is required.' });
      return;
    }

    const payload: Omit<FoodItem, 'id'> = {
      name: dishForm.name.trim(),
      category: dishForm.category,
      subcategory: dishForm.subcategory,
      price: priceNum,
      discountPrice: dishForm.discountPrice ? Number(dishForm.discountPrice) : undefined,
      description: dishForm.description.trim(),
      image: dishForm.image.trim(),
      vegIndicator: dishForm.vegIndicator,
      isAvailable: dishForm.isAvailable,
      rating: 4.8,
      reviewsCount: 12,
      prepTime: 20,
      spiceLevel: 'Medium',
      reviews: [],
      ingredients: ["Fresh Native Produce", "Natural Unrefined Oils", "Chef Secret Spices"],
      customizations: [],
      isBestSeller: false,
      isTrending: false,
    };

    if (editingDishId) {
      const res = await updateFoodItem(editingDishId, payload);
      if (res.success) {
        setFeedback({ type: 'success', message: 'Dish updated successfully!' });
        setEditingDishId(null);
        setIsAddingDish(false);
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to update dish' });
      }
    } else {
      const res = await addFoodItem(payload);
      if (res.success) {
        setFeedback({ type: 'success', message: 'New dish added successfully!' });
        setIsAddingDish(false);
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to add dish' });
      }
    }
  };

  const startEditDish = (dish: FoodItem) => {
    setEditingDishId(dish.id);
    setDishForm({
      name: dish.name,
      category: dish.category || 'Specialty',
      subcategory: dish.subcategory || 'Classic',
      price: String(dish.price),
      discountPrice: dish.discountPrice ? String(dish.discountPrice) : '',
      description: dish.description || '',
      image: dish.image || '',
      vegIndicator: (dish.vegIndicator || 'veg') as 'veg' | 'non-veg',
      isAvailable: dish.isAvailable !== false,
    });
    setIsAddingDish(true);
  };

  const filteredDishes = foodCatalog.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.category || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-orange-600 dark:text-orange-500" />
            Catalog & Menu Management
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Manage live dishes, restaurants, and hotel partners in Supabase
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSeed}
            disabled={isSeeding}
            className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
            {isSeeding ? 'Seeding...' : 'Seed Baseline Menu'}
          </button>

          <button
            onClick={() => {
              setEditingDishId(null);
              setDishForm({
                name: '',
                category: 'Biryani & Rice',
                subcategory: 'Chef Special',
                price: '',
                discountPrice: '',
                description: '',
                image: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&auto=format&fit=crop&q=80',
                vegIndicator: 'non-veg',
                isAvailable: true,
              });
              setIsAddingDish(true);
            }}
            className="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-black rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Dish
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`mb-4 p-3 rounded-2xl flex items-center gap-2 text-xs font-bold ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-3 mb-4">
        <button
          onClick={() => setActiveTab('dishes')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer ${
            activeTab === 'dishes'
              ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <UtensilsCrossed className="w-3.5 h-3.5" />
          Dishes ({foodCatalog.length})
        </button>

        <button
          onClick={() => setActiveTab('restaurants')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-colors cursor-pointer ${
            activeTab === 'restaurants'
              ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          Restaurants ({restaurants.length})
        </button>
      </div>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter catalog records..."
          className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {/* Add / Edit Dish Modal */}
      {isAddingDish && (
        <div className="mb-6 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
              {editingDishId ? 'Edit Dish Record' : 'Create New Dish Record'}
            </h3>
            <button
              onClick={() => setIsAddingDish(false)}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveDish} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-zinc-500 mb-1">Dish Name *</label>
              <input
                type="text"
                value={dishForm.name}
                onChange={e => setDishForm({ ...dishForm, name: e.target.value })}
                placeholder="e.g. Chirala Dum Biryani"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-500 mb-1">Category</label>
              <input
                type="text"
                value={dishForm.category}
                onChange={e => setDishForm({ ...dishForm, category: e.target.value })}
                placeholder="Biryani, Starters, Fast Food, etc."
                className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-500 mb-1">Price (₹) *</label>
              <input
                type="number"
                value={dishForm.price}
                onChange={e => setDishForm({ ...dishForm, price: e.target.value })}
                placeholder="249"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-500 mb-1">Discount Price (₹)</label>
              <input
                type="number"
                value={dishForm.discountPrice}
                onChange={e => setDishForm({ ...dishForm, discountPrice: e.target.value })}
                placeholder="199"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-zinc-500 mb-1">Image URL</label>
              <input
                type="url"
                value={dishForm.image}
                onChange={e => setDishForm({ ...dishForm, image: e.target.value })}
                placeholder="https://images.unsplash.com/..."
                className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-zinc-500 mb-1">Description</label>
              <textarea
                value={dishForm.description}
                onChange={e => setDishForm({ ...dishForm, description: e.target.value })}
                placeholder="Flavorful preparation crafted with authentic spices..."
                rows={2}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="flex items-center gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={dishForm.vegIndicator === 'veg'}
                  onChange={e => setDishForm({ ...dishForm, vegIndicator: e.target.checked ? 'veg' : 'non-veg' })}
                  className="rounded text-emerald-600"
                />
                <span className="text-emerald-600 dark:text-emerald-400">Pure Vegetarian</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={dishForm.isAvailable}
                  onChange={e => setDishForm({ ...dishForm, isAvailable: e.target.checked })}
                  className="rounded text-orange-600"
                />
                <span className="text-zinc-700 dark:text-zinc-300">Available For Ordering</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 sm:col-span-2 mt-2">
              <button
                type="button"
                onClick={() => setIsAddingDish(false)}
                className="px-3 py-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black rounded-xl shadow-xs cursor-pointer"
              >
                {editingDishId ? 'Save Changes' : 'Create Dish'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dishes List */}
      {activeTab === 'dishes' && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {filteredDishes.length === 0 ? (
            <p className="text-center py-8 text-xs text-zinc-400">No dishes match your filter.</p>
          ) : (
            filteredDishes.map((dish) => (
              <div
                key={dish.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-slate-200 dark:bg-zinc-700">
                    <LazyImage src={dish.image} alt={dish.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100 truncate">
                      {dish.name}
                    </p>
                    <p className="text-[10px] text-zinc-400 font-medium">
                      ₹{dish.price} • {dish.category || 'Specialty'} • {dish.isAvailable !== false ? '🟢 Active' : '🔴 Inactive'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => startEditDish(dish)}
                    className="p-1.5 text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-zinc-700 rounded-lg cursor-pointer"
                    title="Edit dish"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {confirmDeleteId === dish.id ? (
                    <div className="flex items-center gap-1 animate-in fade-in duration-150">
                      <button
                        onClick={() => handleDeleteDish(dish.id, dish.name)}
                        disabled={isDeleting}
                        className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black rounded-lg shadow-xs cursor-pointer flex items-center gap-1"
                      >
                        {isDeleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        <span>Delete</span>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={isDeleting}
                        className="px-1.5 py-1 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 text-[10px] font-bold rounded-lg cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(dish.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-zinc-700 rounded-lg cursor-pointer transition-colors"
                      title="Delete dish"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Restaurants List */}
      {activeTab === 'restaurants' && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {restaurants.map((rest) => (
            <div
              key={rest.id}
              className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-slate-200 dark:bg-zinc-700">
                  <LazyImage src={rest.image} alt={rest.name} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100 truncate">
                    {rest.name}
                  </p>
                  <p className="text-[10px] text-zinc-400 font-medium">
                    ⭐ {rest.rating} • {rest.address || 'Chirala'} • {rest.cuisine || 'Multi-Cuisine'}
                  </p>
                </div>
              </div>

              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                rest.isOpen !== false ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
              }`}>
                {rest.isOpen !== false ? 'Open' : 'Closed'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
