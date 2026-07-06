import { supabase } from '../lib/supabase';

// Generic SSE stream decoder for the ai-chat edge function. Shared so isolated,
// non-conversational AI calls (e.g. grocery enrichment) don't need to import
// from App.tsx, which would create a circular dependency.
export async function* parseSSEStream(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch (e) {
            console.warn("Failed to parse SSE data:", data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

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
      const { data: updateResult, error: updateError } = await supabase
        .from('recipes')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId);

      if (updateError) throw updateError;
    }

    // Update ingredients if provided (match saveRecipe's gate: truthy AND length > 0)
    if (patch.ingredients && patch.ingredients.length > 0) {
      // Fetch existing ingredients as backup (for best-effort restoration on failure)
      const { data: oldIngredients } = await supabase
        .from('ingredients')
        .select('name, quantity, sort_order')
        .eq('recipe_id', id)
        .order('sort_order');

      // Delete existing ingredients
      const { data: deleteData, error: deleteError } = await supabase
        .from('ingredients')
        .delete()
        .eq('recipe_id', id);

      if (deleteError) throw deleteError;

      // Insert new ingredients (with user_id to satisfy RLS policy)
      try {
        const ingredientsToInsert = patch.ingredients.map((ing, index) => ({
          recipe_id: id,
          user_id: userId, // FIX: Add user_id to satisfy RLS insert policy (matches saveRecipe pattern)
          name: ing.name,
          quantity: ing.qty,
          sort_order: index,
        }));

        const { data: insertData, error: insertError } = await supabase
          .from('ingredients')
          .insert(ingredientsToInsert);

        if (insertError) throw insertError;
      } catch (insertError) {
        // INSERT failed - attempt best-effort restoration of old ingredients
        if (oldIngredients && oldIngredients.length > 0) {
          try {
            const restoreData = oldIngredients.map(ing => ({
              recipe_id: id,
              user_id: userId,
              name: ing.name,
              quantity: ing.quantity,
              sort_order: ing.sort_order,
            }));
            await supabase.from('ingredients').insert(restoreData);
          } catch (restoreErr) {
            // Restoration failed; original error will be re-thrown below
          }
        }
        // Re-throw original error after restoration attempt
        throw insertError;
      }
    }

    // Fetch and return updated recipe
    const { data: recipe, error: fetchError } = await supabase
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
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      category: '', // Categories stored in recipe_categories join table, not on recipes row (matches loadSavedRecipes pattern)
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

// ==================== GROCERY LIST ====================

export type EnrichmentStatus = 'pending' | 'enriched' | 'raw' | 'failed';

export type GroceryItem = {
  id: string;
  displayName: string;
  quantity: string;
  checked: boolean;
  sourceRecipeId: string | null;
  sortOrder: number;
  normalizedName: string | null;
  amount: number | null;
  unit: string | null;
  aisle: string | null;
  enrichmentStatus: EnrichmentStatus | null;
};

export async function loadGroceryItems(): Promise<GroceryItem[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('grocery_items')
      .select('id, display_name, quantity, checked, source_recipe_id, sort_order, normalized_name, amount, unit, aisle, enrichment_status')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return (data || []).map(mapGroceryItemRow);
  } catch (error) {
    console.error('Error loading grocery items:', error);
    return [];
  }
}

function mapGroceryItemRow(item: any): GroceryItem {
  return {
    id: item.id,
    displayName: item.display_name,
    quantity: item.quantity,
    checked: item.checked,
    sourceRecipeId: item.source_recipe_id,
    sortOrder: item.sort_order,
    normalizedName: item.normalized_name,
    amount: item.amount,
    unit: item.unit,
    aisle: item.aisle,
    enrichmentStatus: item.enrichment_status,
  };
}

