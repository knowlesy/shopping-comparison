import React from 'react';
import { Shield, Sparkles } from 'lucide-react';
import type { UserPreferences } from '../../types';
import { OptionGroup, SettingsCard, ToggleRow } from './controls';
import type { SectionProps } from './sectionTypes';

export const DealsSection: React.FC<SectionProps> = ({ draft, update }) => (
  <div className="space-y-4">
    <SettingsCard title="Promotions & multibuys" icon={<Sparkles className="w-4 h-4 text-amber-500" />}>
      <ToggleRow
        label="Include multibuy and loyalty card prices"
        description="Counts multibuy bundle savings and Clubcard / Nectar prices. Off compares plain shelf prices only."
        checked={draft.includeDeals ?? true}
        onChange={(includeDeals) => update({ includeDeals })}
      />
    </SettingsCard>

    <SettingsCard
      title="Brand tier"
      icon={<Shield className="w-4 h-4 text-amber-500" />}
      description="The tier ranked first when several products fit an item."
    >
      <OptionGroup<UserPreferences['brandTierPriority']>
        label="Brand tier priority"
        hideLabel
        name="brandTierPriority"
        columns="grid-cols-2 lg:grid-cols-4"
        value={draft.brandTierPriority}
        onChange={(brandTierPriority) => update({ brandTierPriority })}
        options={[
          { value: 'value', label: 'Value / savers' },
          { value: 'standard', label: 'Own-brand standard' },
          { value: 'premium', label: 'Finest / premium' },
          { value: 'branded', label: 'Name brands first' },
        ]}
      />
    </SettingsCard>
  </div>
);
