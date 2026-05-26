import { supabase } from '../lib/supabase';

export type Recipe = {
  title: string;
  description: string;
  color: string;
  category: string;
  yield?: string;
  ingredients?: { name: string; qty: string }[];
  steps?: string[];
  savedId?: number | string; // Can be UUID from Supabase or legacy number from localStorage
  categoryKey?: string;
};

// Gradient palette for categories
const GRADIENT_PALETTE = [
  "linear-gradient(135deg, #C17F4A 0%, #8B4513 100%)",
  "linear-gradient(135deg, #5B8FA8 0%, #2C5F7F 100%)",
  "linear-gradient(135deg, #7AAF8A 0%, #4A7A5A 100%)",
  "linear-gradient(135deg, #C4A84A 0%, #8B6914 100%)",
  "linear-gradient(135deg, #A0785A 0%, #6B4A2A 100%)",
  "linear-gradient(135deg, #C4A882 0%, #8B7355 100%)",
  "linear-gradient(135deg, #D4844A 0%, #A0522D 100%)",
  "linear-gradient(135deg, #E8C97A 0%, #B8942A 100%)",
];

// Export gradient palette as categories for NewCategory component compatibility
export const categories = GRADIENT_PALETTE.map((gradient, index) => ({
  key: `gradient-${index}`,
  label: `Gradient ${index + 1}`,
  gradient,
}));

export type CustomCategory = { key: string; label: string; gradient: string };

// Generate consistent gradient from UUID
function generateGradientFromUUID(uuid: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(uuid.length, 8); i++) {
    hash += uuid.charCodeAt(i);
  }
  return GRADIENT_PALETTE[hash % GRADIENT_PALETTE.length];
}

export async function loadCustomCategories(): Promise<CustomCategory[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('id, name')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (categories || []).map((cat) => ({
      key: cat.id,
      label: cat.name,
      gradient: generateGradientFromUUID(cat.id),
    }));
  } catch (error) {
    console.error('Error loading categories:', error);
    return [];
  }
}

export async function saveCustomCategory(name: string, gradient: string): Promise<CustomCategory> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Cannot save category: no user session');
  }

  try {
    const { data: category, error } = await supabase
      .from('categories')
      .insert({
        user_id: userId,
        name: name,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      key: category.id,
      label: category.name,
      gradient: generateGradientFromUUID(category.id),
    };
  } catch (error) {
    console.error('Error saving category:', error);
    throw error;
  }
}

export async function deleteCustomCategory(key: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot delete category: no user session');
    return;
  }

  try {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', key)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting category:', error);
  }
}

export async function updateCustomCategory(key: string, name: string, gradient: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot update category: no user session');
    return;
  }

  try {
    const { error } = await supabase
      .from('categories')
      .update({ name })
      .eq('id', key)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating category:', error);
  }
}

export async function findCustomCategory(key: string): Promise<CustomCategory | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }

  try {
    const { data: category, error } = await supabase
      .from('categories')
      .select('id, name')
      .eq('id', key)
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    return {
      key: category.id,
      label: category.name,
      gradient: generateGradientFromUUID(category.id),
    };
  } catch (error) {
    console.error('Error finding category:', error);
    return null;
  }
}

export async function getAllCategories(): Promise<{ key: string; label: string; gradient: string }[]> {
  return await loadCustomCategories();
}

export async function getRecipesForCategory(key: string, label: string): Promise<Recipe[]> {
  return await getSavedRecipesForCategory(key, label);
}

// ==================== RECIPES ====================

export type SavedRecipe = {
  id: number | string; // Can be UUID from Supabase or legacy number from localStorage
  title: string;
  description: string;
  category: string; // category key
  ingredients: { name: string; qty: string }[];
  steps: string[];
  createdAt: string;
  source?: 'ai' | 'manual';
};

// Helper to get current user ID
async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch (error) {
    console.error('Error getting user session:', error);
    return null;
  }
}

