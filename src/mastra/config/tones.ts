// Centralized tone options for maintainability and flexibility

export const TONE_OPTIONS = [
  "professional",
  "groovy",
  "librarian",
  "sports",
] as const;

export type Tone = typeof TONE_OPTIONS[number];

export const DEFAULT_TONE: Tone = "professional";