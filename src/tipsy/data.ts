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
    // First delete all recipe_categories join rows for this category
    const { error: joinError } = await supabase
      .from('recipe_categories')
      .delete()
      .eq('category_id', key)
      .eq('user_id', userId);

    if (joinError) throw joinError;

    // Then delete the category itself
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
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch (error) {
    console.error('Error getting user:', error);
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
export async function saveRecipe(r: SavedRecipe, source: 'ai' | 'manual' = 'manual', categoryId?: string): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot save recipe: no user session');
    throw new Error('No user session');
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

    return recipe.id;
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
  console.log('[UPD] updateSavedRecipe called - id:', id, 'typeof:', typeof id);
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot update recipe: no user session');
    return null;
  }
  console.log('[UPD] userId:', userId);

  try {
    // Build update object (only fields that are provided)
    const updateData: any = {};
    if (patch.title !== undefined) updateData.title = patch.title;
    if (patch.description !== undefined) updateData.description = patch.description;
    if (patch.steps !== undefined) updateData.steps = patch.steps;

    // Update recipe
    if (Object.keys(updateData).length > 0) {
      const { data: updateResult, error: updateError } = await supabase
        .from('recipes')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId);

      console.log('[UPD] UPDATE query result - data:', updateResult, 'error:', updateError);
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

    console.log('[UPD] FETCH query result - data:', recipe, 'error:', fetchError);
    if (fetchError) throw fetchError;

    const result = {
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
    console.log('[UPD] updateSavedRecipe returning:', result);
    return result;
  } catch (error) {
    console.error('[UPD] Error updating recipe:', error);
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

// Get public recipe by share token (for anonymous viewing)
export async function getPublicRecipeByToken(
  token: string
): Promise<(SavedRecipe & { cookTime?: string; serves?: string }) | null> {
  try {
    const { data: recipe, error } = await supabase
      .from('recipes')
      .select(`
        id,
        title,
        description,
        steps,
        created_at,
        source,
        cook_time,
        serves,
        ingredients (
          name,
          quantity,
          sort_order
        )
      `)
      .eq('share_token', token)
      .eq('is_public', true)
      .maybeSingle();

    if (error) {
      console.error('Error loading public recipe:', error);
      return null;
    }

    if (!recipe) {
      return null;
    }

    return {
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
      cookTime: recipe.cook_time,
      serves: recipe.serves,
    };
  } catch (error) {
    console.error('Error loading public recipe:', error);
    return null;
  }
}

// Share recipe by generating/reusing share token and returning public URL
export async function shareRecipe(recipeId: string): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot share recipe: no user session');
    return null;
  }

  try {
    // Check if recipe already has share_token
    const { data: existing, error: selectError } = await supabase
      .from('recipes')
      .select('share_token')
      .eq('id', recipeId)
      .eq('user_id', userId)
      .maybeSingle();

    if (selectError) {
      console.error('Error fetching recipe for share:', selectError);
      return null;
    }

    if (!existing) {
      // Recipe not found or not owned by this user
      return null;
    }

    let token: string;

    // If share_token exists, reuse it (stable links)
    if (existing.share_token) {
      token = existing.share_token;
    } else {
      // Generate new token and update recipe
      token = crypto.randomUUID();

      const { error: updateError } = await supabase
        .from('recipes')
        .update({
          is_public: true,
          share_token: token,
        })
        .eq('id', recipeId)
        .eq('user_id', userId);

      if (updateError) throw updateError;
    }

    // Build and return full shareable URL
    return `${window.location.origin}/r/${token}`;
  } catch (error) {
    console.error('Error sharing recipe:', error);
    return null;
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

export type Occasion = {
  id: string; // UUID from Supabase
  name: string;
  icon: string; // Hardcoded on read (not stored in DB)
  createdAt: string;
};

export type MenuSection = "apps" | "mains" | "sides" | "desserts" | "drinks";

export type Menu = {
  id: string; // UUID from Supabase
  occasionId: string; // UUID from Supabase
  title: string;
  description: string;
  enabledSections: MenuSection[];
  recipes: {
    apps: (number | string)[]; // Array of SavedRecipe IDs
    mains: (number | string)[];
    sides: (number | string)[];
    desserts: (number | string)[];
    drinks: (number | string)[];
  };
  createdAt: string;
};

// ==================== OCCASIONS ====================

export async function loadOccasions(): Promise<Occasion[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  try {
    const { data: occasions, error } = await supabase
      .from('occasions')
      .select('id, name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (occasions || []).map((occ) => ({
      id: occ.id,
      name: occ.name,
      icon: "IconChefHat", // Hardcoded default
      createdAt: occ.created_at,
    }));
  } catch (error) {
    console.error('Error loading occasions:', error);
    return [];
  }
}

