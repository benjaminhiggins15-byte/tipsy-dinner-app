import { supabase } from '../lib/supabase';
import { compressImageFile, type CropRect } from './image';

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

// A recipe step is either a plain instruction string (legacy shape) or a
// structured object with an optional title. normalizeStep() is the single
// place every reader should go through so both shapes render identically.
export type RecipeStep = string | { title: string; instruction: string };

export function normalizeStep(step: RecipeStep): { title: string; instruction: string } {
  if (typeof step === 'string') return { title: '', instruction: step };
  return { title: step.title ?? '', instruction: step.instruction ?? '' };
}

export type Recipe = {
  title: string;
  description: string;
  color: string;
  category: string;
  yield?: string;
  ingredients?: { name: string; qty: string }[];
  steps?: RecipeStep[];
  savedId?: number | string; // Can be UUID from Supabase or legacy number from localStorage
  categoryKey?: string;
  cookEvents?: CookEvent[];
  headlineRating?: number | null;
  photo_url?: string | null;
  photo_version?: number;
  created_at?: string;
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
  steps: RecipeStep[];
  createdAt: string;
  source?: 'ai' | 'manual';
  photo_url?: string | null;
  photo_version?: number;
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
        photo_url,
        photo_version,
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
      photo_url: recipe.photo_url ?? null,
      photo_version: recipe.photo_version ?? 0,
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
        photo_url: r.photo_url ?? null,
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
  patch: Partial<Pick<SavedRecipe, "title" | "description" | "ingredients" | "steps" | "photo_url" | "photo_version">>,
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
    if (patch.photo_url !== undefined) updateData.photo_url = patch.photo_url;
    if (patch.photo_version !== undefined) updateData.photo_version = patch.photo_version;

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
        photo_url,
        photo_version,
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
      photo_url: recipe.photo_url ?? null,
      photo_version: recipe.photo_version ?? 0,
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
          photo_url,
          photo_version,
          ingredients (
            name,
            quantity,
            sort_order
          ),
          cook_events (
            id,
            recipe_id,
            cooked_on,
            score,
            note,
            created_at
          )
        )
      `)
      .eq('category_id', categoryId)
      .eq('user_id', userId)
      .order('cooked_on', { ascending: false, foreignTable: 'cook_events' });

    if (error) throw error;

    // Transform to Recipe format
    return (recipeCategories || []).map((rc: any) => {
      const recipe = rc.recipes;
      const cookEvents = (recipe.cook_events || []).map(mapCookEventRow);
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
        cookEvents,
        headlineRating: headlineRatingFromEvents(cookEvents),
        photo_url: recipe.photo_url ?? null,
        photo_version: recipe.photo_version ?? 0,
        created_at: recipe.created_at,
      };
    });
  } catch (error) {
    console.error('Error loading recipes for category:', error);
    return [];
  }
}

// Unfiltered sibling of getSavedRecipesForCategory — same shape, no category_id
// filter. A recipe can belong to multiple categories (recipe_categories is a
// join table), so recipe_categories rows are de-duped by recipe id; the first
// row encountered wins for that recipe's displayed category/categoryKey.
export async function getSavedRecipesAll(): Promise<Recipe[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  try {
    const { data: recipeCategories, error } = await supabase
      .from('recipe_categories')
      .select(`
        category_id,
        categories (
          name
        ),
        recipes!inner (
          id,
          title,
          description,
          steps,
          created_at,
          source,
          photo_url,
          photo_version,
          ingredients (
            name,
            quantity,
            sort_order
          ),
          cook_events (
            id,
            recipe_id,
            cooked_on,
            score,
            note,
            created_at
          )
        )
      `)
      .eq('user_id', userId)
      .order('cooked_on', { ascending: false, foreignTable: 'cook_events' });

    if (error) throw error;

    const byRecipeId = new Map<string, Recipe>();
    for (const rc of recipeCategories || []) {
      const recipe = (rc as any).recipes;
      if (byRecipeId.has(recipe.id)) continue;
      const categoryId = (rc as any).category_id;
      const categoryName = (rc as any).categories?.name ?? "";
      const cookEvents = (recipe.cook_events || []).map(mapCookEventRow);
      byRecipeId.set(recipe.id, {
        title: recipe.title,
        description: recipe.description,
        color: generateGradientFromUUID(categoryId),
        category: categoryName.toLowerCase(),
        ingredients: (recipe.ingredients || [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((ing: any) => ({
            name: ing.name,
            qty: ing.quantity,
          })),
        steps: recipe.steps || [],
        savedId: recipe.id,
        categoryKey: categoryId,
        cookEvents,
        headlineRating: headlineRatingFromEvents(cookEvents),
        photo_url: recipe.photo_url ?? null,
        photo_version: recipe.photo_version ?? 0,
        created_at: recipe.created_at,
      });
    }
    return Array.from(byRecipeId.values());
  } catch (error) {
    console.error('Error loading all recipes:', error);
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

// ==================== RECIPE PHOTOS ====================
// Uploads a hero photo for a saved recipe: compresses client-side (image.ts),
// uploads to the recipe-photos Storage bucket under a stable per-recipe path
// (owner-keyed, so a later "replace" overwrites in place rather than
// accumulating orphaned objects), then writes the resulting public URL to
// the recipe's photo_url column via updateSavedRecipe. Throws on any
// failure — compressImageFile's UnsupportedImageError propagates as-is;
// upload/DB failures are wrapped with a clear message. Does not touch the
// frozen share snapshot or the legacy live-share path (separate, later build).
//
// Because the storage path is stable and the upload uses upsert, a replaced
// photo's public URL string is byte-for-byte identical to the old one — so
// browsers cache-serve the stale image forever unless something in the URL
// changes. photo_version exists purely to bust that cache: it's read fresh
// from the DB (never from component state, which could be stale) immediately
// before the write, so the bump is always relative to committed truth.
export async function uploadRecipePhoto(
  recipeId: string | number,
  file: File,
  cropRect?: CropRect
): Promise<{ url: string; version: number }> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('No user session');
  }

  const compressed = await compressImageFile(file, cropRect);

  const path = `${userId}/${recipeId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('recipe-photos')
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) {
    throw new Error(`Couldn't upload photo: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from('recipe-photos').getPublicUrl(path);
  const publicUrl = publicUrlData.publicUrl;

  const { data: currentRow, error: versionFetchError } = await supabase
    .from('recipes')
    .select('photo_version')
    .eq('id', recipeId)
    .eq('user_id', userId)
    .single();

  if (versionFetchError) {
    throw new Error(`Couldn't upload photo: ${versionFetchError.message}`);
  }

  const nextVersion = (currentRow?.photo_version ?? 0) + 1;

  const updated = await updateSavedRecipe(recipeId, { photo_url: publicUrl, photo_version: nextVersion });
  if (!updated) {
    // Best-effort cleanup so a failed DB write doesn't leave an orphaned object;
    // secondary failure here is swallowed — the original error below still surfaces.
    try {
      await supabase.storage.from('recipe-photos').remove([path]);
    } catch {
      // ignore
    }
    throw new Error("Photo uploaded but couldn't be saved to the recipe. Please try again.");
  }

  return { url: publicUrl, version: updated.photo_version ?? nextVersion };
}

