import React, { useState, useEffect } from 'react';
import { X, Search, Check, Package, Sparkles } from 'lucide-react';
import {
  ParsedItem,
  SupermarketName,
  ItemMatch,
  SupermarketProduct,
} from '../types';
import { api } from '../services/api';

interface ItemSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ParsedItem | null;
  store: SupermarketName | null;
  currentMatch: ItemMatch | null;
  onSelectAlternative: (store: SupermarketName, item: ParsedItem, newProduct: SupermarketProduct, customPacks?: number) => void;
}

export const ItemSwapModal: React.FC<ItemSwapModalProps> = ({
  isOpen,
  onClose,
  item,
  store,
  currentMatch,
  onSelectAlternative,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [alternatives, setAlternatives] = useState<SupermarketProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPacksMap, setSelectedPacksMap] = useState<Record<string, number>>({});
  const [activeFilter, setActiveFilter] = useState<string>('all');

  useEffect(() => {
    if (isOpen && store && item) {
      const cleanTerm = (item.baseItem || item.name || '')
        .replace(/\b\d+%\s*(?:fat|lean)?\b/gi, '')
        .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|lt|ml|pints?|pt|pack|packs|tin|tins|tub|tubs|loaves|loaf)\b/gi, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      setSearchQuery(cleanTerm || item.baseItem || item.name);
      setActiveFilter('all');

      // Pre-seed alternatives immediately for 0ms render
      if (currentMatch?.alternatives && currentMatch.alternatives.length > 0) {
        setAlternatives(currentMatch.alternatives);
      }

      // Fetch comprehensive alternatives for this supermarket
      fetchAlternatives(store, cleanTerm || item.baseItem || item.name, currentMatch?.alternatives);
    }
  }, [isOpen, store, item]);

  const fetchAlternatives = async (targetStore: SupermarketName, query: string, seedAlts?: SupermarketProduct[]) => {
    try {
      setLoading(true);
      const res = await api.getAlternatives(targetStore, query);
      const combined = [...(seedAlts || []), ...res];
      const seen = new Set<string>();
      const deduped = combined.filter(p => {
        if (!p || !p.id || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      setAlternatives(deduped);
    } catch (err) {
      console.error('Error fetching alternatives:', err);
      if (seedAlts && seedAlts.length > 0) {
        setAlternatives(seedAlts);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (store && searchQuery) {
      fetchAlternatives(store, searchQuery);
    }
  };

  const getPacksForProduct = (prodId: string, defaultPacks: number) => {
    return selectedPacksMap[prodId] !== undefined ? selectedPacksMap[prodId] : defaultPacks;
  };

  const updatePacksForProduct = (prodId: string, newPacks: number) => {
    setSelectedPacksMap(prev => ({
      ...prev,
      [prodId]: Math.max(1, newPacks),
    }));
  };

  // Generate instant client-side filter chips based on item category & characteristics
  const getFilterChips = (targetItem: ParsedItem) => {
    const nameLower = (targetItem.name || '').toLowerCase();
    const cat = targetItem.category;

    if (cat === 'fish' || nameLower.includes('cod') || nameLower.includes('salmon') || nameLower.includes('fish')) {
      return [
        { id: 'all', label: 'All Fish' },
        { id: 'loin', label: 'Loins Only' },
        { id: 'fillet', label: 'Fillets / Portions' },
        { id: 'frozen', label: 'Frozen' },
        { id: 'fresh', label: 'Fresh' },
      ];
    }

    if (cat === 'meat' && (nameLower.includes('mince') || nameLower.includes('beef'))) {
      return [
        { id: 'all', label: 'All Mince' },
        { id: '5', label: '5% Lean' },
        { id: '12', label: '10-15% Standard' },
        { id: '20', label: '20% Value' },
        { id: 'frozen', label: 'Frozen' },
        { id: 'fresh', label: 'Fresh' },
      ];
    }

    if (cat === 'meat' && nameLower.includes('chicken')) {
      return [
        { id: 'all', label: 'All Chicken' },
        { id: 'breast', label: 'Breast' },
        { id: 'thigh', label: 'Thighs' },
        { id: 'mini', label: 'Mini Fillets' },
        { id: 'diced', label: 'Diced' },
      ];
    }

    if (cat === 'dairy-eggs' && nameLower.includes('egg')) {
      return [
        { id: 'all', label: 'All Eggs' },
        { id: 'free-range', label: 'Free Range' },
        { id: 'organic', label: 'Organic' },
        { id: '15', label: '15 Pack' },
        { id: '12', label: '10-12 Pack' },
      ];
    }

    if (cat === 'dairy-eggs' && (nameLower.includes('yogurt') || nameLower.includes('yoghurt'))) {
      return [
        { id: 'all', label: 'All Yogurt' },
        { id: '0%', label: '0% Fat Free' },
        { id: 'greek', label: 'Authentic Greek' },
        { id: '1kg', label: '1kg Big Pot' },
      ];
    }

    return [
      { id: 'all', label: 'All Options' },
      { id: 'frozen', label: 'Frozen' },
      { id: 'fresh', label: 'Fresh' },
      { id: 'organic', label: 'Organic' },
    ];
  };

  // Instant 0ms client-side filter
  const filteredAlternatives = alternatives.filter(prod => {
    if (activeFilter === 'all') return true;
    const titleLower = prod.title.toLowerCase();

    if (activeFilter === 'loin') return titleLower.includes('loin');
    if (activeFilter === 'fillet') return titleLower.includes('fillet') || titleLower.includes('portion');
    if (activeFilter === 'frozen') return prod.isFrozen || titleLower.includes('frozen');
    if (activeFilter === 'fresh') return !prod.isFrozen && !titleLower.includes('frozen');
    if (activeFilter === '5') return prod.fatPercentage === 5 || titleLower.includes('5%');
    if (activeFilter === '12') return (prod.fatPercentage !== undefined && prod.fatPercentage > 5 && prod.fatPercentage <= 15) || titleLower.includes('10%') || titleLower.includes('12%') || titleLower.includes('15%');
    if (activeFilter === '20') return (prod.fatPercentage !== undefined && prod.fatPercentage > 15) || titleLower.includes('20%');
    if (activeFilter === 'breast') return titleLower.includes('breast');
    if (activeFilter === 'thigh') return titleLower.includes('thigh');
    if (activeFilter === 'mini') return titleLower.includes('mini');
    if (activeFilter === 'diced') return titleLower.includes('diced');
    if (activeFilter === 'free-range') return prod.isFreeRange || titleLower.includes('free range');
    if (activeFilter === 'organic') return prod.isOrganic || titleLower.includes('organic');
    if (activeFilter === '0%') return prod.fatPercentage === 0 || titleLower.includes('0%') || titleLower.includes('fat free');
    if (activeFilter === 'greek') return titleLower.includes('greek');
    if (activeFilter === '1kg') return prod.packageSize === 1000 || titleLower.includes('1kg');
    if (activeFilter === '15') return prod.packageSize === 15 || titleLower.includes('15');
    if (activeFilter === '12') return prod.packageSize === 12 || prod.packageSize === 10 || titleLower.includes('12');

    return true;
  });

  if (!isOpen || !item || !store) return null;

  const filterChips = getFilterChips(item);

  return (
    <div data-testid="item-swap-modal" className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                Swap Alternative
              </span>
              <span className="text-xs text-slate-500 font-bold capitalize">{store}</span>
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
              Choose replacement for "{item.name}"
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            data-testid="modal-close-btn"
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Quick Cut Filter Chips */}
        <div className="p-6 pb-2 space-y-3">
          <form onSubmit={handleSearch} className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search ${store} products...`}
              className="w-full pl-10 pr-24 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <button
              type="submit"
              className="absolute right-2 top-2 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
            >
              Search
            </button>
          </form>

          {/* Quick Cut & Format Filter Chips (0ms instant client-side filtering) */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
            {filterChips.map(chip => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActiveFilter(chip.id)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition whitespace-nowrap ${
                  activeFilter === chip.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Current selection summary with interactive quantity adjustment */}
        {currentMatch?.product && (
          <div className="mx-6 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3 shadow-xs">
            <div className="flex items-center space-x-3 min-w-0 pr-2">
              <img
                src={currentMatch.product.imageUrl}
                alt={currentMatch.product.title}
                className="w-11 h-11 rounded-xl object-contain bg-white border border-slate-200 dark:border-slate-700 p-1 shrink-0"
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="min-w-0 space-y-0.5">
                <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-400">
                  Currently Selected
                </span>
                <p className="font-bold text-slate-900 dark:text-white truncate">
                  {currentMatch.product.title}
                </p>
                <p className="text-[11px] text-slate-500">
                  {currentMatch.product.packageDisplay} • £{currentMatch.product.unitPrice.toFixed(2)} {currentMatch.product.unitPriceMeasure}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end space-x-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-800">
              {/* Stepper for current item */}
              <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => updatePacksForProduct(currentMatch.product!.id, Math.max(1, getPacksForProduct(currentMatch.product!.id, currentMatch.packsNeeded) - 1))}
                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="Decrease quantity"
                >
                  -
                </button>
                <span className="text-xs font-extrabold px-2 text-slate-900 dark:text-white">
                  {getPacksForProduct(currentMatch.product.id, currentMatch.packsNeeded)}
                </span>
                <button
                  type="button"
                  onClick={() => updatePacksForProduct(currentMatch.product!.id, getPacksForProduct(currentMatch.product!.id, currentMatch.packsNeeded) + 1)}
                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="Increase quantity"
                >
                  +
                </button>
              </div>

              <div className="text-right min-w-[65px]">
                <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  £{(getPacksForProduct(currentMatch.product.id, currentMatch.packsNeeded) * (currentMatch.product.clubcardPrice || currentMatch.product.price)).toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400">
                  (£{(currentMatch.product.clubcardPrice || currentMatch.product.price).toFixed(2)} ea)
                </div>
              </div>

              <button
                onClick={() => {
                  onSelectAlternative(store, item, currentMatch.product!, getPacksForProduct(currentMatch.product!.id, currentMatch.packsNeeded));
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center space-x-1 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
            </div>
          </div>
        )}

        {/* Alternatives List */}
        <div className="p-6 space-y-3 max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Searching store catalog...</div>
          ) : filteredAlternatives.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <p className="text-sm">No alternative products found for filter "{activeFilter}".</p>
              <p className="text-xs">Click "All" or try a broader search term above.</p>
            </div>
          ) : (
            filteredAlternatives.map(prod => {
              const isSelected = currentMatch?.product?.id === prod.id;
              
              // Calculate default packs needed based on target
              let targetAmount = item.targetQuantity || 1;
              let prodAmount = prod.packageSize || 1;
              if (item.unit === 'kg' || item.unit === 'l') targetAmount *= 1000;
              if (prod.packageUnit === 'kg' || prod.packageUnit === 'l') prodAmount *= 1000;
              if ((item.unit === 'g' || item.unit === 'kg') && prodAmount <= 1) prodAmount = 500;

              const defaultPacks = Math.min(12, Math.max(1, Math.round(targetAmount / (prodAmount || 1))));
              const packs = getPacksForProduct(prod.id, isSelected ? currentMatch?.packsNeeded || defaultPacks : defaultPacks);
              
              const unitPrice = prod.clubcardPrice || prod.price;
              const totalPrice = Number((packs * unitPrice).toFixed(2));

              return (
                <div
                  key={prod.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl border transition gap-3 ${
                    isSelected
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/20'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <img
                      src={prod.imageUrl}
                      alt={prod.title}
                      className="w-12 h-12 rounded-xl object-contain bg-white shrink-0 border border-slate-200 dark:border-slate-700 p-1"
                      onError={e => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                          {prod.title}
                        </span>
                        {prod.isHealthier && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold shrink-0">
                            {prod.fatPercentage ? `${prod.fatPercentage}% Fat` : 'Healthy'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-slate-500 flex-wrap gap-y-1">
                        <span>{prod.packageDisplay}</span>
                        <span>•</span>
                        <span>{prod.tier} tier</span>
                        <span>•</span>
                        <span>£{prod.unitPrice.toFixed(2)} {prod.unitPriceMeasure}</span>
                        {prod.deal && (
                          <>
                            <span>•</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 font-extrabold shrink-0">
                              🏷️ {prod.deal.badge || prod.deal.rawText}
                            </span>
                          </>
                        )}
                        {prod.confidence && (
                          <>
                            <span>•</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {prod.confidence}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    {/* Quantity Stepper */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => updatePacksForProduct(prod.id, Math.max(1, packs - 1))}
                        className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition"
                        title="Decrease quantity"
                      >
                        -
                      </button>
                      <span className="text-xs font-extrabold px-2 text-slate-900 dark:text-white">
                        {packs}
                      </span>
                      <button
                        type="button"
                        onClick={() => updatePacksForProduct(prod.id, packs + 1)}
                        className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition"
                        title="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right min-w-[65px]">
                      <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                        £{totalPrice.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        (£{unitPrice.toFixed(2)} ea)
                      </div>
                    </div>

                    <button
                      data-testid="modal-choose-btn"
                      onClick={() => {
                        onSelectAlternative(store, item, prod, packs);
                        onClose();
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1 ${
                        isSelected
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-slate-100 dark:bg-slate-700 hover:bg-emerald-600 hover:text-white text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Update</span>
                        </>
                      ) : (
                        <span>Choose</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
