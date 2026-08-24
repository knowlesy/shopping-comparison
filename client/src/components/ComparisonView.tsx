import React, { useState } from 'react';
import {
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Bookmark,
  Share2,
  Printer,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  TrendingDown,
  ShieldCheck,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  Package,
  Layers,
} from 'lucide-react';
import {
  ComparisonResponse,
  ParsedItem,
  SupermarketName,
  ItemMatch,
  SupermarketProduct,
} from '../types';
import { getLiveSupermarketUrl, extractSearchQuery } from '../services/clientEngine';

interface ComparisonViewProps {
  comparison: ComparisonResponse;
  items: ParsedItem[];
  setItems: React.Dispatch<React.SetStateAction<ParsedItem[]>>;
  onUpdateQuantity: (store: SupermarketName, itemId: string, newPacks: number) => void;
  onOpenSwapModal: (item: ParsedItem, store: SupermarketName, currentMatch: ItemMatch) => void;
  onSaveToArchive: () => void;
  onBackToList: () => void;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({
  comparison,
  items,
  setItems,
  onUpdateQuantity,
  onOpenSwapModal,
  onSaveToArchive,
  onBackToList,
}) => {
  const [selectedItemFilter, setSelectedItemFilter] = useState<string | null>(null);
  const [showSplitDetails, setShowSplitDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const { supermarkets, cheapestStore, highestStore, splitOptimization } = comparison;
  const storeKeys: SupermarketName[] = (Object.keys(supermarkets) as SupermarketName[]).filter(k => supermarkets[k]);

  // Toggle item check on the left checklist
  const toggleItemCheck = (id: string) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  // Copy shareable summary
  const handleCopySummary = () => {
    const summary = `🛒 UK Supermarket Price Comparison (TrolleyWise UK)\n` +
      `Items: ${items.length}\n` +
      `Cheapest Store: ${supermarkets[cheapestStore]?.info.name} (£${supermarkets[cheapestStore]?.totalPrice.toFixed(2)})\n` +
      `Split Basket Savings: £${splitOptimization.combinedTotal.toFixed(2)} (${splitOptimization.explanation})\n` +
      `\nStore Totals:\n` +
      storeKeys
        .map(k => `${supermarkets[k]?.info.name}: £${supermarkets[k]?.totalPrice.toFixed(2)}`)
        .join('\n');

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveArchive = () => {
    onSaveToArchive();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Action & Summary Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold uppercase">
              Live UK Comparison
            </span>
            <span className="text-xs text-slate-500">
              {items.length} items parsed & compared
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
            Supermarket Price & Sizing Matrix
          </h1>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSaveArchive}
            className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-100 dark:bg-emerald-950 hover:bg-emerald-200 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>{saved ? '✓ Weekly Shop Locked In!' : '🔒 Lock In Weekly Shop'}</span>
          </button>

          <button
            onClick={handleCopySummary}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{copied ? '✓ Copied Summary!' : 'Share Summary'}</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
            title="Print Shopping Sheet"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onBackToList}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm"
          >
            <span>Edit List</span>
          </button>
        </div>
      </div>

      {/* Supermarket Summary Cards Row with horizontal scroll */}
      <div className="overflow-x-auto pb-3 pt-2 scrollbar-thin -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-4 min-w-max">
          {storeKeys.map(storeKey => {
            const store = supermarkets[storeKey];
            if (!store) return null;
            const isCheapest = store.isCheapest;

            return (
              <div
                key={storeKey}
                className={`w-[170px] sm:w-[190px] shrink-0 relative rounded-2xl p-4 sm:p-5 border transition-all flex flex-col justify-between ${
                  isCheapest
                    ? 'bg-gradient-to-b from-emerald-50/80 to-white dark:from-emerald-950/40 dark:to-slate-900 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300'
                }`}
              >
                {isCheapest && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold tracking-wider uppercase shadow-sm flex items-center space-x-1 whitespace-nowrap">
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    <span>Cheapest Overall</span>
                  </div>
                )}

                <div>
                  {/* Store Header with clean stacked layout */}
                  <div className="mb-3">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: store.info.themeColor }}
                      />
                      <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                        {store.info.name}
                      </span>
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-medium text-slate-500 pl-4.5 mt-0.5">
                      {store.itemsFound}/{store.itemsTotal} items
                    </div>
                  </div>

                  {/* Total Price */}
                  <div className="space-y-1 mb-4">
                    <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      £{store.totalPrice.toFixed(2)}
                    </div>
                    <div className="flex flex-col text-xs text-slate-500">
                      <span>Subtotal: £{store.subtotal.toFixed(2)}</span>
                      <span>
                        {store.deliveryFee === 0 ? (
                          <strong className="text-emerald-600 font-semibold">Free Delivery</strong>
                        ) : (
                          `+£${store.deliveryFee.toFixed(2)} delivery`
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Health & Savings Badges */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {store.savingsVsHighest > 0 ? (
                      <div className="flex items-center space-x-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                        <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Saves £{store.savingsVsHighest.toFixed(2)} vs highest</span>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">Baseline price</div>
                    )}

                    <div className="flex items-center space-x-1 text-xs text-slate-500">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>{store.averageHealthScore}% Health score</span>
                    </div>
                  </div>
                </div>

                {/* Direct Store Link */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <a
                    href={store.info.searchBaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-1 transition ${
                      isCheapest
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className="truncate">Open {store.info.name}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Split Basket Optimizer Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-teal-500/10 border border-amber-500/30 dark:border-amber-500/20 rounded-2xl p-5 transition">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-extrabold shadow-sm shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Smart Split-Basket Optimization
                </h2>
                {splitOptimization.savingsVsSingleBest > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold uppercase">
                    Save £{splitOptimization.savingsVsSingleBest.toFixed(2)} Extra
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {splitOptimization.explanation}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 self-end sm:self-center">
            <div className="text-right">
              <div className="text-xs text-slate-500">Combined Split Total</div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white">
                £{splitOptimization.combinedTotal.toFixed(2)}
              </div>
            </div>

            <button
              onClick={() => setShowSplitDetails(!showSplitDetails)}
              className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center space-x-1"
            >
              <span>{showSplitDetails ? 'Hide Split' : 'View Split'}</span>
              {showSplitDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expandable Split Breakdown */}
        {showSplitDetails && (
          <div className="mt-4 pt-4 border-t border-amber-500/20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {splitOptimization.stores.map(splitStore => (
              <div
                key={splitStore.supermarket}
                className="bg-white/80 dark:bg-slate-900/80 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    {splitStore.info.name} ({splitStore.items.length} items)
                  </span>
                  <span className="font-extrabold text-sm text-emerald-600">
                    £{splitStore.storeSubtotal.toFixed(2)}
                  </span>
                </div>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {splitStore.items.map(m => (
                    <li key={m.parsedItem.id} className="flex justify-between">
                      <span className="truncate pr-2">{m.parsedItem.name}</span>
                      <strong className="text-slate-900 dark:text-slate-200 shrink-0">
                        £{m.totalPrice.toFixed(2)}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Split Layout: Left Checklist + Right Comparison Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Interactive Checklist (Sticky) */}
        <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Shopping Checklist
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                {items.filter(i => i.checked).length}/{items.length} done
              </span>
            </div>

            {/* Checklist items */}
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItemFilter(selectedItemFilter === item.id ? null : item.id)}
                  className={`group flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    selectedItemFilter === item.id
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500'
                      : item.checked
                      ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 opacity-60'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleItemCheck(item.id);
                      }}
                      className="text-slate-400 hover:text-emerald-600 transition shrink-0"
                    >
                      <CheckCircle2
                        className={`w-4 h-4 ${
                          item.checked ? 'text-emerald-600 fill-emerald-100 dark:fill-emerald-950' : ''
                        }`}
                      />
                    </button>
                    <div className="truncate">
                      <span
                        className={`font-medium ${
                          item.checked ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {item.name}
                      </span>
                      <div className="text-[10px] text-slate-400">
                        Target: {item.targetQuantity} {item.unit}
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-semibold text-slate-400 group-hover:text-emerald-600 shrink-0">
                    Row #{idx + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Per-Item Comparison Cards */}
        <div className="lg:col-span-8 space-y-6">
          <div className="space-y-6">
            {items
              .filter(item => !selectedItemFilter || item.id === selectedItemFilter)
              .map((item, idx) => {
                // Find lowest price for this specific item across all 5 supermarkets
                let minItemPrice = Infinity;
                storeKeys.forEach(k => {
                  const m = supermarkets[k]?.items.find(i => i.parsedItem.id === item.id);
                  if (m && m.product && m.totalPrice < minItemPrice) {
                    minItemPrice = m.totalPrice;
                  }
                });

                return (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
                  >
                    {/* Item Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-2">
                      <div className="flex items-center space-x-3">
                        <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className="font-extrabold text-base text-slate-900 dark:text-white">
                            {item.name}
                          </h4>
                          <div className="flex items-center space-x-2 text-xs text-slate-500">
                            <span>Target: {item.targetQuantity} {item.unit}</span>
                            <span>•</span>
                            <span className="capitalize">{item.category}</span>
                            {item.isHealthierPreferred && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-600 font-semibold">
                                  {item.fatPercentage ? `${item.fatPercentage}% Lean Bias` : 'Healthy Bias'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lowest store badge for this row */}
                      {minItemPrice < Infinity && (
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold self-start sm:self-center">
                          Lowest: £{minItemPrice.toFixed(2)}
                        </span>
                      )}
                    </div>

                    {/* Supermarket Match Row for this Item with smooth horizontal scrolling */}
                    <div className="overflow-x-auto pb-3 pt-2 scrollbar-thin -mx-2 px-2 sm:mx-0 sm:px-0">
                      <div className="flex gap-3 min-w-max">
                        {storeKeys.map(storeKey => {
                          const match = supermarkets[storeKey]?.items.find(
                            i => i.parsedItem.id === item.id
                          );
                          const product = match?.product;
                          const isBestPrice = match && product && match.totalPrice === minItemPrice;

                          return (
                            <div
                              key={storeKey}
                              className={`w-[142px] sm:w-[155px] shrink-0 relative rounded-xl p-3 border flex flex-col justify-between transition ${
                                isBestPrice
                                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                                  : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700'
                              }`}
                            >
                              {/* Best Badge on Top Border */}
                              {isBestPrice && (
                                <div className="absolute -top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-extrabold tracking-wider uppercase shadow-xs flex items-center space-x-0.5">
                                  <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                                  <span>Best</span>
                                </div>
                              )}

                              <div>
                                {/* Store Name Header */}
                                <div className="mb-2">
                                  <span
                                    className="text-[11px] font-extrabold uppercase tracking-tight truncate block"
                                    style={{ color: supermarkets[storeKey]?.info.themeColor }}
                                    title={supermarkets[storeKey]?.info.name}
                                  >
                                    {supermarkets[storeKey]?.info.shortName || supermarkets[storeKey]?.info.name}
                                  </span>
                                </div>

                                {product ? (
                                  <div className="flex flex-col flex-1 justify-between space-y-2">
                                    <div>
                                      {/* Product Image on Top */}
                                      <div className="w-full h-24 sm:h-28 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center p-1.5 mb-2 overflow-hidden">
                                        <img
                                          src={product.imageUrl}
                                          alt={product.title}
                                          className="max-h-full max-w-full object-contain rounded-lg transition"
                                          onError={e => {
                                            (e.target as HTMLElement).style.display = 'none';
                                          }}
                                        />
                                      </div>

                                      {/* Product Title Below Image */}
                                      <div
                                        className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2 min-h-[32px] mb-1 leading-snug"
                                        title={product.title}
                                      >
                                        {product.title}
                                      </div>

                                      {/* Packaging & Calculation */}
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 pt-0.5">
                                        <div className="flex items-center space-x-1">
                                          <Package className="w-3 h-3 text-slate-400 shrink-0" />
                                          <span className="truncate">
                                            {match.packsNeeded > 1
                                              ? `${match.packsNeeded} × ${product.packageDisplay} = ${match.totalQuantity}${product.packageUnit}`
                                              : product.packageDisplay}
                                          </span>
                                        </div>
                                        <div className="text-slate-400 text-[10px]">
                                          {product.unitPrice > 0 && `(£${product.unitPrice.toFixed(2)} ${product.unitPriceMeasure})`}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Price & Chg Action */}
                                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                                      <div className="text-center">
                                        <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                                          £{match.totalPrice.toFixed(2)}
                                        </div>
                                        {match.packsNeeded > 1 && (
                                          <div className="text-[10px] text-slate-400 font-medium">
                                            ({match.packsNeeded} × £{(product.clubcardPrice || product.price).toFixed(2)})
                                          </div>
                                        )}
                                      </div>

                                      {/* Chg Action */}
                                      <button
                                        type="button"
                                        onClick={() => onOpenSwapModal(item, storeKey, match)}
                                        className="w-full py-1.5 px-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 text-xs font-bold text-emerald-700 dark:text-emerald-300 transition flex items-center justify-center space-x-1 border border-emerald-200/60 dark:border-emerald-800/60 shadow-xs"
                                      >
                                        <RefreshCw className="w-3 h-3 shrink-0" />
                                        <span>
                                          Chg {match.alternatives && match.alternatives.length > 0 ? `(${match.alternatives.length})` : ''}
                                        </span>
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="py-6 text-center text-xs text-slate-400 space-y-1">
                                    <p>No exact match</p>
                                    <button
                                      type="button"
                                      onClick={() => onOpenSwapModal(item, storeKey, match || {
                                        parsedItem: item,
                                        supermarket: storeKey,
                                        product: null,
                                        packsNeeded: 1,
                                        totalQuantity: item.targetQuantity,
                                        totalPrice: 0,
                                        effectiveUnitPrice: 0,
                                        weightDifferencePercent: 0,
                                        isClosestPack: false,
                                        matchScore: 0
                                      })}
                                      className="text-emerald-600 dark:text-emerald-400 font-semibold underline text-[11px]"
                                    >
                                      Choose product
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};
