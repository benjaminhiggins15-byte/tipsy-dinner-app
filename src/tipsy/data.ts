export type Recipe = {
  title: string;
  description: string;
  color: string;
  category: string;
  yield?: string;
  ingredients?: { name: string; qty: string }[];
  steps?: string[];
};

export const houseTomatoSauce: Recipe = {
  title: "House Tomato Sauce",
  description: "A simple, deeply flavored base for pasta and pizza.",
  color: "linear-gradient(135deg, #C17F4A 0%, #8B4513 100%)",
  category: "sauce",
  yield: "Makes 4–5 cups",
  ingredients: [
    { name: "San Marzano tomatoes", qty: "2 × 28oz cans" },
    { name: "Large sweet onion", qty: "1" },
    { name: "Garlic cloves, minced", qty: "4" },
    { name: "Fresh basil", qty: "1 package" },
    { name: "Good olive oil", qty: "a glug" },
    { name: "Sugar", qty: "large pinch" },
    { name: "Salt & pepper", qty: "to taste" },
  ],
  steps: [
    "Sauté onion and minced garlic in a glug of good olive oil over medium heat until soft and very fragrant.",
    "Add canned tomatoes and cook together for 5–10 minutes.",
    "Add basil and simmer for 25–30 minutes, allowing the flavors to blend.",
    "Using a hand blender, blend to your desired consistency.",
    "Season with salt, pepper, and sugar. Let simmer until ready to use — the longer the better.",
  ],
};

export const italianRecipes: Recipe[] = [
  houseTomatoSauce,
  { title: "Cacio e Pepe", description: "Roman pasta at its most elemental. Pecorino, pepper, nothing else.", color: "linear-gradient(135deg, #D4C4A0 0%, #A09060 100%)", category: "italian" },
  { title: "Ribollita", description: "Tuscan bread soup, built for a crowd and better the next day.", color: "linear-gradient(135deg, #A0785A 0%, #6B4A2A 100%)", category: "italian" },
  { title: "Branzino al Forno", description: "Whole roasted sea bass with lemon, capers, and herbs.", color: "linear-gradient(135deg, #5B8FA8 0%, #2C5F7F 100%)", category: "italian" },
  { title: "Tiramisu", description: "The classic, made properly. No shortcuts, no cream cheese.", color: "linear-gradient(135deg, #C4A882 0%, #8B7355 100%)", category: "italian" },
  { title: "Panzanella", description: "Tuscan bread and tomato salad. Summer on a plate.", color: "linear-gradient(135deg, #C4A84A 0%, #8B6914 100%)", category: "italian" },
  { title: "Arancini", description: "Crispy Sicilian rice balls stuffed with ragù and mozzarella.", color: "linear-gradient(135deg, #D4B08A 0%, #A07840 100%)", category: "italian" },
  { title: "Osso Buco", description: "Braised veal shanks with gremolata. A proper Sunday dish.", color: "linear-gradient(135deg, #8B6355 0%, #5B3525 100%)", category: "italian" },
];

export const categories = [
  { key: "italian", label: "Italian", gradient: "linear-gradient(135deg, #C17F4A 0%, #8B4513 100%)" },
  { key: "spanish", label: "Spanish", gradient: "linear-gradient(135deg, #D4844A 0%, #A0522D 100%)" },
  { key: "mexican", label: "Mexican", gradient: "linear-gradient(135deg, #C4A84A 0%, #8B6914 100%)" },
  { key: "greek", label: "Greek", gradient: "linear-gradient(135deg, #5B8FA8 0%, #2C5F7F 100%)" },
  { key: "soups", label: "Soups", gradient: "linear-gradient(135deg, #A0785A 0%, #6B4A2A 100%)" },
  { key: "salads", label: "Salads", gradient: "linear-gradient(135deg, #7AAF8A 0%, #4A7A5A 100%)" },
  { key: "sandwiches", label: "Sandwiches", gradient: "linear-gradient(135deg, #C4A882 0%, #8B7355 100%)" },
  { key: "breakfast", label: "Breakfast", gradient: "linear-gradient(135deg, #E8C97A 0%, #B8942A 100%)" },
];

export const recipesByCategory: Record<string, Recipe[]> = {
  italian: italianRecipes,
};

export function getRecipesForCategory(key: string, label: string): Recipe[] {
  const base = recipesByCategory[key]
    ? recipesByCategory[key]
    : italianRecipes.slice(0, 4).map((r) => ({ ...r, category: label.toLowerCase() }));
  const saved = getSavedRecipesForCategory(key, label);
  return [...saved, ...base];
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
    }));
}
