import React, { useState } from 'react';
import { BookmarkCheck, Plus, Trash2, Tag, Flame, Check, Sparkles } from 'lucide-react';
import { FavoriteItem, IngredientIdea, SupermarketName } from '../types';
import { api } from '../services/api';

interface FavoritesManagerProps {
  favorites: FavoriteItem[];
  setFavorites: React.Dispatch<React.SetStateAction<FavoriteItem[]>>;
  ingredientIdeas: IngredientIdea[];
  setIngredientIdeas: React.Dispatch<React.SetStateAction<IngredientIdea[]>>;
}

export const FavoritesManager: React.FC<FavoritesManagerProps> = ({
  favorites,
  setFavorites,
  ingredientIdeas,
  setIngredientIdeas,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'ideas' | 'storeFavs'>('ideas');

  // New Ingredient Idea Form state
  const [ideaName, setIdeaName] = useState('');
  const [ideaCategory, setIdeaCategory] = useState<'protein' | 'dairy' | 'produce' | 'bakery' | 'pantry' | 'household'>('protein');
  const [ideaFormat, setIdeaFormat] = useState('');
  const [ideaIcon, setIdeaIcon] = useState('🥩');

  // New Store Favorite Form state
  const [favName, setFavName] = useState('');
  const [favStore, setFavStore] = useState<SupermarketName>('tesco');
  const [favBrand, setFavBrand] = useState('');
  const [favQty, setFavQty] = useState('');

  // Add new ingredient idea
  const handleAddIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ideaName.trim() || !ideaFormat.trim()) return;
    try {
      const created = await api.addIngredientIdea({
        name: ideaName.trim(),
        category: ideaCategory,
        defaultFormat: ideaFormat.trim(),
        icon: ideaIcon,
        isPopular: true,
      });
      setIngredientIdeas(prev => [...prev, created]);
      setIdeaName('');
      setIdeaFormat('');
    } catch (err) {
      console.error('Error adding idea:', err);
    }
  };

  // Delete idea
  const handleDeleteIdea = async (id: string) => {
    try {
      await api.removeIngredientIdea(id);
      setIngredientIdeas(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error('Error deleting idea:', err);
    }
  };

  // Add new store favorite
  const handleAddStoreFav = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!favName.trim()) return;
    try {
      const created = await api.addFavorite({
        name: favName.trim(),
        preferredSupermarket: favStore,
        preferredBrand: favBrand.trim() || undefined,
        defaultQuantity: favQty.trim() || undefined,
        category: 'general',
      });
      setFavorites(prev => [...prev, created]);
      setFavName('');
      setFavBrand('');
      setFavQty('');
    } catch (err) {
      console.error('Error adding favorite:', err);
    }
  };

  // Delete store fav
  const handleDeleteStoreFav = async (id: string) => {
    try {
      await api.removeFavorite(id);
      setFavorites(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error('Error deleting favorite:', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold uppercase">
          <BookmarkCheck className="w-3.5 h-3.5" />
          <span>Personal Preferences & Idea Bank</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
          Favorites & Ingredient Word Window
        </h1>
        <p className="text-slate-500 text-sm max-w-2xl">
          Customize your favorite grocery ideas for quick 1-tap list addition and set your preferred store items.
        </p>

        {/* Tab switch */}
        <div className="flex items-center space-x-2 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setActiveSubTab('ideas')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeSubTab === 'ideas'
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            🔥 Ingredient Ideas Word Window ({ingredientIdeas.length})
          </button>
          <button
            onClick={() => setActiveSubTab('storeFavs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeSubTab === 'storeFavs'
                ? 'bg-slate-900 text-white dark:bg-emerald-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            ⭐ Store Specific Favorites ({favorites.length})
          </button>
        </div>
      </div>

      {activeSubTab === 'ideas' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Add New Idea Form */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center space-x-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Add New Ingredient Idea Chip</span>
            </h3>

            <form onSubmit={handleAddIdea} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Ingredient Name
                </label>
                <input
                  type="text"
                  value={ideaName}
                  onChange={e => setIdeaName(e.target.value)}
                  placeholder="e.g. Sourdough Loaf"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Default Format (with quantity)
                </label>
                <input
                  type="text"
                  value={ideaFormat}
                  onChange={e => setIdeaFormat(e.target.value)}
                  placeholder="e.g. 500g artisan sourdough loaf"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Category
                  </label>
                  <select
                    value={ideaCategory}
                    onChange={e => setIdeaCategory(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="protein">Meat & Protein</option>
                    <option value="dairy">Dairy & Eggs</option>
                    <option value="produce">Produce & Greens</option>
                    <option value="bakery">Bakery & Grains</option>
                    <option value="pantry">Pantry & Tinned</option>
                    <option value="household">Household & Cleaning</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Emoji Icon
                  </label>
                  <input
                    type="text"
                    value={ideaIcon}
                    onChange={e => setIdeaIcon(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none text-center"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition"
              >
                Add Idea to Word Window
              </button>
            </form>
          </div>

          {/* Current Ingredient Chips Grid */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Current Word Window Idea Chips ({ingredientIdeas.length})
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto pr-1">
              {ingredientIdeas.map(idea => (
                <div
                  key={idea.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs"
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <span className="text-base">{idea.icon || '🌱'}</span>
                    <div className="truncate">
                      <strong className="text-slate-900 dark:text-white block">{idea.name}</strong>
                      <span className="text-[11px] text-slate-400">{idea.defaultFormat}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteIdea(idea.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition ml-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Store Specific Favorites */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Add Favorite Form */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center space-x-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Add Supermarket Favorite Item</span>
            </h3>

            <form onSubmit={handleAddStoreFav} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  value={favName}
                  onChange={e => setFavName(e.target.value)}
                  placeholder="e.g. Sourdough Loaf"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Preferred Store
                  </label>
                  <select
                    value={favStore}
                    onChange={e => setFavStore(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none capitalize"
                  >
                    <option value="tesco">Tesco</option>
                    <option value="asda">Asda</option>
                    <option value="sainsburys">Sainsbury's</option>
                    <option value="morrisons">Morrisons</option>
                    <option value="iceland">Iceland</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Preferred Brand
                  </label>
                  <input
                    type="text"
                    value={favBrand}
                    onChange={e => setFavBrand(e.target.value)}
                    placeholder="e.g. Market Street Bakery"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition"
              >
                Save Store Favorite
              </button>
            </form>
          </div>

          {/* Store Favorites List */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Preferred Items by Store ({favorites.length})
            </h3>

            {favorites.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No store favorites added yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {favorites.map(fav => (
                  <div
                    key={fav.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs"
                  >
                    <div>
                      <strong className="text-slate-900 dark:text-white block">{fav.name}</strong>
                      <span className="text-[11px] text-slate-400 capitalize">
                        Preferred at: <strong className="text-emerald-600">{fav.preferredSupermarket}</strong> {fav.preferredBrand ? `(${fav.preferredBrand})` : ''}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeleteStoreFav(fav.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