// Removes a recipe's hero photo: deletes the storage object first, then
// clears photo_url. Deleting first (rather than clearing the DB field first)
// means a failure at either step leaves photo_url untouched — either the
// delete never ran, or it ran but the DB write failed and the recipe still
// points at a now-missing file, which is the same "surface an error, change
// nothing you can still call unchanged" bias uploadRecipePhoto follows.
// Also bumps photo_version (fresh-read, same as uploadRecipePhoto) so a
// stale cached image can't resurface if a photo is later re-added.
export async function removeRecipePhoto(recipeId: string | number): Promise<number> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('No user session');
  }

  const path = `${userId}/${recipeId}.jpg`;

  const { error: removeError } = await supabase.storage.from('recipe-photos').remove([path]);
  if (removeError) {
    throw new Error(`Couldn't remove photo: ${removeError.message}`);
  }

  const { data: currentRow, error: versionFetchError } = await supabase
    .from('recipes')
    .select('photo_version')
    .eq('id', recipeId)
    .eq('user_id', userId)
    .single();

  if (versionFetchError) {
    throw new Error(`Couldn't remove photo: ${versionFetchError.message}`);
  }

  const nextVersion = (currentRow?.photo_version ?? 0) + 1;

  const updated = await updateSavedRecipe(recipeId, { photo_url: null, photo_version: nextVersion });
  if (!updated) {
    throw new Error("Photo was removed but couldn't be cleared from the recipe. Please try again.");
  }

  return updated.photo_version ?? nextVersion;
}

