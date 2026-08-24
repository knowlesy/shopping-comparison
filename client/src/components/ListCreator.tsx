import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  ClipboardList,
  Flame,
  ArrowRight,
  RefreshCw,
  Tag,
  Heart,
  Search,
  BookOpen,
} from 'lucide-react';
import { ParsedItem, IngredientIdea, SupermarketName } from '../types';

interface ListCreatorProps {
  items: ParsedItem[];
  setItems: React.Dispatch<React.SetStateAction<ParsedItem[]>>;
  ingredientIdeas: IngredientIdea[];
  onCompare: (itemsToCompare?: ParsedItem[]) => void;
  onParseRawList: (rawText: string) => Promise<any>;
  loading: boolean;
  enabledSupermarkets?: SupermarketName[];
}

export const EXAMPLE_LIST_TEXT = `900g 5% lean beef mince
1.6kg frozen cod loins
15 free range eggs
1kg authentic Greek yogurt 0%
800g tinned brown lentils
1.13L semi-skimmed milk
1kg wholewheat fusilli
2kg baby new potatoes
1kg Scottish rolled oats
800g wholemeal sliced bread
3 x 400g Mutti Polpa chopped tomatoes
200g tomato puree
500ml extra virgin olive oil
1kg courgettes
1kg mixed bell peppers
400g closed cup mushrooms
600g baby plum tomatoes
1kg carrots
1 head celery
1kg brown onions
1kg red onions
1 pack garlic bulbs
240g fresh baby spinach
1 bunch bananas
800g conference pears
600g clementines
200g walnut halves and whole almonds
150g chia seeds`;