// Load all saved recipes for current user
export async function loadSavedRecipes(): Promise<SavedRecipe[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  try {
    // Fetch recipes with ingredients in one query using join
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select(`
        id,
        title,
        description,
        steps,
        created_at,
        source,
        ingredients (
          name,
          quantity,
          sort_order
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform to SavedRecipe format
    return (recipes || []).map((recipe: any) => ({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      category: '',
      ingredients: (recipe.ingredients || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((ing: any) => ({
          name: ing.name,
          qty: ing.quantity,
        })),
      steps: recipe.steps || [],
      createdAt: recipe.created_at,
      source: recipe.source,
    }));
  } catch (error) {
    console.error('Error loading recipes:', error);
    return [];
  }
}

// Save recipe to Supabase
export async function saveRecipe(r: SavedRecipe, source: 'ai' | 'manual' = 'manual', categoryId?: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot save recipe: no user session');
    return;
  }

  try {
    // Insert recipe (let Supabase generate the UUID)
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        user_id: userId,
        title: r.title,
        description: r.description,
        steps: r.steps,
        created_at: r.createdAt,
        source: source,
      })
      .select()
      .single();

    if (recipeError) throw recipeError;

    // Insert ingredients using the generated recipe UUID
    if (r.ingredients && r.ingredients.length > 0) {
      const ingredientsToInsert = r.ingredients.map((ing, index) => ({
        recipe_id: recipe.id,  // Use the UUID returned by Supabase
        user_id: userId,
        name: ing.name,
        quantity: ing.qty,
        sort_order: index,
      }));

      const { error: ingredientsError } = await supabase
        .from('ingredients')
        .insert(ingredientsToInsert);

      if (ingredientsError) throw ingredientsError;
    }

    // Insert category association if categoryId provided
    if (categoryId) {
      const { error: categoryError } = await supabase
        .from('recipe_categories')
        .insert({
          recipe_id: recipe.id,
          category_id: categoryId,
          user_id: userId,
        });

      if (categoryError) throw categoryError;
    }
  } catch (error) {
    console.error('Error saving recipe:', error);
    throw error;
  }
}

// Update saved recipe
export async function updateSavedRecipe(
  id: number | string,
  patch: Partial<Pick<SavedRecipe, "title" | "description" | "ingredients" | "steps">>,
): Promise<SavedRecipe | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot update recipe: no user session');
    return null;
  }

  try {
    // Build update object (only fields that are provided)
    const updateData: any = {};
    if (patch.title !== undefined) updateData.title = patch.title;
    if (patch.description !== undefined) updateData.description = patch.description;
    if (patch.steps !== undefined) updateData.steps = patch.steps;

    // Update recipe
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('recipes')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId);

      if (updateError) throw updateError;
    }

    // Update ingredients if provided
    if (patch.ingredients !== undefined) {
      // Delete existing ingredients
      const { error: deleteError } = await supabase
        .from('ingredients')
        .delete()
        .eq('recipe_id', id);

      if (deleteError) throw deleteError;

      // Insert new ingredients
      if (patch.ingredients.length > 0) {
        const ingredientsToInsert = patch.ingredients.map((ing, index) => ({
          recipe_id: id,
          name: ing.name,
          quantity: ing.qty,
          sort_order: index,
        }));

        const { error: insertError } = await supabase
          .from('ingredients')
          .insert(ingredientsToInsert);

        if (insertError) throw insertError;
      }
    }

    // Fetch and return updated recipe
    const { data: recipe, error: fetchError } = await supabase
      .from('recipes')
      .select(`
        id,
        title,
        description,
        category,
        steps,
        created_at,
        source,
        ingredients (
          name,
          quantity,
          sort_order
        )
      `)
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      category: recipe.category,
      ingredients: (recipe.ingredients || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((ing: any) => ({
          name: ing.name,
          qty: ing.quantity,
        })),
      steps: recipe.steps || [],
      createdAt: recipe.created_at,
      source: recipe.source,
    };
  } catch (error) {
    console.error('Error updating recipe:', error);
    return null;
  }
}

// Delete saved recipe (handles both number and UUID)
export async function deleteSavedRecipe(id: number | string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot delete recipe: no user session');
    return;
  }

  try {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting recipe:', error);
  }
}

// Get recipes for a specific category
export async function getSavedRecipesForCategory(categoryId: string, label: string): Promise<Recipe[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  try {
    // Query recipe_categories with JOIN to recipes and ingredients
    const { data: recipeCategories, error } = await supabase
      .from('recipe_categories')
      .select(`
        recipes!inner (
          id,
          title,
          description,
          steps,
          created_at,
          source,
          ingredients (
            name,
            quantity,
            sort_order
          )
        )
      `)
      .eq('category_id', categoryId)
      .eq('user_id', userId);

    if (error) throw error;

    // Transform to Recipe format
    return (recipeCategories || []).map((rc: any) => {
      const recipe = rc.recipes;
      return {
        title: recipe.title,
        description: recipe.description,
        color: generateGradientFromUUID(categoryId),
        category: label?.toLowerCase() ?? "",
        ingredients: (recipe.ingredients || [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((ing: any) => ({
            name: ing.name,
            qty: ing.quantity,
          })),
        steps: recipe.steps || [],
        savedId: recipe.id,
        categoryKey: categoryId,
      };
    });
  } catch (error) {
    console.error('Error loading recipes for category:', error);
    return [];
  }
}

// One-time migration from localStorage to Supabase
export async function migrateRecipesFromLocalStorage(): Promise<boolean> {
  try {
    // Check if there's anything to migrate
    if (typeof window === "undefined") return false;

    const localRecipes = window.localStorage.getItem('tipsyDinnerRecipes');
    if (!localRecipes) return false;

    // Check if user is logged in
    const userId = await getCurrentUserId();
    if (!userId) return false;

    // Parse recipes
    const recipes: SavedRecipe[] = JSON.parse(localRecipes);
    if (!Array.isArray(recipes) || recipes.length === 0) {
      // Nothing to migrate, remove the key
      window.localStorage.removeItem('tipsyDinnerRecipes');
      return false;
    }

    console.log(`Migrating ${recipes.length} recipes from localStorage to Supabase...`);

    // Migrate each recipe
    let successCount = 0;
    for (const recipe of recipes) {
      try {
        await saveRecipe(recipe, 'manual'); // Assume existing recipes are manual
        successCount++;
      } catch (error) {
        console.error(`Failed to migrate recipe "${recipe.title}":`, error);
      }
    }

    console.log(`Successfully migrated ${successCount}/${recipes.length} recipes`);

    // Remove localStorage key after successful migration
    if (successCount > 0) {
      window.localStorage.removeItem('tipsyDinnerRecipes');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error during recipe migration:', error);
    return false;
  }
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
    apps: (number | string)[]; // Array of SavedRecipe IDs (can be UUID or number)
    mains: (number | string)[];
    sides: (number | string)[];
    desserts: (number | string)[];
    drinks: (number | string)[];
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
  recipeId: number | string, // Can be UUID or number
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
  recipeId: number | string,
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

export async function getRecipesForMenuSection(menuId: number, section: MenuSection): Promise<SavedRecipe[]> {
  const menu = findMenu(menuId);
  if (!menu) return [];

  const recipeIds = menu.recipes[section];
  const allRecipes = await loadSavedRecipes();

  return recipeIds
    .map((id) => allRecipes.find((r) => r.id === id))
    .filter((r): r is SavedRecipe => r !== undefined);
}