// ==================== RECIPE SHARING (frozen-copy snapshot) ====================
// New snapshot-based sharing path for individual recipes, modeled on
// shareGroceryList/getPublicGroceryListByToken above: sharing captures a
// point-in-time copy into recipe_shares rather than pointing at the live
// recipes row, so a later edit or delete of the recipe never affects an
// already-minted link. Deliberately separate from the legacy
// shareRecipe/getPublicRecipeByToken pair above, which is left untouched
// pending a routing decision — see BUILD 2 report.

export type RecipeShareSnapshot = {
  title: string;
  description: string;
  ingredients: { name: string; qty: string }[];
  steps: { title: string; instruction: string }[];
  cookTime: string | null;
  serves: string | null;
  photoUrl: string | null;
};

export async function shareRecipeSnapshot(recipeId: number | string): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot share recipe: no user session');
    return null;
  }

  try {
    const { data: recipe, error } = await supabase
      .from('recipes')
      .select(`
        title,
        description,
        steps,
        cook_time,
        serves,
        photo_url,
        photo_version,
        ingredients (
          name,
          quantity,
          sort_order
        )
      `)
      .eq('id', recipeId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!recipe) return null;

    // Fresh token every share — deliberately does not reuse an existing
    // token the way the legacy shareRecipe does. A snapshot is a
    // point-in-time capture, so sharing again later must mint a new one
    // rather than resurface an old frozen copy (matches shareGroceryList).
    // Minted before the photo copy below because the copy's destination
    // path is keyed by this token.
    const token = crypto.randomUUID();

    // If the recipe has a photo, freeze an independent byte-copy under this
    // share's own token-keyed path — never a reference to the owner's
    // mutable {userId}/{recipeId}.jpg. This is what makes the shared photo
    // immune to the owner later deleting the recipe, removing the photo, or
    // replacing it: uploadRecipePhoto/removeRecipePhoto/deleteSavedRecipe
    // only ever touch the bare {recipeId}.jpg path, never share-{token}.jpg.
    // Nested under the user's own folder (not a top-level "shares/" prefix)
    // because the bucket's INSERT policy is owner-folder-scoped.
    let photoUrl: string | null = null;
    if (recipe.photo_url) {
      const sourcePath = `${userId}/${recipeId}.jpg`;
      const { data: photoBlob, error: downloadError } = await supabase.storage
        .from('recipe-photos')
        .download(sourcePath);

      if (downloadError) throw downloadError;

      const sharePath = `${userId}/share-${token}.jpg`;
      const { error: shareUploadError } = await supabase.storage
        .from('recipe-photos')
        .upload(sharePath, photoBlob, { contentType: 'image/jpeg', upsert: true });

      if (shareUploadError) throw shareUploadError;

      const { data: sharePublicUrlData } = supabase.storage
        .from('recipe-photos')
        .getPublicUrl(sharePath);
      photoUrl = sharePublicUrlData.publicUrl;
    }

    // Normalize once, at capture time, so the frozen blob always holds
    // {title, instruction} objects — never a mix of legacy plain strings and
    // objects, which is what a naive copy of the union-typed steps would freeze.
    const snapshot: RecipeShareSnapshot = {
      title: recipe.title,
      description: recipe.description,
      ingredients: (recipe.ingredients || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((ing: any) => ({ name: ing.name, qty: ing.quantity })),
      steps: (recipe.steps || []).map((step: RecipeStep) => normalizeStep(step)),
      cookTime: recipe.cook_time ?? null,
      serves: recipe.serves ?? null,
      photoUrl,
    };

    const { error: insertError } = await supabase
      .from('recipe_shares')
      .insert({ user_id: userId, share_token: token, recipe: snapshot });

    if (insertError) throw insertError;

    // Path is provisional — final prefix depends on the routing decision
    // (see BUILD 2 report); update here once that's settled.
    return `${window.location.origin}/r/${token}`;
  } catch (error) {
    console.error('Error sharing recipe snapshot:', error);
    return null;
  }
}

