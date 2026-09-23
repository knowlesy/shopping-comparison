import type { UserPreferences } from '../../types';

/** Every section edits the page's draft; nothing is saved until the save bar says so. */
export interface SectionProps {
  draft: UserPreferences;
  update: (patch: Partial<UserPreferences>) => void;
}
