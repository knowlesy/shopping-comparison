import React, { useId, useState } from 'react';
import { Ban, ChevronDown, Circle, Heart, Leaf, RotateCcw, ShieldAlert } from 'lucide-react';
import {
  DEFAULT_FOOD_RATINGS,
  DIETS,
  FOOD_CATEGORIES,
  ratingOf,
  type DietId,
  type FoodCategory,
  type FoodRating,
  type FoodRatings,
} from '../../../../shared/foodTypes.js';
import { LinkButton, PEER_FOCUS_RING, SettingsCard, ToggleRow, FOCUS_RING } from './controls';
import type { SectionProps } from './sectionTypes';

const RATING_OPTIONS: Array<{ value: FoodRating; label: string; icon: React.ReactNode; selected: string }> = [
  {
    value: 'love',
    label: 'Love',
    icon: <Heart className="w-3.5 h-3.5" aria-hidden="true" />,
    selected: 'bg-emerald-600 text-white border-emerald-600',
  },
  {
    value: 'ok',
    label: 'OK',
    icon: <Circle className="w-3 h-3" aria-hidden="true" />,
    selected: 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600',
  },
  {
    value: 'never',
    label: 'Never',
    icon: <Ban className="w-3.5 h-3.5" aria-hidden="true" />,
    selected: 'bg-rose-600 text-white border-rose-600',
  },
];

// Label column, then Love / OK / Never. Shared by the header row and every type row so
// the columns line up on desktop.
const GRID_COLUMNS = 'md:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)]';

/** Set one type's rating, storing only Love and Never. */
export function withRating(ratings: FoodRatings, categoryId: string, typeId: string, rating: FoodRating): FoodRatings {
  const category = { ...(ratings[categoryId] || {}) };
  if (rating === 'ok') delete category[typeId];
  else category[typeId] = rating;
  const next = { ...ratings, [categoryId]: category };
  if (Object.keys(category).length === 0) delete next[categoryId];
  return next;
}

interface RatingRowProps {
  category: FoodCategory;
  typeId: string;
  label: string;
  rating: FoodRating;
  onChange: (rating: FoodRating) => void;
}

/**
 * One type: a radiogroup of Love / OK / Never. On desktop the options sit in the block's
 * columns as icons; on mobile they form a labelled three-way segmented control.
 */