// Reads a frozen snapshot for the public route. No user_id filter —
// anonymous access is governed entirely by the anon-read RLS policy on
// recipe_shares, mirroring getPublicGroceryListByToken's reliance on
// share_token as the sole access grant.
export async function getRecipeSnapshotByToken(token: string): Promise<RecipeShareSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from('recipe_shares')
      .select('recipe')
      .eq('share_token', token)
      .maybeSingle();

    if (error) {
      console.error('Error loading recipe snapshot:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return data.recipe as RecipeShareSnapshot;
  } catch (error) {
    console.error('Error loading recipe snapshot:', error);
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

// Grouping/display logic for the grocery list — a pure function of
// GroceryItem[], shared by the live GroceryList screen (App.tsx) and the
// public list.$token.tsx route, which reconstructs GroceryItem-shaped
// objects from a grocery_list_shares snapshot.
export type GroceryRow = {
  key: string;
  quantityText: string;
  ids: string[];
  checked: boolean;
  pending: boolean;
  sortOrder: number;
};
export type GroceryGroup = { label: string; rows: GroceryRow[]; sortOrder: number };
export type GroceryAisleSection = { aisle: string; groups: GroceryGroup[]; sortOrder: number };

export const GROCERY_AISLE_ORDER = ["produce", "dairy", "meat", "pantry", "frozen", "other"] as const;
export const GROCERY_AISLE_LABELS: Record<string, string> = {
  produce: "Produce",
  dairy: "Dairy",
  meat: "Meat",
  pantry: "Pantry",
  frozen: "Frozen",
  other: "Other",
};

function formatGroceryAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// How long a freshly-added, still-pending item is held out of the list (shown
// only via the generic "Updating…" indicator) before it gives up waiting on
// enrichment and falls back to a normal raw Phase-1 row. Matches the existing
// polling cap so the two give up at the same time.
export const GROCERY_ENRICHMENT_HOLD_MS = 18000;

// Groups items by aisle, then by normalized/display name within each aisle.
// Within a name group, rows combine additively only when both come from
// enriched items sharing the same unit (including unitless numeric counts).
// Anything not yet enriched (pending/raw/failed) falls back to Phase 1's dumb
// exact-string quantity match, and always displays its raw text — never
// invented, never lost. Callers are expected to hold freshly-added still-
// pending items out of this function entirely (see GroceryList's held-item
// logic) — any "pending" item that does reach here is one whose hold has
// timed out, and is treated identically to a raw/failed item.
export function groupGroceryItems(items: GroceryItem[]): GroceryAisleSection[] {
  const bucketed = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const bucketKey = item.aisle ?? "other";
    if (!bucketed.has(bucketKey)) bucketed.set(bucketKey, []);
    bucketed.get(bucketKey)!.push(item);
  }

  function buildGroups(bucketItems: GroceryItem[]): GroceryGroup[] {
    const byName = new Map<string, GroceryGroup>();
    const groups: GroceryGroup[] = [];

    for (const item of bucketItems) {
      const isEnriched = item.enrichmentStatus === "enriched" && !!item.normalizedName;
      const label = (isEnriched ? item.normalizedName! : item.displayName).trim();
      const nameKey = label.toLowerCase();

      let group = byName.get(nameKey);
      if (!group) {
        group = { label, rows: [], sortOrder: item.sortOrder };
        byName.set(nameKey, group);
        groups.push(group);
      }
      group.sortOrder = Math.min(group.sortOrder, item.sortOrder);

      const canSum = isEnriched && item.amount != null;
      const rowKey = canSum ? `num:${item.unit ?? ""}` : isEnriched ? "enriched-no-qty" : `raw:${item.quantity}`;

      let row = group.rows.find((r) => r.key === rowKey) as (GroceryRow & { _amountSum: number | null; _unit: string | null }) | undefined;
      if (!row) {
        row = {
          key: rowKey,
          quantityText: "",
          ids: [],
          checked: true,
          pending: false,
          sortOrder: item.sortOrder,
          _amountSum: canSum ? 0 : null,
          _unit: canSum ? (item.unit ?? null) : null,
        };
        group.rows.push(row);
      }
      if (canSum && row._amountSum != null) row._amountSum += item.amount!;
      if (!canSum && !isEnriched) row.quantityText = item.quantity;
      row.ids.push(item.id);
      row.checked = row.checked && item.checked;
      row.pending = row.pending || item.enrichmentStatus === "pending";
      row.sortOrder = Math.min(row.sortOrder, item.sortOrder);
    }

    for (const group of groups) {
      for (const row of group.rows as (GroceryRow & { _amountSum: number | null; _unit: string | null })[]) {
        if (row._amountSum != null) {
          row.quantityText = row._unit ? `${formatGroceryAmount(row._amountSum)} ${row._unit}` : formatGroceryAmount(row._amountSum);
        }
      }
      group.rows.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    groups.sort((a, b) => a.sortOrder - b.sortOrder);
    return groups;
  }

  const sections: GroceryAisleSection[] = [];
  for (const aisle of GROCERY_AISLE_ORDER) {
    const bucketItems = bucketed.get(aisle);
    if (bucketItems && bucketItems.length > 0) {
      sections.push({
        aisle,
        groups: buildGroups(bucketItems),
        sortOrder: Math.min(...bucketItems.map((i) => i.sortOrder)),
      });
    }
  }

  return sections;
}

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

// ==================== GROCERY LIST SHARING (frozen-copy snapshot) ====================
// Snapshot sharing for the grocery list, modeled on shareRecipe/getPublicRecipeByToken
// but deliberately NOT a live pointer: sharing captures a point-in-time copy of the
// current enriched list into grocery_list_shares. The live grocery_items table is only
// ever read here, never written — later edits/clears to the owner's live list must not
// affect an already-minted snapshot.

// Polling cap mirrors the GroceryList screen's own hold-until-ready timeout (~18s), so
// a share tap never waits meaningfully longer than the list screen already would before
// giving up and falling back to whatever's there.
const GROCERY_SHARE_ENRICHMENT_POLL_INTERVAL_MS = 1500;
const GROCERY_SHARE_ENRICHMENT_POLL_MAX_ATTEMPTS = 12;

type GroceryListSnapshotItem = {
  display_name: string;
  quantity: string;
  normalized_name: string | null;
  amount: number | null;
  unit: string | null;
  aisle: string | null;
  enrichment_status: EnrichmentStatus | null;
  checked: boolean;
  sort_order: number;
};

export async function shareGroceryList(): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot share grocery list: no user session');
    return null;
  }

  try {
    let items = await loadGroceryItems();

    // Wait for any still-enriching items so the snapshot is clean, up to the
    // existing hold cap. If it never resolves, capture whatever's there —
    // a share must never block forever on enrichment.
    let attempts = 0;
    while (
      items.some((it) => it.enrichmentStatus === 'pending') &&
      attempts < GROCERY_SHARE_ENRICHMENT_POLL_MAX_ATTEMPTS
    ) {
      await new Promise((resolve) => setTimeout(resolve, GROCERY_SHARE_ENRICHMENT_POLL_INTERVAL_MS));
      items = await loadGroceryItems();
      attempts += 1;
    }

    const snapshotItems: GroceryListSnapshotItem[] = items.map((item) => ({
      display_name: item.displayName,
      quantity: item.quantity,
      normalized_name: item.normalizedName,
      amount: item.amount,
      unit: item.unit,
      aisle: item.aisle,
      enrichment_status: item.enrichmentStatus,
      checked: item.checked,
      sort_order: item.sortOrder,
    }));

    // Each share mints a brand-new token/row — unlike shareRecipe's token
    // reuse. A list snapshot is a point-in-time capture; sharing again later
    // must capture the then-current list, not resurface an old frozen copy.
    const token = crypto.randomUUID();

    const { error } = await supabase
      .from('grocery_list_shares')
      .insert({ user_id: userId, share_token: token, items: snapshotItems });

    if (error) throw error;

    return `${window.location.origin}/list/${token}`;
  } catch (error) {
    console.error('Error sharing grocery list:', error);
    return null;
  }
}

