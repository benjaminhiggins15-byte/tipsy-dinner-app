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
      category: label?.toLowerCase() ?? "",
      ingredients: s.ingredients,
      steps: s.steps,
      savedId: s.id,
      categoryKey: key,
    }));
}

// ==================== CURATE: OCCASIONS & MENUS ====================

const OCCASIONS_STORAGE_KEY = "tipsyDinnerOccasions";
const MENUS_STORAGE_KEY = "tipsyDinnerMenus";

export type Occasion = {
  id: number;
  name: string;
  icon: string; // Tabler icon name (e.g., "IconChefHat")
  createdAt: string;
};

export type MenuSection = "apps" | "mains" | "sides" | "desserts" | "drinks";

export type Menu = {
  id: number;
  occasionId: number;
  title: string;
  description: string;
  enabledSections: MenuSection[]; // Which sections are toggled on
  recipes: {
    apps: number[]; // Array of SavedRecipe IDs
    mains: number[];
    sides: number[];
    desserts: number[];
    drinks: number[];
  };
  createdAt: string;
};

// ==================== OCCASIONS ====================

export function loadOccasions(): Occasion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OCCASIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOccasion(name: string, icon: string): Occasion {
  const occasion: Occasion = {
    id: Date.now(),
    name,
    icon,
    createdAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    const list = loadOccasions();
    list.push(occasion);
    window.localStorage.setItem(OCCASIONS_STORAGE_KEY, JSON.stringify(list));
  }
  return occasion;
}

export function updateOccasion(
  id: number,
  patch: Partial<Pick<Occasion, "name" | "icon">>,
): Occasion | null {
  if (typeof window === "undefined") return null;
  const list = loadOccasions();
  const idx = list.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  const updated: Occasion = { ...list[idx], ...patch };
  list[idx] = updated;
  window.localStorage.setItem(OCCASIONS_STORAGE_KEY, JSON.stringify(list));
  return updated;
}

export function deleteOccasion(id: number) {
  if (typeof window === "undefined") return;
  const list = loadOccasions().filter((o) => o.id !== id);
  window.localStorage.setItem(OCCASIONS_STORAGE_KEY, JSON.stringify(list));
  // Also delete all menus for this occasion
  const menus = loadMenus().filter((m) => m.occasionId !== id);
  window.localStorage.setItem(MENUS_STORAGE_KEY, JSON.stringify(menus));
}

export function findOccasion(id: number): Occasion | null {
  return loadOccasions().find((o) => o.id === id) ?? null;
}

// ==================== MENUS ====================

export function loadMenus(): Menu[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MENUS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMenu(
  occasionId: number,
  title: string,
  description: string,
  enabledSections: MenuSection[],
): Menu {
  const menu: Menu = {
    id: Date.now(),
    occasionId,
    title,
    description,
    enabledSections,
    recipes: {
      apps: [],
      mains: [],
      sides: [],
      desserts: [],
      drinks: [],
    },
    createdAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    const list = loadMenus();
    list.push(menu);
    window.localStorage.setItem(MENUS_STORAGE_KEY, JSON.stringify(list));
  }
  return menu;
}

export function updateMenu(
  id: number,
  patch: Partial<Pick<Menu, "title" | "description" | "enabledSections" | "recipes">>,
): Menu | null {
  if (typeof window === "undefined") return null;
  const list = loadMenus();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const updated: Menu = { ...list[idx], ...patch };
  list[idx] = updated;
  window.localStorage.setItem(MENUS_STORAGE_KEY, JSON.stringify(list));
  return updated;
}

export function deleteMenu(id: number) {
  if (typeof window === "undefined") return;
  const list = loadMenus().filter((m) => m.id !== id);
  window.localStorage.setItem(MENUS_STORAGE_KEY, JSON.stringify(list));
}

export function findMenu(id: number): Menu | null {
  return loadMenus().find((m) => m.id === id) ?? null;
}

export function getMenusForOccasion(occasionId: number): Menu[] {
  return loadMenus().filter((m) => m.occasionId === occasionId);
}

// ==================== MENU RECIPE MANAGEMENT ====================

export function addRecipeToMenuSection(
  menuId: number,
  section: MenuSection,
  recipeId: number,
): Menu | null {
  if (typeof window === "undefined") return null;
  const menu = findMenu(menuId);
  if (!menu) return null;

  // Don't add duplicates
  if (menu.recipes[section].includes(recipeId)) return menu;

  const updatedRecipes = {
    ...menu.recipes,
    [section]: [...menu.recipes[section], recipeId],
  };

  return updateMenu(menuId, { recipes: updatedRecipes });
}

export function removeRecipeFromMenuSection(
  menuId: number,
  section: MenuSection,
  recipeId: number,
): Menu | null {
  if (typeof window === "undefined") return null;
  const menu = findMenu(menuId);
  if (!menu) return null;

  const updatedRecipes = {
    ...menu.recipes,
    [section]: menu.recipes[section].filter((id) => id !== recipeId),
  };

  return updateMenu(menuId, { recipes: updatedRecipes });
}

export function getRecipesForMenuSection(menuId: number, section: MenuSection): SavedRecipe[] {
  const menu = findMenu(menuId);
  if (!menu) return [];

  const recipeIds = menu.recipes[section];
  const allRecipes = loadSavedRecipes();

  return recipeIds
    .map((id) => allRecipes.find((r) => r.id === id))
    .filter((r): r is SavedRecipe => r !== undefined);
}
