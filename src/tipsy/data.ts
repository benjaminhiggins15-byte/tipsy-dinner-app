export type Recipe = {
  title: string;
  description: string;
  color: string;
  category: string;
  yield?: string;
  ingredients?: { name: string; qty: string }[];
  steps?: string[];
  savedId?: number;
  categoryKey?: string;
};

export const categories: { key: string; label: string; gradient: string }[] = [
  { key: "default-1", label: "Default 1", gradient: "linear-gradient(135deg, #C17F4A 0%, #8B4513 100%)" },
  { key: "default-2", label: "Default 2", gradient: "linear-gradient(135deg, #5B8FA8 0%, #2C5F7F 100%)" },
  { key: "default-3", label: "Default 3", gradient: "linear-gradient(135deg, #7AAF8A 0%, #4A7A5A 100%)" },
  { key: "default-4", label: "Default 4", gradient: "linear-gradient(135deg, #C4A84A 0%, #8B6914 100%)" },
  { key: "default-5", label: "Default 5", gradient: "linear-gradient(135deg, #A0785A 0%, #6B4A2A 100%)" },
  { key: "default-6", label: "Default 6", gradient: "linear-gradient(135deg, #C4A882 0%, #8B7355 100%)" },
  { key: "default-7", label: "Default 7", gradient: "linear-gradient(135deg, #D4844A 0%, #A0522D 100%)" },
  { key: "default-8", label: "Default 8", gradient: "linear-gradient(135deg, #E8C97A 0%, #B8942A 100%)" },
];

const CATEGORIES_STORAGE_KEY = "tipsyDinnerCategories";

export type CustomCategory = { key: string; label: string; gradient: string };

export function loadCustomCategories(): CustomCategory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomCategory(name: string, gradient: string): CustomCategory {
  const key = `custom-${Date.now()}`;
  const cat: CustomCategory = { key, label: name, gradient };
  if (typeof window !== "undefined") {
    const list = loadCustomCategories();
    list.push(cat);
    window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(list));
  }
  return cat;
}

export function deleteCustomCategory(key: string) {
  if (typeof window === "undefined") return;
  const list = loadCustomCategories().filter((c) => c.key !== key);
  window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(list));
}

export function updateCustomCategory(key: string, name: string, gradient: string) {
  if (typeof window === "undefined") return;
  const list = loadCustomCategories().map((c) =>
    c.key === key ? { ...c, label: name, gradient } : c,
  );
  window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(list));
}

export function findCustomCategory(key: string): CustomCategory | null {
  return loadCustomCategories().find((c) => c.key === key) ?? null;
}

export function getAllCategories(): { key: string; label: string; gradient: string }[] {
  return loadCustomCategories();
}

export function getRecipesForCategory(key: string, label: string): Recipe[] {
  return getSavedRecipesForCategory(key, label);
}

const STORAGE_KEY = "tipsyDinnerRecipes";

export type SavedRecipe = {
  id: number;
  title: string;
  description: string;
  category: string; // category key
  ingredients: { name: string; qty: string }[];
  steps: string[];
  createdAt: string;
};

export function loadSavedRecipes(): SavedRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecipe(r: SavedRecipe) {
  if (typeof window === "undefined") return;
  const list = loadSavedRecipes();
  list.push(r);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function updateSavedRecipe(
  id: number,
  patch: Partial<Pick<SavedRecipe, "title" | "description" | "ingredients" | "steps">>,
): SavedRecipe | null {
  if (typeof window === "undefined") return null;
  const list = loadSavedRecipes();
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: SavedRecipe = { ...list[idx], ...patch };
  list[idx] = updated;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return updated;
}

export function deleteSavedRecipe(id: number) {
  if (typeof window === "undefined") return;
  const list = loadSavedRecipes().filter((r) => r.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const categoryGradient: Record<string, string> = Object.fromEntries(
  categories.map((c) => [c.key, c.gradient]),
);

export function getSavedRecipesForCategory(key: string, label: string): Recipe[] {
  return loadSavedRecipes()
    .filter((s) => s.category === key)
    .map((s) => ({
      title: s.title,
      description: s.description,
      color: categoryGradient[key] ?? "linear-gradient(135deg, #C5DCF4 0%, #85B7EB 100%)",
      category: label.toLowerCase(),
      ingredients: s.ingredients,
      steps: s.steps,
      savedId: s.id,
      categoryKey: key,
    }));
}