const RatingRow: React.FC<RatingRowProps> = ({ category, typeId, label, rating, onChange }) => {
  const labelId = useId();
  const isOk = rating === 'ok';
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={`grid grid-cols-1 ${GRID_COLUMNS} items-center gap-x-2 gap-y-1.5 py-2 border-t border-slate-100 dark:border-slate-800 first:border-t-0`}
    >
      <span
        id={labelId}
        className={`text-xs ${isOk ? 'text-slate-400 dark:text-slate-500' : 'font-bold text-slate-900 dark:text-white'}`}
      >
        {label}
      </span>
      <div className="grid grid-cols-3 md:contents rounded-lg border border-slate-200 dark:border-slate-700 md:border-0 overflow-hidden">
        {RATING_OPTIONS.map((opt) => {
          const selected = opt.value === rating;
          return (
            <label key={opt.value} className="relative cursor-pointer md:flex md:justify-center">
              <input
                type="radio"
                name={`rating-${category.id}-${typeId}`}
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                aria-label={`${opt.label}: ${label}`}
                className="peer sr-only"
              />
              <span
                className={`flex items-center justify-center gap-1 h-9 md:h-8 md:w-11 text-[11px] font-bold transition border-slate-200 dark:border-slate-700 md:border md:rounded-full ${PEER_FOCUS_RING} ${
                  selected
                    ? opt.selected
                    : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                } ${opt.value === 'ok' ? 'border-x md:border-x' : ''}`}
                title={opt.label}
              >
                {opt.icon}
                <span className="md:sr-only">{opt.label}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

interface CategoryBlockProps {
  category: FoodCategory;
  ratings: FoodRatings;
  onChange: (next: FoodRatings) => void;
}

const CategoryBlock: React.FC<CategoryBlockProps> = ({ category, ratings, onChange }) => {
  const setCount = Object.keys(ratings[category.id] || {}).length;
  return (
    <SettingsCard
      title={category.label}
      description={
        <>
          {setCount > 0 ? `${setCount} set` : 'All OK'}
          {category.description && <span className="block mt-0.5">{category.description}</span>}
        </>
      }
      actions={
        <LinkButton
          onClick={() => {
            const next = { ...ratings };
            delete next[category.id];
            onChange(next);
          }}
          disabled={setCount === 0}
          aria-label={`Reset ${category.label} to OK`}
        >
          Reset
        </LinkButton>
      }
    >
      <div>
        <div
          aria-hidden="true"
          className={`hidden md:grid ${GRID_COLUMNS} gap-x-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400`}
        >
          <span>Type</span>
          <span className="text-center">Love</span>
          <span className="text-center">OK</span>
          <span className="text-center">Never</span>
        </div>
        {category.types.map((type) => (
          <RatingRow
            key={type.id}
            category={category}
            typeId={type.id}
            label={type.label}
            rating={ratingOf(ratings, category.id, type.id)}
            onChange={(rating) => onChange(withRating(ratings, category.id, type.id, rating))}
          />
        ))}
      </div>
    </SettingsCard>
  );
};

const DietBlock: React.FC<{ diet: DietId[]; onChange: (next: DietId[]) => void }> = ({ diet, onChange }) => {
  const groupId = useId();
  return (
    <SettingsCard
      title="Diet filters"
      icon={<ShieldAlert className="w-4 h-4 text-amber-500" />}
      description="Hard filter: products that break a diet are left out, whatever the price."
    >
      <div role="group" aria-labelledby={groupId} className="flex flex-wrap gap-2">
        <span id={groupId} className="sr-only">Diets</span>
        {DIETS.map((d) => {
          const on = diet.includes(d.id);
          return (
            <label key={d.id} className="relative cursor-pointer">
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => onChange(e.target.checked ? [...diet, d.id] : diet.filter((x) => x !== d.id))}
                className="peer sr-only"
              />
              <span
                className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-bold transition ${PEER_FOCUS_RING} ${
                  on
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {d.label}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-1.5">
        Best effort — always check the pack. Filters read product titles only; this is not an allergen check.
      </p>
    </SettingsCard>
  );
};

export const FoodSection: React.FC<SectionProps> = ({ draft, update }) => {
  const [showMore, setShowMore] = useState(false);
  const ratings = draft.foodRatings || {};
  const common = FOOD_CATEGORIES.filter((c) => c.common);
  const more = FOOD_CATEGORIES.filter((c) => !c.common);
  const setRatings = (next: FoodRatings) => update({ foodRatings: next });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-prose">
          Rate the kinds of food you buy. <strong>Love</strong> ranks a type higher, <strong>Never</strong> pushes it
          to the bottom (it is only picked when a store has nothing else). Anything you type on your list, like
          “white bread”, always wins.
        </p>
        <LinkButton
          onClick={() => update({ foodRatings: DEFAULT_FOOD_RATINGS, diet: [], healthierDefault: true, preferOrganic: false })}
          className="inline-flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          Reset food to defaults
        </LinkButton>
      </div>

      {common.map((category) => (
        <CategoryBlock key={category.id} category={category} ratings={ratings} onChange={setRatings} />
      ))}

      {more.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showMore}
            aria-controls="more-food-categories"
            onClick={() => setShowMore((v) => !v)}
            className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${FOCUS_RING}`}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} aria-hidden="true" />
            {showMore ? 'Fewer categories' : `More categories (${more.map((c) => c.label).join(', ')})`}
          </button>
          <div id="more-food-categories" hidden={!showMore} className="space-y-4">
            {showMore &&
              more.map((category) => (
                <CategoryBlock key={category.id} category={category} ratings={ratings} onChange={setRatings} />
              ))}
          </div>
        </>
      )}

      <DietBlock diet={draft.diet || []} onChange={(diet) => update({ diet })} />

      <SettingsCard title="Everything else" icon={<Leaf className="w-4 h-4 text-emerald-500" />}>
        <div className="space-y-2">
          <ToggleRow
            label="Healthier yogurt by default"
            description="When the list does not say, favour 0% and low-fat yogurt, and read “Greek yogurt” as 0% fat."
            checked={draft.healthierDefault}
            onChange={(healthierDefault) => update({ healthierDefault })}
          />
          <ToggleRow
            label="Prefer organic"
            description="Ranks organic products higher across every item, and non-organic ones a little lower."
            checked={draft.preferOrganic}
            onChange={(preferOrganic) => update({ preferOrganic })}
          />
        </div>
      </SettingsCard>
    </div>
  );
};