export async function saveOccasion(name: string, icon: string): Promise<Occasion> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Cannot save occasion: no user session');
  }

  try {
    // Drop icon parameter - not stored in DB
    const { data: occasion, error } = await supabase
      .from('occasions')
      .insert({
        user_id: userId,
        name: name,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: occasion.id,
      name: occasion.name,
      icon: "IconChefHat", // Hardcoded default
      createdAt: occasion.created_at,
    };
  } catch (error) {
    console.error('Error saving occasion:', error);
    throw error;
  }
}

export async function updateOccasion(
  id: string,
  patch: Partial<Pick<Occasion, "name" | "icon">>,
): Promise<Occasion | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot update occasion: no user session');
    return null;
  }

  try {
    // Only update name if provided (ignore icon)
    const updateData: any = {};
    if (patch.name !== undefined) updateData.name = patch.name;

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from('occasions')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
    }

    // Re-fetch and return
    const { data: occasion, error: fetchError } = await supabase
      .from('occasions')
      .select('id, name, created_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    return {
      id: occasion.id,
      name: occasion.name,
      icon: "IconChefHat", // Hardcoded default
      createdAt: occasion.created_at,
    };
  } catch (error) {
    console.error('Error updating occasion:', error);
    return null;
  }
}

export async function deleteOccasion(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot delete occasion: no user session');
    return;
  }

  try {
    // Only delete occasions row - DB cascades menus and menu_recipes
    const { error } = await supabase
      .from('occasions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting occasion:', error);
  }
}

export async function findOccasion(id: string): Promise<Occasion | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }

  try {
    const { data: occasion, error } = await supabase
      .from('occasions')
      .select('id, name, created_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    return {
      id: occasion.id,
      name: occasion.name,
      icon: "IconChefHat", // Hardcoded default
      createdAt: occasion.created_at,
    };
  } catch (error) {
    console.error('Error finding occasion:', error);
    return null;
  }
}

// ==================== MENUS ====================

// Helper to build nested recipes structure from menu_recipes rows
function buildRecipesStructure(menuRecipes: any[]): Menu['recipes'] {
  const recipes: Menu['recipes'] = {
    apps: [],
    mains: [],
    sides: [],
    desserts: [],
    drinks: [],
  };

  for (const mr of menuRecipes) {
    const section = mr.section as MenuSection;
    if (section in recipes) {
      recipes[section].push(mr.recipe_id);
    }
  }

  return recipes;
}