// Reads a frozen snapshot for the public list.$token.tsx route. No user_id
// filter — anonymous access is governed entirely by the anon-read RLS policy
// on grocery_list_shares, mirroring getPublicRecipeByToken's reliance on
// share_token as the sole access grant. Reconstructs GroceryItem-shaped
// objects (synthetic index-based ids — the snapshot is read-only, so real
// ids from the live grocery_items table were never stored) so the result can
// be passed straight into groupGroceryItems, unmodified.
export async function getPublicGroceryListByToken(token: string): Promise<GroceryItem[] | null> {
  try {
    const { data, error } = await supabase
      .from('grocery_list_shares')
      .select('items')
      .eq('share_token', token)
      .maybeSingle();

    if (error) {
      console.error('Error loading public grocery list:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    const snapshotItems = (data.items || []) as GroceryListSnapshotItem[];

    return snapshotItems.map((item, idx) => ({
      id: String(idx),
      displayName: item.display_name,
      quantity: item.quantity,
      checked: item.checked,
      sourceRecipeId: null,
      sortOrder: item.sort_order,
      normalizedName: item.normalized_name,
      amount: item.amount,
      unit: item.unit,
      aisle: item.aisle,
      enrichmentStatus: item.enrichment_status,
    }));
  } catch (error) {
    console.error('Error loading public grocery list:', error);
    return null;
  }
}

// ==================== COOK HISTORY ====================

export type CookEvent = {
  id: string;
  recipeId: string;
  cookedOn: string; // YYYY-MM-DD, local date
  score: number | null; // 1.0-10.0, one decimal place; null if scoring was skipped
  note: string | null;
  createdAt: string;
};

function mapCookEventRow(row: any): CookEvent {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    cookedOn: row.cooked_on,
    score: row.score,
    note: row.note,
    createdAt: row.created_at,
  };
}

// Local-date default for "today" — matches the local-midnight convention in
// chips.ts; new Date().toISOString() would use UTC and can land on the wrong
// day for users west of UTC in the evening.
function todayLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Derived, never stored: the score of the most-recent event that has a
// score, ignoring skipped (null-score) events. Ties broken by created_at.
export function headlineRatingFromEvents(events: CookEvent[]): number | null {
  let best: CookEvent | null = null;
  for (const e of events) {
    if (e.score == null) continue;
    if (!best || e.cookedOn > best.cookedOn || (e.cookedOn === best.cookedOn && e.createdAt > best.createdAt)) {
      best = e;
    }
  }
  return best ? best.score : null;
}

export async function loadCookEventsForRecipe(recipeId: string): Promise<CookEvent[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('cook_events')
      .select('id, recipe_id, cooked_on, score, note, created_at')
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)
      .order('cooked_on', { ascending: false });

    if (error) throw error;

    return (data || []).map(mapCookEventRow);
  } catch (error) {
    console.error('Error loading cook events:', error);
    return [];
  }
}