export async function addGroceryItems(
  items: { display_name: string; quantity: string; source_recipe_id?: string | null }[]
): Promise<GroceryItem[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot add grocery items: no user session');
    throw new Error('No user session');
  }
  if (items.length === 0) return [];

  try {
    const { data: existing, error: countError } = await supabase
      .from('grocery_items')
      .select('sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: false })
      .limit(1);

    if (countError) throw countError;

    const startOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    const itemsToInsert = items.map((item, index) => ({
      user_id: userId,
      display_name: item.display_name,
      quantity: item.quantity,
      source_recipe_id: item.source_recipe_id ?? null,
      sort_order: startOrder + index,
      enrichment_status: 'pending',
    }));

    const { data, error } = await supabase
      .from('grocery_items')
      .insert(itemsToInsert)
      .select('id, display_name, quantity, checked, source_recipe_id, sort_order, normalized_name, amount, unit, aisle, enrichment_status');

    if (error) throw error;

    return (data || []).map(mapGroceryItemRow);
  } catch (error) {
    console.error('Error adding grocery items:', error);
    throw error;
  }
}

export async function addManualGroceryItem(name: string, quantity: string = ''): Promise<GroceryItem[]> {
  return addGroceryItems([{ display_name: name, quantity, source_recipe_id: null }]);
}

export async function toggleGroceryItemChecked(id: string, checked: boolean): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot update grocery item: no user session');
    return;
  }

  try {
    const { error } = await supabase
      .from('grocery_items')
      .update({ checked })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error toggling grocery item:', error);
  }
}

export async function clearGroceryItems(mode: 'all' | 'checked'): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot clear grocery items: no user session');
    return;
  }

  try {
    let query = supabase
      .from('grocery_items')
      .delete()
      .eq('user_id', userId);

    if (mode === 'checked') {
      query = query.eq('checked', true);
    }

    const { error } = await query;
    if (error) throw error;
  } catch (error) {
    console.error('Error clearing grocery items:', error);
  }
}

// ==================== GROCERY ENRICHMENT (isolated AI utility) ====================
//
// This is a self-contained, non-conversational AI call. It has its own prompt
// string, defined below, and is completely separate from the conversational
// voice/formatting system prompt used by Build (triplicated across fireAICall,
// sendMessage, and handleChipClick in App.tsx). This function must never import
// from, reference, or be adapted from those call sites.

const GROCERY_AISLES = ['produce', 'dairy', 'meat', 'pantry', 'frozen', 'other'] as const;
type GroceryAisle = typeof GROCERY_AISLES[number];

type GroceryEnrichmentResult = {
  id: string;
  normalizedName: string;
  amount: number | null;
  unit: string | null;
  aisle: GroceryAisle;
};

const GROCERY_ENRICHMENT_SYSTEM_PROMPT = `You are a data-normalization utility for a grocery list. You are not a conversational assistant and must never write prose, greetings, or explanations.

You will receive a JSON array of grocery items. Each item has "id", "display_name", and "quantity" (a free-text string, may be empty).

For each item, produce a normalized version:
- normalized_name: a clean shopping name with preparation/descriptor words stripped (e.g. "finely diced yellow onion" -> "yellow onion") and common synonyms resolved to the most common grocery-store name (e.g. "green onions" -> "scallion"). Keep it short and singular where natural.
- amount: a plain number extracted from the quantity string (e.g. "2 cups" -> 2). If no clean number can be extracted (e.g. "a pinch", "to taste", empty string), use null. Never invent a number.
- unit: the unit of measure as plain lowercase text (e.g. "cup", "medium", "clove", "oz"). Use null if there is no unit, or if amount is null.
- aisle: exactly one of "produce", "dairy", "meat", "pantry", "frozen", "other". If genuinely ambiguous, use "other".

Respond with ONLY a raw JSON array. No prose, no markdown code fences, no explanation, no leading or trailing text of any kind.
Each output element must be an object with exactly these keys: "id", "normalized_name", "amount", "unit", "aisle".
The "id" of each output element must exactly match the "id" of its corresponding input item. Return exactly one output element per input item.`;

