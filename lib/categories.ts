// The menu of subjects. Slugs match the file names in db/questions/.
export const CATEGORIES = [
  { slug: "society", label: "Society" },
  { slug: "politics", label: "Politics" },
  { slug: "philosophy", label: "Philosophy" },
  { slug: "future", label: "The future" },
  { slug: "science", label: "Science" },
  { slug: "space", label: "Space" },
  { slug: "health", label: "Health" },
  { slug: "technology", label: "Technology" },
  { slug: "economics", label: "Money" },
  { slug: "history", label: "History" },
  { slug: "geography", label: "Geography" },
  { slug: "math", label: "Math" },
  { slug: "sports", label: "Sports" },
  { slug: "culture", label: "Arts" },
  { slug: "food", label: "Food" },
  { slug: "animals", label: "Animals" },
  { slug: "language", label: "Language" },
  { slug: "everyday", label: "Everyday" },
  { slug: "mysteries", label: "Mysteries" },
  { slug: "general", label: "Asked by people" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export function isCategory(value: string | undefined | null): value is CategorySlug {
  return CATEGORIES.some((c) => c.slug === value);
}