export async function addCookEvent(
  recipeId: string,
  event: { cookedOn?: string; score?: number | null; note?: string | null } = {}
): Promise<CookEvent | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot add cook event: no user session');
    throw new Error('No user session');
  }

  try {
    const { data, error } = await supabase
      .from('cook_events')
      .insert({
        user_id: userId,
        recipe_id: recipeId,
        cooked_on: event.cookedOn ?? todayLocalDateString(),
        score: event.score ?? null,
        note: event.note ?? null,
      })
      .select('id, recipe_id, cooked_on, score, note, created_at')
      .single();

    if (error) throw error;

    return mapCookEventRow(data);
  } catch (error) {
    console.error('Error adding cook event:', error);
    throw error;
  }
}

export async function updateCookEvent(
  eventId: string,
  updates: { cookedOn?: string; score?: number | null; note?: string | null }
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot update cook event: no user session');
    return;
  }

  const patch: Record<string, unknown> = {};
  if (updates.cookedOn !== undefined) patch.cooked_on = updates.cookedOn;
  if (updates.score !== undefined) patch.score = updates.score;
  if (updates.note !== undefined) patch.note = updates.note;

  try {
    const { error } = await supabase
      .from('cook_events')
      .update(patch)
      .eq('id', eventId)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating cook event:', error);
  }
}

export async function deleteCookEvent(eventId: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Cannot delete cook event: no user session');
    return;
  }

  try {
    const { error } = await supabase
      .from('cook_events')
      .delete()
      .eq('id', eventId)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting cook event:', error);
  }
}

// ==================== STEP-TITLE BACKFILL (one-time, already run) ====================
// Titled every existing recipe's plain-string steps via an isolated AI call,
// modeled on the grocery enrichment pattern above (own small system prompt,
// never the conversational one). Ran once against production on 2026-07-12:
// 14 recipes found, 11 backfilled, 3 already titled, zero failures. Left
// here — not wired into any UI — since it's idempotent and harmless to keep.
// (A window.backfillStepTitles console hook was used twice to invoke this:
// once for production, once temporarily on the collapsible-steps-3-ui branch
// to backfill a preview test account. Removed again after each run.)
// Idempotent: only steps that are still a plain string (typeof step ===
// 'string') are sent for titling; anything already a {title, instruction}
// object is left untouched, so re-running is always safe.