export const ListCreator: React.FC<ListCreatorProps> = ({
  items,
  setItems,
  ingredientIdeas,
  onCompare,
  onParseRawList,
  loading,
  enabledSupermarkets = ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'],
}) => {
  const [inputMode, setInputMode] = useState<'paste' | 'checklist'>('paste');
  const [rawText, setRawText] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [ideaSearch, setIdeaSearch] = useState('');

  // Handle parse
  const handleParseAndBuild = async () => {
    if (!rawText.trim()) return;
    await onParseRawList(rawText);
    setInputMode('checklist');
  };

  // Load sample list
  const handleLoadSample = async () => {
    setRawText(EXAMPLE_LIST_TEXT);
    await onParseRawList(EXAMPLE_LIST_TEXT);
    setInputMode('checklist');
  };

  // Add single item
  const handleAddSingleItem = async () => {
    if (!quickInput.trim()) return;
    const combined = (items.length > 0 ? items.map(i => i.rawText).join('\n') + '\n' : '') + quickInput.trim();
    setRawText(combined);
    await onParseRawList(combined);
    setQuickInput('');
  };

  // Add item from Ingredient Ideas Word Window
  const handleAddIdea = async (idea: IngredientIdea) => {
    const existingRaw = items.length > 0 ? items.map(i => i.rawText).join('\n') : (rawText.trim() ? rawText.trim() : '');
    const newRaw = existingRaw ? `${existingRaw}\n${idea.defaultFormat}` : idea.defaultFormat;
    setRawText(newRaw);
    await onParseRawList(newRaw);
    setInputMode('checklist');
  };

  // Toggle checkmark
  const toggleItemCheck = (id: string) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  };

  // Remove item
  const removeItem = (id: string) => {
    setItems(prev => {
      const updated = prev.filter(item => item.id !== id);
      setRawText(updated.map(i => i.rawText).join('\n'));
      return updated;
    });
  };

  // Filtered Ideas
  const filteredIdeas = ingredientIdeas.filter(idea => {
    const matchesCat = activeCategoryFilter === 'all' || idea.category === activeCategoryFilter;
    const matchesSearch = idea.name.toLowerCase().includes(ideaSearch.toLowerCase()) ||
      idea.defaultFormat.toLowerCase().includes(ideaSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const categories = [
    { id: 'all', label: '🌟 All Ideas', icon: '🌟' },
    { id: 'protein', label: '🥩 Meat & Fish', icon: '🥩' },
    { id: 'dairy', label: '🥛 Dairy & Eggs', icon: '🥛' },
    { id: 'produce', label: '🥦 Produce & Greens', icon: '🥦' },
    { id: 'bakery', label: '🍞 Bakery & Oats', icon: '🍞' },
    { id: 'pantry', label: '🥫 Pantry & Oils', icon: '🥫' },
    { id: 'household', label: '🧼 Cleaning & Household', icon: '🧼' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white p-6 sm:p-10 shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-emerald-200 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>UK Supermarket Price Comparison Engine</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Build your shopping list & find the lowest UK supermarket prices.
          </h1>
          <p className="text-emerald-100 text-sm sm:text-base leading-relaxed">
            Paste your complete list or pick from your favorite ingredients. We intelligently analyze pack sizes (e.g. 900g beef mince $\rightarrow$ 750g or 2x500g), healthier preferences (5% lean, 0% yogurt), and find live prices across <strong className="text-white">Asda, Sainsbury's, Tesco, Morrisons, and Iceland</strong>.
          </p>
        </div>
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-12 translate-y-12">
          <ClipboardList className="w-96 h-96 text-white" />
        </div>
      </div>

      {/* Main 2-Column Grid: List Input on Left & Word Window on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: List Builder / Pasting */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            {/* View Mode Switcher */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setInputMode('paste')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    inputMode === 'paste'
                      ? 'bg-slate-900 text-white dark:bg-emerald-600'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  📝 Paste Full List
                </button>
                <button
                  onClick={() => setInputMode('checklist')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center space-x-1.5 ${
                    inputMode === 'checklist'
                      ? 'bg-slate-900 text-white dark:bg-emerald-600'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>✓ Checklist</span>
                  {items.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500 text-white">
                      {items.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Sample loader button */}
              <button
                onClick={handleLoadSample}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Load 28-Item Sample List</span>
              </button>
            </div>

            {/* Mode 1: Paste Textarea */}
            {inputMode === 'paste' ? (
              <div className="space-y-4">
                <div className="relative">
                  <textarea
                    rows={14}
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                    placeholder="Paste items here, one per line e.g.&#10;900g 5% lean beef mince&#10;1.6kg frozen cod loins&#10;15 free range eggs&#10;1kg authentic Greek yogurt 0%&#10;1.13L semi-skimmed milk..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-4 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition resize-y"
                  />
                  <div className="absolute right-3 bottom-3 text-xs text-slate-400">
                    {rawText.split('\n').filter(l => l.trim()).length} items
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      setRawText('');
                      setItems([]);
                    }}
                    className="px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                  >
                    Clear Text
                  </button>

                  <button
                    onClick={handleParseAndBuild}
                    disabled={loading || !rawText.trim()}
                    className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
                  >
                    <span>Parse into Checklist</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              /* Mode 2: Interactive Checklist */
              <div className="space-y-4">
                {/* Single item input bar */}
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={quickInput}
                    onChange={e => setQuickInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddSingleItem()}
                    placeholder="Add item (e.g. 500g mature cheddar or 1 Fairy liquid)..."
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    onClick={handleAddSingleItem}
                    disabled={!quickInput.trim()}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition flex items-center space-x-1 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Items List */}
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {items.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 space-y-2">
                      <ClipboardList className="w-10 h-10 mx-auto stroke-1" />
                      <p className="text-sm">Your shopping list is empty.</p>
                      <p className="text-xs">Paste a list or tap items in the Word Window to add!</p>
                    </div>
                  ) : (
                    items.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition ${
                          item.checked
                            ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 opacity-60'
                            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <button
                            onClick={() => toggleItemCheck(item.id)}
                            className="text-slate-400 hover:text-emerald-600 transition"
                          >
                            <CheckCircle2
                              className={`w-5 h-5 ${
                                item.checked ? 'text-emerald-600 fill-emerald-100 dark:fill-emerald-950' : ''
                              }`}
                            />
                          </button>
                          <div className="truncate">
                            <span
                              className={`text-sm font-medium ${
                                item.checked ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {item.name}
                            </span>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                {item.category}
                              </span>
                              {item.isHealthierPreferred && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center space-x-0.5">
                                  <Heart className="w-2.5 h-2.5 fill-emerald-600" />
                                  <span>{item.fatPercentage ? `${item.fatPercentage}% Lean` : 'Healthy'}</span>
                                </span>
                              )}
                              {item.brandPreference && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                  {item.brandPreference}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Bottom Compare Bar */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Ready to compare <strong className="text-slate-800 dark:text-white">{items.length} items</strong> across {enabledSupermarkets.length} supermarkets
              </div>
              <button
                onClick={async () => {
                  let listToCompare = items;
                  if (rawText.trim()) {
                    const parsed = await onParseRawList(rawText);
                    if (parsed && parsed.length > 0) {
                      listToCompare = parsed;
                    }
                  }
                  if (listToCompare.length > 0) {
                    onCompare(listToCompare as any);
                  }
                }}
                disabled={loading || (items.length === 0 && !rawText.trim())}
                className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 transition transform active:scale-95 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Compare Prices Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Favorite Ingredients "Word Window / Idea Cloud" */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Favorite Ingredients Word Window
                  </h2>
                  <p className="text-xs text-slate-500">Click any ingredient chip to instantly add to your list</p>
                </div>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryFilter(cat.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${
                    activeCategoryFilter === cat.id
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search within Ideas */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={ideaSearch}
                onChange={e => setIdeaSearch(e.target.value)}
                placeholder="Search ideas (e.g. mince, oats, cod, fairy)..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Word Window Idea Chips Cloud */}
            <div className="flex flex-wrap gap-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredIdeas.map(idea => (
                <button
                  key={idea.id}
                  onClick={() => handleAddIdea(idea)}
                  className="group flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40 text-slate-800 dark:text-slate-200 transition active:scale-95"
                >
                  <span>{idea.icon || '🌱'}</span>
                  <span>{idea.name}</span>
                  <span className="text-[10px] text-slate-400 group-hover:text-emerald-600 font-semibold ml-0.5">
                    + Add
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-2 text-[11px] text-slate-400 text-center flex items-center justify-center space-x-1">
              <BookOpen className="w-3.5 h-3.5" />
              <span>You can also customize your favorites in the Favorites tab.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