export async function loadMenus(): Promise<Menu[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  try {
    // Fetch all menus
    const { data: menus, error: menusError } = await supabase
      .from('menus')
      .select('id, occasion_id, name, description, active_sections, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (menusError) throw menusError;
    if (!menus || menus.length === 0) return [];

    // Fetch all menu_recipes for these menus
    const menuIds = menus.map(m => m.id);
    const { data: menuRecipes, error: recipesError } = await supabase
      .from('menu_recipes')
      .select('menu_id, recipe_id, section')
      .in('menu_id', menuIds)
      .eq('user_id', userId);

    if (recipesError) throw recipesError;

    // Group menu_recipes by menu_id
    const recipesByMenu = new Map<string, any[]>();
    for (const mr of menuRecipes || []) {
      if (!recipesByMenu.has(mr.menu_id)) {
        recipesByMenu.set(mr.menu_id, []);
      }
      recipesByMenu.get(mr.menu_id)!.push(mr);
    }

    // Transform to Menu objects
    return menus.map((m) => ({
      id: m.id,
      occasionId: m.occasion_id,
      title: m.name, // name → title
      description: m.description || '',
      enabledSections: (m.active_sections || []) as MenuSection[], // active_sections → enabledSections
      recipes: buildRecipesStructure(recipesByMenu.get(m.id) || []),
      createdAt: m.created_at,
    }));
  } catch (error) {
    console.error('Error loading menus:', error);
    return [];
  }
}

export async function saveMenu(
  occasionId: string,
  title: string,
  description: string,
  enabledSections: MenuSection[],
): Promise<Menu> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Cannot save menu: no user session');
  }

  try {
    const { data: menu, error } = await supabase
      .from('menus')
      .insert({
        user_id: userId,
        occasion_id: occasionId,
        name: title, // title → name
        description: description,
        active_sections: enabledSections, // enabledSections → active_sections
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: menu.id,
      occasionId: menu.occasion_id,
      title: menu.name, // name → title
      description: menu.description || '',
      enabledSections: (menu.active_sections || []) as MenuSection[],
      recipes: {
        apps: [],
        mains: [],
        sides: [],
        desserts: [],
        drinks: [],
      },
      createdAt: menu.created_at,
    };
  } catch (error) {
    console.error('Error saving menu:', error);
    throw error;
  }
}

export async function updateMenu(
  id: string,
  patch: Partial<Pick<Menu, "title" | "description" | "enabledSections" | "recipes">>,
): Promise<Menu | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot update menu: no user session');
    return null;
  }

  try {
    // Build update object (only title, description, enabledSections)
    const updateData: any = {};
    if (patch.title !== undefined) updateData.name = patch.title; // title → name
    if (patch.description !== undefined) updateData.description = patch.description;
    if (patch.enabledSections !== undefined) updateData.active_sections = patch.enabledSections; // enabledSections → active_sections

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from('menus')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
    }

    // Re-fetch menu with recipes
    return await findMenu(id);
  } catch (error) {
    console.error('Error updating menu:', error);
    return null;
  }
}

export async function deleteMenu(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot delete menu: no user session');
    return;
  }

  try {
    const { error } = await supabase
      .from('menus')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting menu:', error);
  }
}

export async function findMenu(id: string): Promise<Menu | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }

  try {
    // Fetch menu
    const { data: menu, error: menuError } = await supabase
      .from('menus')
      .select('id, occasion_id, name, description, active_sections, created_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (menuError) throw menuError;

    // Fetch menu_recipes
    const { data: menuRecipes, error: recipesError } = await supabase
      .from('menu_recipes')
      .select('recipe_id, section')
      .eq('menu_id', id)
      .eq('user_id', userId);

    if (recipesError) throw recipesError;

    return {
      id: menu.id,
      occasionId: menu.occasion_id,
      title: menu.name, // name → title
      description: menu.description || '',
      enabledSections: (menu.active_sections || []) as MenuSection[],
      recipes: buildRecipesStructure(menuRecipes || []),
      createdAt: menu.created_at,
    };
  } catch (error) {
    console.error('Error finding menu:', error);
    return null;
  }
}