const STEP_TITLE_BACKFILL_SYSTEM_PROMPT = `You are a data-labeling utility. You are not a conversational assistant and must never write prose, greetings, or explanations.

You will receive a JSON array of recipe step instructions. Each item has "index" and "instruction".

For each item, produce a short, specific title for that step (a few words, plain text, no quotation marks or special characters) that names the action being taken, e.g. "Sear the chicken", "Reduce the sauce". Base the title only on the instruction's own words — never invent detail that isn't there.

Never alter, rewrite, shorten, or paraphrase the instruction text itself. You are only generating a title; the instruction is not part of your output.

Respond with ONLY a raw JSON array. No prose, no markdown code fences, no explanation, no leading or trailing text of any kind.
Each output element must be an object with exactly these keys: "index", "title".
The "index" of each output element must exactly match the "index" of its corresponding input item. Return exactly one output element per input item.`;

function parseStepTitleBackfillResponse(rawText: string, validIndices: Set<number>): Map<number, string> {
  const results = new Map<number, string>();

  let parsed: unknown;
  try {
    const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.warn('Step-title backfill: could not parse AI response as JSON', error);
    return results;
  }

  if (!Array.isArray(parsed)) {
    console.warn('Step-title backfill: AI response was not a JSON array');
    return results;
  }

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const index = typeof e.index === 'number' ? e.index : null;
    if (index === null || !validIndices.has(index)) continue;

    const title = typeof e.title === 'string' ? e.title.trim() : '';
    if (!title) continue; // nothing usable for this step

    results.set(index, title);
  }

  return results;
}

// One isolated AI call per recipe: sends only that recipe's plain-string step
// instructions (keyed by their index in recipe.steps) and gets back titles.
async function generateStepTitlesForRecipe(
  instructions: { index: number; instruction: string }[]
): Promise<Map<number, string>> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase config missing');

  const inputPayload = instructions.map((s) => ({ index: s.index, instruction: s.instruction }));

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      systemPrompt: STEP_TITLE_BACKFILL_SYSTEM_PROMPT,
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

  if (!fullText.trim()) throw new Error('Empty response from step-title backfill call');

  const validIndices = new Set(instructions.map((s) => s.index));
  return parseStepTitleBackfillResponse(fullText, validIndices);
}

// The one-time entry point. Loads every saved recipe for the current user,
// titles only the steps that are still plain strings, and writes the result
// back via updateSavedRecipe (shared with the AddYourOwn edit path — called
// here, never modified). Logs per-recipe so a run is easy to audit.
export async function backfillStepTitles(): Promise<void> {
  const recipes = await loadSavedRecipes();
  console.log(`Step-title backfill: found ${recipes.length} recipe(s).`);

  for (const recipe of recipes) {
    const plainStringSteps = recipe.steps
      .map((step, index) => ({ step, index }))
      .filter((entry): entry is { step: string; index: number } => typeof entry.step === 'string');

    if (plainStringSteps.length === 0) {
      console.log(`Skipping "${recipe.title}" (${recipe.id}) — no plain-string steps, already backfilled.`);
      continue;
    }

    console.log(`Backfilling "${recipe.title}" (${recipe.id}) — ${plainStringSteps.length} step(s) need a title.`);

    try {
      const titles = await generateStepTitlesForRecipe(
        plainStringSteps.map(({ step, index }) => ({ index, instruction: step }))
      );

      const newSteps: RecipeStep[] = recipe.steps.map((step, index) => {
        if (typeof step !== 'string') return step; // already structured — leave untouched
        const title = titles.get(index);
        if (!title) {
          console.warn(`  Step ${index} on "${recipe.title}" got no title back from the AI — leaving as plain string.`);
          return step;
        }
        return { title, instruction: step }; // instruction preserved verbatim; title is the only new data
      });

      await updateSavedRecipe(recipe.id, { steps: newSteps });
      console.log(`  Wrote ${titles.size} title(s) to "${recipe.title}".`);
    } catch (error) {
      console.error(`  Failed to backfill "${recipe.title}" (${recipe.id}):`, error);
    }
  }

  console.log('Step-title backfill: done.');
}

// ==================== CLEANUP ====================

export function cleanupMenusLocalStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem('tipsyDinnerOccasions');
  window.localStorage.removeItem('tipsyDinnerMenus');
}
