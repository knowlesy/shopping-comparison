import React from 'react';
import { Package, Wrench } from 'lucide-react';
import type { UserPreferences } from '../../types';
import { OptionGroup, SettingsCard, ToggleRow } from './controls';
import { AiSection, type AiTestState } from './AiSection';
import { DirectLookupsSection } from './DirectLookupsSection';
import { CacheSection, type CacheState } from './CacheSection';
import { AboutSection, type AboutState } from './AboutSection';
import type { SectionProps } from './sectionTypes';

interface AdvancedSectionProps extends SectionProps {
  cache: CacheState;
  about: AboutState;
  aiTest: AiTestState;
}

export const AdvancedSection: React.FC<AdvancedSectionProps> = ({ draft, update, cache, about, aiTest }) => (
  <div className="space-y-4">
    <SettingsCard title="Matching" icon={<Package className="w-4 h-4 text-indigo-500" />}>
      <OptionGroup<NonNullable<UserPreferences['cutMatchingStrategy']>>
        label="Meat and fish cuts"
        name="cutMatchingStrategy"
        columns="grid-cols-1 sm:grid-cols-2"
        value={draft.cutMatchingStrategy || 'best_value'}
        onChange={(cutMatchingStrategy) => update({ cutMatchingStrategy })}
        options={[
          {
            value: 'best_value',
            label: 'Best value (equivalent cuts)',
            description: 'Treats loins, fillets and portions as equivalent to find the lowest £/kg.',
          },
          {
            value: 'strict_cut',
            label: 'Strict cut only',
            description: 'Only the cut on your list, e.g. only loins when you type loins.',
          },
        ]}
      />
      <OptionGroup<UserPreferences['packSizingPolicy']>
        label="Pack sizing"
        name="packSizingPolicy"
        value={draft.packSizingPolicy}
        onChange={(packSizingPolicy) => update({ packSizingPolicy })}
        options={[
          { value: 'closest', label: 'Closest single pack', description: 'e.g. 750g for a 900g target' },
          { value: 'cover', label: 'Cover the target', description: 'e.g. 2 × 500g for a 900g target' },
          { value: 'cheapest_per_unit', label: 'Lowest £/kg', description: 'Best unit price' },
        ]}
      />
      <ToggleRow
        label="Allow mixed pack sizes"
        description="Combines different pack sizes (e.g. 500g + 250g + 250g) to find the cheapest way to reach the target weight. Off uses one pack size, multiplied."
        checked={draft.allowMixedPackSizes ?? false}
        onChange={(allowMixedPackSizes) => update({ allowMixedPackSizes })}
      />
    </SettingsCard>

    <AiSection draft={draft} update={update} aiTest={aiTest} />
    <DirectLookupsSection draft={draft} update={update} />
    <CacheSection draft={draft} update={update} cache={cache} />

    <SettingsCard title="Developer mode" icon={<Wrench className="w-4 h-4 text-amber-500" />}>
      <ToggleRow
        label="Developer mode"
        badge={
          draft.devMode ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 uppercase">
              Active
            </span>
          ) : undefined
        }
        description="Turns off auto-archiving of comparisons. Manual saves are labelled [DEV] in history. Turn off for real weekly shops."
        checked={draft.devMode || false}
        onChange={(devMode) => update({ devMode })}
      />
    </SettingsCard>

    <AboutSection about={about} />
  </div>
);