function parseGroceryEnrichmentResponse(
  rawText: string,
  validIds: Set<string>
): Map<string, GroceryEnrichmentResult> {
  const results = new Map<string, GroceryEnrichmentResult>();

  let parsed: unknown;
  try {
    // The model is instructed to return raw JSON only; strip markdown fences
    // defensively in case it doesn't comply.
    const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.warn('Grocery enrichment: could not parse AI response as JSON', error);
    return results;
  }

  if (!Array.isArray(parsed)) {
    console.warn('Grocery enrichment: AI response was not a JSON array');
    return results;
  }

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const id = e.id;
    if (typeof id !== 'string' || !validIds.has(id)) continue;

    const normalizedName = typeof e.normalized_name === 'string' ? e.normalized_name.trim() : '';
    if (!normalizedName) continue; // nothing usable for this item

    const amount = typeof e.amount === 'number' && Number.isFinite(e.amount) ? e.amount : null;
    const unit = typeof e.unit === 'string' && e.unit.trim() ? e.unit.trim() : null;
    const aisle = typeof e.aisle === 'string' && (GROCERY_AISLES as readonly string[]).includes(e.aisle)
      ? (e.aisle as GroceryAisle)
      : 'other';

    results.set(id, { id, normalizedName, amount, unit: amount === null ? null : unit, aisle });
  }

  return results;
}

async function markGroceryEnrichmentStatus(ids: string[], userId: string, status: EnrichmentStatus): Promise<void> {
  if (ids.length === 0) return;
  try {
    const { error } = await supabase
      .from('grocery_items')
      .update({ enrichment_status: status })
      .in('id', ids)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (error) {
    console.error(`Error marking grocery items as '${status}':`, error);
  }
}

async function writeGroceryEnrichmentResult(id: string, userId: string, result: GroceryEnrichmentResult): Promise<void> {
  try {
    const { error } = await supabase
      .from('grocery_items')
      .update({
        normalized_name: result.normalizedName,
        amount: result.amount,
        unit: result.unit,
        aisle: result.aisle,
        enrichment_status: 'enriched',
      })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  } catch (error) {
    console.error('Error writing grocery enrichment result for item', id, error);
  }
}

// Isolated AI enrichment pass. Never overwrites display_name/quantity (the raw
// fallback) and never throws in a way that could break the caller — worst case,
// items are left/marked as raw or failed and the list keeps working exactly as
// it does without enrichment.
export async function enrichGroceryItems(
  items: { id: string; display_name: string; quantity: string }[]
): Promise<void> {
  if (items.length === 0) return;

  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot enrich grocery items: no user session');
    return;
  }

  const validIds = new Set(items.map((i) => i.id));
  let results: Map<string, GroceryEnrichmentResult>;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase config missing');

    const inputPayload = items.map((i) => ({
      id: i.id,
      display_name: i.display_name,
      quantity: i.quantity,
    }));

    const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        systemPrompt: GROCERY_ENRICHMENT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(inputPayload) }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function error: ${errorText}`);
    }

    let fullText = '';
    for await (const chunk of parseSSEStream(response)) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        fullText += chunk.delta.text;
      }
    }

    if (!fullText.trim()) throw new Error('Empty response from grocery enrichment call');

    results = parseGroceryEnrichmentResponse(fullText, validIds);
  } catch (error) {
    console.error('Grocery enrichment call failed:', error);
    await markGroceryEnrichmentStatus(items.map((i) => i.id), userId, 'failed');
    return;
  }

  // Per item: write enriched fields on success, or mark 'raw' when the AI ran
  // but returned nothing usable for that specific item.
  await Promise.all(
    items.map(async (item) => {
      const result = results.get(item.id);
      if (result) {
        await writeGroceryEnrichmentResult(item.id, userId, result);
      } else {
        await markGroceryEnrichmentStatus([item.id], userId, 'raw');
      }
    })
  );
}

// ==================== CLEANUP ====================

export function cleanupMenusLocalStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem('tipsyDinnerOccasions');
  window.localStorage.removeItem('tipsyDinnerMenus');
}
