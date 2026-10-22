/**
 * Languages a companion can list on her profile. A fixed preset
 * list keeps the chips tidy and comparable across profiles; the
 * ones she picks are stored as plain strings in
 * profiles.languages (migration 071).
 */
export const LANGUAGE_OPTIONS: string[] = [
  'English',
  'Nigerian Pidgin',
  'Yoruba',
  'Hausa',
  'Igbo',
  'French',
  'Arabic',
  'Spanish',
  'Portuguese',
  'German',
  'Italian',
  'Chinese',
];

export const MAX_LANGUAGES = 6;