export async function getMenusForOccasion(occasionId: string): Promise<Menu[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  try {
    // Fetch menus for occasion
    const { data: menus, error: menusError } = await supabase
      .from('menus')
      .select('id, occasion_id, name, description, active_sections, created_at')
      .eq('occasion_id', occasionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (menusError) throw menusError;
    if (!menus || menus.length === 0) return [];

    // Fetch menu_recipes for these menus
    const menuIds = menus.map(m => m.id);
    const { data: menuRecipes, error: recipesError } = await supabase
      .from('menu_recipes')
      .select('menu_id, recipe_id, section')
      .in('menu_id', menuIds)
      .eq('user_id', userId);

    if (recipesError) throw recipesError;

    // Group menu_recipes by menu_id
    const recipesByMenu = new Map<string, any[]>();
    for (const mr of menuRecipes || []) {
      if (!recipesByMenu.has(mr.menu_id)) {
        recipesByMenu.set(mr.menu_id, []);
      }
      recipesByMenu.get(mr.menu_id)!.push(mr);
    }

    // Transform to Menu objects
    return menus.map((m) => ({
      id: m.id,
      occasionId: m.occasion_id,
      title: m.name, // name → title
      description: m.description || '',
      enabledSections: (m.active_sections || []) as MenuSection[],
      recipes: buildRecipesStructure(recipesByMenu.get(m.id) || []),
      createdAt: m.created_at,
    }));
  } catch (error) {
    console.error('Error loading menus for occasion:', error);
    return [];
  }
}

// ==================== MENU RECIPE MANAGEMENT ====================

export async function addRecipeToMenuSection(
  menuId: string,
  section: MenuSection,
  recipeId: number | string,
): Promise<Menu | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot add recipe to menu: no user session');
    return null;
  }

  try {
    // Check if already exists
    const { data: existing, error: checkError } = await supabase
      .from('menu_recipes')
      .select('id')
      .eq('menu_id', menuId)
      .eq('recipe_id', recipeId)
      .eq('section', section)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) throw checkError;

    // If not exists, insert
    if (!existing) {
      const { error: insertError } = await supabase
        .from('menu_recipes')
        .insert({
          menu_id: menuId,
          recipe_id: recipeId,
          section: section,
          user_id: userId,
        });

      if (insertError) throw insertError;
    }

    // Re-fetch and return menu
    return await findMenu(menuId);
  } catch (error) {
    console.error('Error adding recipe to menu section:', error);
    return null;
  }
}

export async function removeRecipeFromMenuSection(
  menuId: string,
  section: MenuSection,
  recipeId: number | string,
): Promise<Menu | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot remove recipe from menu: no user session');
    return null;
  }

  try {
    const { error } = await supabase
      .from('menu_recipes')
      .delete()
      .eq('menu_id', menuId)
      .eq('recipe_id', recipeId)
      .eq('section', section)
      .eq('user_id', userId);

    if (error) throw error;

    // Re-fetch and return menu
    return await findMenu(menuId);
  } catch (error) {
    console.error('Error removing recipe from menu section:', error);
    return null;
  }
}

export async function getRecipesForMenuSection(menuId: string, section: MenuSection): Promise<SavedRecipe[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  try {
    // Join menu_recipes with recipes and ingredients
    const { data: menuRecipes, error: mrError } = await supabase
      .from('menu_recipes')
      .select('recipe_id')
      .eq('menu_id', menuId)
      .eq('section', section)
      .eq('user_id', userId);

    if (mrError) throw mrError;
    if (!menuRecipes || menuRecipes.length === 0) return [];

    const recipeIds = menuRecipes.map(mr => mr.recipe_id);

    // Fetch recipes with ingredients
    const { data: recipes, error: recipesError } = await supabase
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
      .in('id', recipeIds)
      .eq('user_id', userId);

    if (recipesError) throw recipesError;

    // Transform to SavedRecipe format
    return (recipes || []).map((recipe: any) => ({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      category: '', // Will be populated by caller if needed
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
    console.error('Error loading recipes for menu section:', error);
    return [];
  }
}

// ==================== CLEANUP ====================

export function cleanupMenusLocalStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem('tipsyDinnerOccasions');
  window.localStorage.removeItem('tipsyDinnerMenus');
}
