import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { c as createClient } from "../_libs/supabase__supabase-js.mjs";
import { I as IconChefHat, a as IconBook, b as IconLayoutList, c as IconUser, d as IconCandle, e as IconGrill, f as IconCake, g as IconGlassFull, h as IconHeart, i as IconStar, j as IconSun, k as IconMoon, l as IconSnowflake, m as IconFlame, n as IconLeaf, o as IconToolsKitchen2, p as IconBowlSpoon, q as IconPizza } from "../_libs/tabler__icons-react.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
const supabaseUrl = "https://xzpmmthreeyscidhwriv.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6cG1tdGhyZWV5c2NpZGh3cml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MzMwNDcsImV4cCI6MjA5NTIwOTA0N30.0lb3IjdLp2V9usQW9TLVucxEwnrKpL2uEXO0FQ8ldAo";
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const GRADIENT_PALETTE = [
  "linear-gradient(135deg, #C17F4A 0%, #8B4513 100%)",
  "linear-gradient(135deg, #5B8FA8 0%, #2C5F7F 100%)",
  "linear-gradient(135deg, #7AAF8A 0%, #4A7A5A 100%)",
  "linear-gradient(135deg, #C4A84A 0%, #8B6914 100%)",
  "linear-gradient(135deg, #A0785A 0%, #6B4A2A 100%)",
  "linear-gradient(135deg, #C4A882 0%, #8B7355 100%)",
  "linear-gradient(135deg, #D4844A 0%, #A0522D 100%)",
  "linear-gradient(135deg, #E8C97A 0%, #B8942A 100%)"
];
const categories = GRADIENT_PALETTE.map((gradient, index) => ({
  key: `gradient-${index}`,
  label: `Gradient ${index + 1}`,
  gradient
}));
function generateGradientFromUUID(uuid) {
  let hash = 0;
  for (let i = 0; i < Math.min(uuid.length, 8); i++) {
    hash += uuid.charCodeAt(i);
  }
  return GRADIENT_PALETTE[hash % GRADIENT_PALETTE.length];
}
async function loadCustomCategories() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  try {
    const { data: categories2, error } = await supabase.from("categories").select("id, name").eq("user_id", userId).order("created_at", { ascending: true });
    if (error) throw error;
    return (categories2 || []).map((cat) => ({
      key: cat.id,
      label: cat.name,
      gradient: generateGradientFromUUID(cat.id)
    }));
  } catch (error) {
    console.error("Error loading categories:", error);
    return [];
  }
}
async function saveCustomCategory(name, gradient) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Cannot save category: no user session");
  }
  try {
    const { data: category, error } = await supabase.from("categories").insert({
      user_id: userId,
      name
    }).select().single();
    if (error) throw error;
    return {
      key: category.id,
      label: category.name,
      gradient: generateGradientFromUUID(category.id)
    };
  } catch (error) {
    console.error("Error saving category:", error);
    throw error;
  }
}
async function deleteCustomCategory(key) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot delete category: no user session");
    return;
  }
  try {
    const { error } = await supabase.from("categories").delete().eq("id", key).eq("user_id", userId);
    if (error) throw error;
  } catch (error) {
    console.error("Error deleting category:", error);
  }
}
async function updateCustomCategory(key, name, gradient) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot update category: no user session");
    return;
  }
  try {
    const { error } = await supabase.from("categories").update({ name }).eq("id", key).eq("user_id", userId);
    if (error) throw error;
  } catch (error) {
    console.error("Error updating category:", error);
  }
}
async function findCustomCategory(key) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }
  try {
    const { data: category, error } = await supabase.from("categories").select("id, name").eq("id", key).eq("user_id", userId).single();
    if (error) throw error;
    return {
      key: category.id,
      label: category.name,
      gradient: generateGradientFromUUID(category.id)
    };
  } catch (error) {
    console.error("Error finding category:", error);
    return null;
  }
}
async function getAllCategories() {
  return await loadCustomCategories();
}
async function getRecipesForCategory(key, label) {
  return await getSavedRecipesForCategory(key, label);
}
async function getCurrentUserId() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch (error) {
    console.error("Error getting user session:", error);
    return null;
  }
}
async function saveRecipe(r, source = "manual", categoryId) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot save recipe: no user session");
    throw new Error("No user session");
  }
  try {
    const { data: recipe, error: recipeError } = await supabase.from("recipes").insert({
      user_id: userId,
      title: r.title,
      description: r.description,
      steps: r.steps,
      created_at: r.createdAt,
      source
    }).select().single();
    if (recipeError) throw recipeError;
    if (r.ingredients && r.ingredients.length > 0) {
      const ingredientsToInsert = r.ingredients.map((ing, index) => ({
        recipe_id: recipe.id,
        // Use the UUID returned by Supabase
        user_id: userId,
        name: ing.name,
        quantity: ing.qty,
        sort_order: index
      }));
      const { error: ingredientsError } = await supabase.from("ingredients").insert(ingredientsToInsert);
      if (ingredientsError) throw ingredientsError;
    }
    if (categoryId) {
      const { error: categoryError } = await supabase.from("recipe_categories").insert({
        recipe_id: recipe.id,
        category_id: categoryId,
        user_id: userId
      });
      if (categoryError) throw categoryError;
    }
    return recipe.id;
  } catch (error) {
    console.error("Error saving recipe:", error);
    throw error;
  }
}
async function updateSavedRecipe(id, patch) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot update recipe: no user session");
    return null;
  }
  try {
    const updateData = {};
    if (patch.title !== void 0) updateData.title = patch.title;
    if (patch.description !== void 0) updateData.description = patch.description;
    if (patch.steps !== void 0) updateData.steps = patch.steps;
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase.from("recipes").update(updateData).eq("id", id).eq("user_id", userId);
      if (updateError) throw updateError;
    }
    if (patch.ingredients !== void 0) {
      const { error: deleteError } = await supabase.from("ingredients").delete().eq("recipe_id", id);
      if (deleteError) throw deleteError;
      if (patch.ingredients.length > 0) {
        const ingredientsToInsert = patch.ingredients.map((ing, index) => ({
          recipe_id: id,
          name: ing.name,
          quantity: ing.qty,
          sort_order: index
        }));
        const { error: insertError } = await supabase.from("ingredients").insert(ingredientsToInsert);
        if (insertError) throw insertError;
      }
    }
    const { data: recipe, error: fetchError } = await supabase.from("recipes").select(`
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
      `).eq("id", id).eq("user_id", userId).single();
    if (fetchError) throw fetchError;
    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      category: recipe.category,
      ingredients: (recipe.ingredients || []).sort((a, b) => a.sort_order - b.sort_order).map((ing) => ({
        name: ing.name,
        qty: ing.quantity
      })),
      steps: recipe.steps || [],
      createdAt: recipe.created_at,
      source: recipe.source
    };
  } catch (error) {
    console.error("Error updating recipe:", error);
    return null;
  }
}
async function deleteSavedRecipe(id) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot delete recipe: no user session");
    return;
  }
  try {
    const { error } = await supabase.from("recipes").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
  } catch (error) {
    console.error("Error deleting recipe:", error);
  }
}
async function getSavedRecipesForCategory(categoryId, label) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  try {
    const { data: recipeCategories, error } = await supabase.from("recipe_categories").select(`
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
      `).eq("category_id", categoryId).eq("user_id", userId);
    if (error) throw error;
    return (recipeCategories || []).map((rc) => {
      const recipe = rc.recipes;
      return {
        title: recipe.title,
        description: recipe.description,
        color: generateGradientFromUUID(categoryId),
        category: label?.toLowerCase() ?? "",
        ingredients: (recipe.ingredients || []).sort((a, b) => a.sort_order - b.sort_order).map((ing) => ({
          name: ing.name,
          qty: ing.quantity
        })),
        steps: recipe.steps || [],
        savedId: recipe.id,
        categoryKey: categoryId
      };
    });
  } catch (error) {
    console.error("Error loading recipes for category:", error);
    return [];
  }
}
async function migrateRecipesFromLocalStorage() {
  try {
    if (typeof window === "undefined") return false;
    const localRecipes = window.localStorage.getItem("tipsyDinnerRecipes");
    if (!localRecipes) return false;
    const userId = await getCurrentUserId();
    if (!userId) return false;
    const recipes = JSON.parse(localRecipes);
    if (!Array.isArray(recipes) || recipes.length === 0) {
      window.localStorage.removeItem("tipsyDinnerRecipes");
      return false;
    }
    console.log(`Migrating ${recipes.length} recipes from localStorage to Supabase...`);
    let successCount = 0;
    for (const recipe of recipes) {
      try {
        await saveRecipe(recipe, "manual");
        successCount++;
      } catch (error) {
        console.error(`Failed to migrate recipe "${recipe.title}":`, error);
      }
    }
    console.log(`Successfully migrated ${successCount}/${recipes.length} recipes`);
    if (successCount > 0) {
      window.localStorage.removeItem("tipsyDinnerRecipes");
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error during recipe migration:", error);
    return false;
  }
}
async function loadOccasions() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  try {
    const { data: occasions, error } = await supabase.from("occasions").select("id, name, created_at").eq("user_id", userId).order("created_at", { ascending: true });
    if (error) throw error;
    return (occasions || []).map((occ) => ({
      id: occ.id,
      name: occ.name,
      icon: "IconChefHat",
      // Hardcoded default
      createdAt: occ.created_at
    }));
  } catch (error) {
    console.error("Error loading occasions:", error);
    return [];
  }
}
async function saveOccasion(name, icon) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Cannot save occasion: no user session");
  }
  try {
    const { data: occasion, error } = await supabase.from("occasions").insert({
      user_id: userId,
      name
    }).select().single();
    if (error) throw error;
    return {
      id: occasion.id,
      name: occasion.name,
      icon: "IconChefHat",
      // Hardcoded default
      createdAt: occasion.created_at
    };
  } catch (error) {
    console.error("Error saving occasion:", error);
    throw error;
  }
}
async function updateOccasion(id, patch) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot update occasion: no user session");
    return null;
  }
  try {
    const updateData = {};
    if (patch.name !== void 0) updateData.name = patch.name;
    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase.from("occasions").update(updateData).eq("id", id).eq("user_id", userId);
      if (error) throw error;
    }
    const { data: occasion, error: fetchError } = await supabase.from("occasions").select("id, name, created_at").eq("id", id).eq("user_id", userId).single();
    if (fetchError) throw fetchError;
    return {
      id: occasion.id,
      name: occasion.name,
      icon: "IconChefHat",
      // Hardcoded default
      createdAt: occasion.created_at
    };
  } catch (error) {
    console.error("Error updating occasion:", error);
    return null;
  }
}
async function deleteOccasion(id) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot delete occasion: no user session");
    return;
  }
  try {
    const { error } = await supabase.from("occasions").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
  } catch (error) {
    console.error("Error deleting occasion:", error);
  }
}
async function findOccasion(id) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }
  try {
    const { data: occasion, error } = await supabase.from("occasions").select("id, name, created_at").eq("id", id).eq("user_id", userId).single();
    if (error) throw error;
    return {
      id: occasion.id,
      name: occasion.name,
      icon: "IconChefHat",
      // Hardcoded default
      createdAt: occasion.created_at
    };
  } catch (error) {
    console.error("Error finding occasion:", error);
    return null;
  }
}
function buildRecipesStructure(menuRecipes) {
  const recipes = {
    apps: [],
    mains: [],
    sides: [],
    desserts: [],
    drinks: []
  };
  for (const mr of menuRecipes) {
    const section = mr.section;
    if (section in recipes) {
      recipes[section].push(mr.recipe_id);
    }
  }
  return recipes;
}
async function saveMenu(occasionId, title, description, enabledSections) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Cannot save menu: no user session");
  }
  try {
    const { data: menu, error } = await supabase.from("menus").insert({
      user_id: userId,
      occasion_id: occasionId,
      name: title,
      // title → name
      description,
      active_sections: enabledSections
      // enabledSections → active_sections
    }).select().single();
    if (error) throw error;
    return {
      id: menu.id,
      occasionId: menu.occasion_id,
      title: menu.name,
      // name → title
      description: menu.description || "",
      enabledSections: menu.active_sections || [],
      recipes: {
        apps: [],
        mains: [],
        sides: [],
        desserts: [],
        drinks: []
      },
      createdAt: menu.created_at
    };
  } catch (error) {
    console.error("Error saving menu:", error);
    throw error;
  }
}
async function updateMenu(id, patch) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot update menu: no user session");
    return null;
  }
  try {
    const updateData = {};
    if (patch.title !== void 0) updateData.name = patch.title;
    if (patch.description !== void 0) updateData.description = patch.description;
    if (patch.enabledSections !== void 0) updateData.active_sections = patch.enabledSections;
    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase.from("menus").update(updateData).eq("id", id).eq("user_id", userId);
      if (error) throw error;
    }
    return await findMenu(id);
  } catch (error) {
    console.error("Error updating menu:", error);
    return null;
  }
}
async function deleteMenu(id) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot delete menu: no user session");
    return;
  }
  try {
    const { error } = await supabase.from("menus").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
  } catch (error) {
    console.error("Error deleting menu:", error);
  }
}
async function findMenu(id) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return null;
  }
  try {
    const { data: menu, error: menuError } = await supabase.from("menus").select("id, occasion_id, name, description, active_sections, created_at").eq("id", id).eq("user_id", userId).single();
    if (menuError) throw menuError;
    const { data: menuRecipes, error: recipesError } = await supabase.from("menu_recipes").select("recipe_id, section").eq("menu_id", id).eq("user_id", userId);
    if (recipesError) throw recipesError;
    return {
      id: menu.id,
      occasionId: menu.occasion_id,
      title: menu.name,
      // name → title
      description: menu.description || "",
      enabledSections: menu.active_sections || [],
      recipes: buildRecipesStructure(menuRecipes || []),
      createdAt: menu.created_at
    };
  } catch (error) {
    console.error("Error finding menu:", error);
    return null;
  }
}
async function getMenusForOccasion(occasionId) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  try {
    const { data: menus, error: menusError } = await supabase.from("menus").select("id, occasion_id, name, description, active_sections, created_at").eq("occasion_id", occasionId).eq("user_id", userId).order("created_at", { ascending: false });
    if (menusError) throw menusError;
    if (!menus || menus.length === 0) return [];
    const menuIds = menus.map((m) => m.id);
    const { data: menuRecipes, error: recipesError } = await supabase.from("menu_recipes").select("menu_id, recipe_id, section").in("menu_id", menuIds).eq("user_id", userId);
    if (recipesError) throw recipesError;
    const recipesByMenu = /* @__PURE__ */ new Map();
    for (const mr of menuRecipes || []) {
      if (!recipesByMenu.has(mr.menu_id)) {
        recipesByMenu.set(mr.menu_id, []);
      }
      recipesByMenu.get(mr.menu_id).push(mr);
    }
    return menus.map((m) => ({
      id: m.id,
      occasionId: m.occasion_id,
      title: m.name,
      // name → title
      description: m.description || "",
      enabledSections: m.active_sections || [],
      recipes: buildRecipesStructure(recipesByMenu.get(m.id) || []),
      createdAt: m.created_at
    }));
  } catch (error) {
    console.error("Error loading menus for occasion:", error);
    return [];
  }
}
async function addRecipeToMenuSection(menuId, section, recipeId) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot add recipe to menu: no user session");
    return null;
  }
  try {
    const { data: existing, error: checkError } = await supabase.from("menu_recipes").select("id").eq("menu_id", menuId).eq("recipe_id", recipeId).eq("section", section).eq("user_id", userId).maybeSingle();
    if (checkError) throw checkError;
    if (!existing) {
      const { error: insertError } = await supabase.from("menu_recipes").insert({
        menu_id: menuId,
        recipe_id: recipeId,
        section,
        user_id: userId
      });
      if (insertError) throw insertError;
    }
    return await findMenu(menuId);
  } catch (error) {
    console.error("Error adding recipe to menu section:", error);
    return null;
  }
}
async function removeRecipeFromMenuSection(menuId, section, recipeId) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error("Cannot remove recipe from menu: no user session");
    return null;
  }
  try {
    const { error } = await supabase.from("menu_recipes").delete().eq("menu_id", menuId).eq("recipe_id", recipeId).eq("section", section).eq("user_id", userId);
    if (error) throw error;
    return await findMenu(menuId);
  } catch (error) {
    console.error("Error removing recipe from menu section:", error);
    return null;
  }
}
async function getRecipesForMenuSection(menuId, section) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  try {
    const { data: menuRecipes, error: mrError } = await supabase.from("menu_recipes").select("recipe_id").eq("menu_id", menuId).eq("section", section).eq("user_id", userId);
    if (mrError) throw mrError;
    if (!menuRecipes || menuRecipes.length === 0) return [];
    const recipeIds = menuRecipes.map((mr) => mr.recipe_id);
    const { data: recipes, error: recipesError } = await supabase.from("recipes").select(`
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
      `).in("id", recipeIds).eq("user_id", userId);
    if (recipesError) throw recipesError;
    return (recipes || []).map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      category: "",
      // Will be populated by caller if needed
      ingredients: (recipe.ingredients || []).sort((a, b) => a.sort_order - b.sort_order).map((ing) => ({
        name: ing.name,
        qty: ing.quantity
      })),
      steps: recipe.steps || [],
      createdAt: recipe.created_at,
      source: recipe.source
    }));
  } catch (error) {
    console.error("Error loading recipes for menu section:", error);
    return [];
  }
}
function cleanupMenusLocalStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("tipsyDinnerOccasions");
  window.localStorage.removeItem("tipsyDinnerMenus");
}
const C$6 = {
  bg: "#FAF7F2",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  textLight: "rgba(35,60,0,0.6)",
  textMedium: "rgba(35,60,0,0.7)",
  chipBg: "rgba(35,60,0,0.05)",
  chipBorder: "rgba(35,60,0,0.1)",
  chipSelected: "rgba(35,60,0,0.1)",
  chipBorderSelected: "rgba(35,60,0,0.35)",
  divider: "rgba(35,60,0,0.08)",
  menuBtnBg: "rgba(35,60,0,0.04)",
  menuBtnBorder: "rgba(35,60,0,0.1)",
  ctaBg: "#233C00",
  ctaText: "#FAF7F2",
  handle: "rgba(35,60,0,0.15)"
};
const fontSerif$4 = "'Fraunces', serif";
const fontSans$6 = "'Inter', sans-serif";
function getIconComponentByName(iconName) {
  const ICON_MAP = {
    IconChefHat,
    IconCandle,
    IconGrill,
    IconCake,
    IconGlassFull,
    IconHeart,
    IconStar,
    IconSun,
    IconMoon,
    IconSnowflake,
    IconFlame,
    IconLeaf,
    IconToolsKitchen2,
    IconBowlSpoon,
    IconPizza
  };
  return ICON_MAP[iconName] || IconChefHat;
}
function SaveRecipeFlow({ onClose, onPick, onNew, initialSelectedCategory }) {
  const [step, setStep] = reactExports.useState(1);
  const [slideDirection, setSlideDirection] = reactExports.useState(null);
  const [selectedCategory, setSelectedCategory] = reactExports.useState(initialSelectedCategory || null);
  const [addToMenu, setAddToMenu] = reactExports.useState(false);
  const [selectedOccasion, setSelectedOccasion] = reactExports.useState(null);
  const [selectedMenu, setSelectedMenu] = reactExports.useState(null);
  const [selectedSection, setSelectedSection] = reactExports.useState(null);
  const [allCats, setAllCats] = reactExports.useState([]);
  const [occasions, setOccasions] = reactExports.useState([]);
  reactExports.useEffect(() => {
    const loadCategories = async () => {
      const cats2 = await loadCustomCategories();
      setAllCats(cats2);
    };
    loadCategories();
  }, []);
  reactExports.useEffect(() => {
    let ignore = false;
    loadOccasions().then((loaded) => {
      if (!ignore) setOccasions(loaded);
    });
    return () => {
      ignore = true;
    };
  }, []);
  const cats = initialSelectedCategory ? [
    ...allCats.filter((c) => c.key === initialSelectedCategory.key),
    ...allCats.filter((c) => c.key !== initialSelectedCategory.key)
  ] : allCats;
  const handleCategorySelect = (key, label) => {
    setSelectedCategory({ key, label });
  };
  const handleYes = () => {
    if (!selectedCategory) return;
    setAddToMenu(true);
    setSlideDirection("forward");
    setTimeout(() => setStep(2), 0);
  };
  const handleSkip = () => {
    if (!selectedCategory) return;
    onPick(selectedCategory.key, selectedCategory.label);
    setSlideDirection("forward");
    setTimeout(() => setStep(3), 0);
  };
  const handleSaveWithoutMenu = () => {
    if (!selectedCategory) return;
    onPick(selectedCategory.key, selectedCategory.label);
    setSlideDirection("forward");
    setTimeout(() => setStep(3), 0);
  };
  const handleSaveWithMenu = () => {
    if (!selectedCategory || !selectedMenu || !selectedSection) return;
    onPick(selectedCategory.key, selectedCategory.label, {
      menuId: selectedMenu,
      section: selectedSection
    });
    setSlideDirection("forward");
    setTimeout(() => setStep(3), 0);
  };
  const handleBackToStep1 = () => {
    setSlideDirection("back");
    setTimeout(() => {
      setStep(1);
      setAddToMenu(false);
      setSelectedOccasion(null);
      setSelectedMenu(null);
      setSelectedSection(null);
    }, 0);
  };
  const getStepStyle = (currentStep) => {
    if (step !== currentStep) {
      return { display: "none" };
    }
    const baseStyle = {
      animation: slideDirection === "forward" ? "slide-in-left 300ms cubic-bezier(0.4, 0, 0.2, 1)" : slideDirection === "back" ? "slide-in-right 300ms cubic-bezier(0.4, 0, 0.2, 1)" : "none"
    };
    return baseStyle;
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      onClick: onClose,
      style: {
        position: "absolute",
        inset: 0,
        background: "rgba(35, 60, 0, 0.08)",
        zIndex: 80,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "tipsy-fade 0.22s ease"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              background: C$6.bg,
              borderRadius: "24px 24px 0 0",
              padding: "16px 0 24px",
              width: "100%",
              maxHeight: "80vh",
              animation: "tipsy-slideup 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 36, height: 4, borderRadius: 2, background: C$6.handle, margin: "0 auto 14px" } }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: getStepStyle(1), children: step === 1 && /* @__PURE__ */ jsxRuntimeExports.jsx(
                SaveStep1,
                {
                  cats,
                  selectedCategory,
                  onSelectCategory: handleCategorySelect,
                  onNew,
                  onYes: handleYes,
                  onSkip: handleSkip,
                  onSave: handleSaveWithoutMenu
                }
              ) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: getStepStyle(2), children: step === 2 && /* @__PURE__ */ jsxRuntimeExports.jsx(
                SaveStep2,
                {
                  occasions,
                  selectedCategory,
                  selectedOccasion,
                  setSelectedOccasion,
                  selectedMenu,
                  setSelectedMenu,
                  selectedSection,
                  setSelectedSection,
                  onBack: handleBackToStep1,
                  onSave: handleSaveWithMenu
                }
              ) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: getStepStyle(3), children: step === 3 && /* @__PURE__ */ jsxRuntimeExports.jsx(
                SaveStep3,
                {
                  categoryLabel: selectedCategory?.label || "",
                  menuName: selectedMenu ? findMenu(selectedMenu)?.title : null,
                  sectionLabel: selectedSection,
                  onDone: onClose
                }
              ) })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `
        @keyframes tipsy-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tipsy-slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slide-in-left { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slide-in-right { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      ` })
      ]
    }
  );
}
function SaveStep1({ cats, selectedCategory, onSelectCategory, onNew, onYes, onSkip, onSave }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 8, height: 8, borderRadius: "50%", background: C$6.text } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 8, height: 8, borderRadius: "50%", background: C$6.chipBorder } })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { padding: "0 18px 14px", borderBottom: `1px solid ${C$6.divider}` }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$6, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: C$6.textMuted, marginBottom: 6 }, children: "Pick a category" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSerif$4, fontStyle: "italic", fontSize: 13, color: C$6.text }, children: "Swipe to find the right category." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { overflowX: "auto", padding: "14px 18px 4px", display: "flex", gap: 10, scrollbarWidth: "none" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: onNew,
          style: {
            flexShrink: 0,
            width: 96,
            cursor: "pointer",
            background: "none",
            padding: 0,
            textAlign: "left",
            border: "none"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
              width: 96,
              height: 70,
              borderRadius: 12,
              background: C$6.chipBg,
              border: `1px solid ${C$6.chipBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C$6.textLight,
              fontSize: 32,
              fontWeight: 300,
              lineHeight: 1,
              boxSizing: "border-box"
            }, children: "+" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$6, fontSize: 11, fontWeight: 500, color: C$6.text, padding: "6px 4px 2px" }, children: "New category" })
          ]
        }
      ),
      cats.map((c) => {
        const isSelected = selectedCategory?.key === c.key;
        const cardStyle = isSelected ? {
          width: 96,
          height: 70,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(35,60,0,0.1)"
        } : {
          width: 96,
          height: 70,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: c.gradient
        };
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => onSelectCategory(c.key, c.label),
            style: {
              flexShrink: 0,
              width: 96,
              cursor: "pointer",
              borderRadius: 12,
              overflow: "hidden",
              border: isSelected ? "1px solid rgba(35,60,0,0.35)" : "2px solid transparent",
              background: "none",
              padding: 0,
              textAlign: "left"
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: cardStyle, children: [
                !isSelected && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { position: "absolute", inset: 0, background: "rgba(35, 60, 0, 0.15)" } }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                  position: "absolute",
                  bottom: 6,
                  left: 0,
                  right: 0,
                  textAlign: "center",
                  fontFamily: fontSans$6,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: isSelected ? "#233C00" : "rgba(255,255,255,0.95)",
                  textShadow: isSelected ? "none" : "0 1px 3px rgba(0,0,0,0.3)"
                }, children: c.label })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$6, fontSize: 11, fontWeight: 500, color: C$6.text, padding: "6px 4px 2px" }, children: c.label })
            ]
          },
          c.key
        );
      })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { padding: "20px 18px 8px" }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: onYes,
        disabled: !selectedCategory,
        style: {
          width: "100%",
          padding: "12px 16px",
          background: C$6.menuBtnBg,
          border: `1px solid ${C$6.menuBtnBorder}`,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: selectedCategory ? "pointer" : "not-allowed",
          opacity: selectedCategory ? 1 : 0.4
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontFamily: fontSans$6, fontSize: 14, fontWeight: 500, color: C$6.textMedium }, children: "Add to a menu" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", style: { color: C$6.textLight }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "9 18 15 12 9 6" }) })
        ]
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { padding: "0 18px", margin: "12px 0", display: "flex", alignItems: "center", gap: 12 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, height: 1, background: C$6.divider } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontFamily: fontSans$6, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: C$6.textMuted }, children: "or" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, height: 1, background: C$6.divider } })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: selectedCategory ? onSave : void 0,
        style: {
          width: "calc(100% - 36px)",
          margin: "0 18px",
          padding: "14px",
          background: "#233C00",
          border: "none",
          borderRadius: 14,
          color: "#FAF7F2",
          fontFamily: fontSans$6,
          fontSize: 12,
          fontWeight: 500,
          textTransform: "lowercase",
          letterSpacing: "0.02em",
          cursor: selectedCategory ? "pointer" : "not-allowed",
          opacity: selectedCategory ? 1 : 0.4,
          pointerEvents: selectedCategory ? "auto" : "none"
        },
        children: "save recipe for now"
      }
    )
  ] });
}
function SaveStep2({ occasions, selectedOccasion, setSelectedOccasion, selectedMenu, setSelectedMenu, selectedSection, setSelectedSection, onBack, onSave }) {
  const [menus, setMenus] = reactExports.useState([]);
  const [selectedMenuData, setSelectedMenuData] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (!selectedOccasion) {
      setMenus([]);
      return;
    }
    let ignore = false;
    getMenusForOccasion(selectedOccasion).then((loaded) => {
      if (!ignore) setMenus(loaded);
    });
    return () => {
      ignore = true;
    };
  }, [selectedOccasion]);
  reactExports.useEffect(() => {
    if (!selectedMenu) {
      setSelectedMenuData(null);
      return;
    }
    let ignore = false;
    findMenu(selectedMenu).then((loaded) => {
      if (!ignore) setSelectedMenuData(loaded);
    });
    return () => {
      ignore = true;
    };
  }, [selectedMenu]);
  const SECTION_LABELS2 = {
    apps: "Apps",
    mains: "Mains",
    sides: "Sides",
    desserts: "Desserts",
    drinks: "Drinks"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 8, height: 8, borderRadius: "50%", background: C$6.text } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 8, height: 8, borderRadius: "50%", background: C$6.text } })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { padding: "0 18px 14px", borderBottom: `1px solid ${C$6.divider}` }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$6, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: C$6.textMuted, marginBottom: 6 }, children: "Add to a menu" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSerif$4, fontStyle: "italic", fontSize: 13, color: C$6.text }, children: "pick an occasion and course" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1, overflowY: "auto", padding: "14px 18px", maxHeight: "50vh" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { marginBottom: 20 }, children: occasions.map((occasion) => {
        const IconComponent = getIconComponentByName(occasion.icon);
        const isSelected = selectedOccasion === occasion.id;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => {
              setSelectedOccasion(occasion.id);
              setSelectedMenu(null);
              setSelectedSection(null);
            },
            style: {
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px",
              background: isSelected ? C$6.chipSelected : "transparent",
              border: `1px solid ${isSelected ? C$6.chipBorderSelected : "transparent"}`,
              borderRadius: 10,
              cursor: "pointer",
              marginBottom: 8,
              textAlign: "left"
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: C$6.chipBg,
                border: `1px solid ${C$6.chipBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconComponent, { size: 18, color: C$6.textLight }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                fontFamily: fontSans$6,
                fontSize: 14,
                fontWeight: 500,
                color: C$6.text
              }, children: occasion.name })
            ]
          },
          occasion.id
        );
      }) }),
      selectedOccasion && menus.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginBottom: 20 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
          fontFamily: fontSans$6,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: C$6.textMuted,
          marginBottom: 8
        }, children: "Menu" }),
        menus.map((menu) => {
          const isSelected = selectedMenu === menu.id;
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => {
                setSelectedMenu(menu.id);
                setSelectedSection(null);
              },
              style: {
                width: "100%",
                padding: "10px 12px",
                background: isSelected ? C$6.chipSelected : "transparent",
                border: `1px solid ${isSelected ? C$6.chipBorderSelected : C$6.chipBorder}`,
                borderRadius: 8,
                cursor: "pointer",
                marginBottom: 6,
                textAlign: "left",
                fontFamily: fontSans$6,
                fontSize: 13,
                color: C$6.text
              },
              children: menu.title
            },
            menu.id
          );
        })
      ] }),
      selectedMenuData && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
          fontFamily: fontSans$6,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: C$6.textMuted,
          marginBottom: 8
        }, children: "Course" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 }, children: selectedMenuData.enabledSections.map((section) => {
          const isSelected = selectedSection === section;
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setSelectedSection(section),
              style: {
                padding: "8px 14px",
                background: isSelected ? C$6.chipSelected : C$6.chipBg,
                color: isSelected ? C$6.text : C$6.textLight,
                border: `1px solid ${isSelected ? C$6.chipBorderSelected : C$6.chipBorder}`,
                borderRadius: 20,
                fontFamily: fontSans$6,
                fontSize: 11,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "pointer"
              },
              children: SECTION_LABELS2[section]
            },
            section
          );
        }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C$6.divider}` }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onBack,
          style: {
            background: "transparent",
            border: "none",
            color: C$6.textLight,
            fontFamily: fontSans$6,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            padding: 0
          },
          children: "← Back"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: selectedSection ? onSave : void 0,
          style: {
            padding: "12px 24px",
            background: "#233C00",
            border: "none",
            borderRadius: 14,
            color: "#FAF7F2",
            fontFamily: fontSans$6,
            fontSize: 12,
            fontWeight: 500,
            textTransform: "lowercase",
            letterSpacing: "0.02em",
            cursor: selectedSection ? "pointer" : "not-allowed",
            opacity: selectedSection ? 1 : 0.4,
            pointerEvents: selectedSection ? "auto" : "none"
          },
          children: "save recipe for now"
        }
      )
    ] })
  ] });
}
function SaveStep3({ categoryLabel, menuName, sectionLabel: sectionLabel2, onDone }) {
  const SECTION_LABELS2 = {
    apps: "apps",
    mains: "mains",
    sides: "sides",
    desserts: "desserts",
    drinks: "drinks"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { padding: "40px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      width: 64,
      height: 64,
      borderRadius: "50%",
      background: C$6.chipBg,
      border: `2px solid ${C$6.chipBorder}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: C$6.text, strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M20 6L9 17l-5-5" }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { textAlign: "center" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
        fontFamily: fontSerif$4,
        fontStyle: "italic",
        fontSize: 18,
        color: C$6.text,
        marginBottom: 6
      }, children: [
        "Saved to ",
        categoryLabel,
        menuName ? ` + ${menuName}` : ""
      ] }),
      sectionLabel2 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
        fontFamily: fontSerif$4,
        fontStyle: "italic",
        fontSize: 14,
        color: C$6.textLight
      }, children: [
        "added to ",
        SECTION_LABELS2[sectionLabel2]
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onDone,
        style: {
          padding: "14px 32px",
          background: C$6.ctaBg,
          color: C$6.ctaText,
          border: "none",
          borderRadius: 14,
          fontFamily: fontSans$6,
          fontSize: 12,
          fontWeight: 500,
          textTransform: "lowercase",
          letterSpacing: "0.02em",
          cursor: "pointer",
          marginTop: 8
        },
        children: "done"
      }
    )
  ] });
}
const C$5 = {
  bg: "#FAF7F2",
  inputBg: "rgba(35,60,0,0.05)",
  inputBorder: "rgba(35,60,0,0.1)",
  inputBorderActive: "rgba(35,60,0,0.3)",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  textLight: "rgba(35,60,0,0.6)",
  textVeryLight: "rgba(35,60,0,0.4)",
  textRemove: "rgba(35,60,0,0.2)",
  progressTrack: "rgba(35,60,0,0.1)",
  progressFill: "#233C00",
  nextBtnBg: "#233C00",
  nextBtnText: "#FAF7F2",
  stepNumBg: "rgba(35,60,0,0.06)",
  stepNumBorder: "rgba(35,60,0,0.1)",
  stepNumText: "rgba(35,60,0,0.4)",
  error: "#c0392b"
};
const fontSerif$3 = "Fraunces, serif";
const fontSans$5 = "Inter, sans-serif";
const fontDisplay$1 = "Inter, sans-serif";
function AddYourOwn({ back, goCategories, goRecipe, editRecipe, editCategoryLabel, onSaveEdit, onDeleted, onCreateCategoryForRecipe, initialDraft }) {
  const isEdit = typeof editRecipe?.savedId === "number";
  const [showDelete, setShowDelete] = reactExports.useState(false);
  const [step, setStep] = reactExports.useState(initialDraft?.step ?? 1);
  const [title, setTitle] = reactExports.useState(initialDraft?.title ?? editRecipe?.title ?? "");
  const [desc, setDesc] = reactExports.useState(initialDraft?.description ?? editRecipe?.description ?? "");
  const [titleErr, setTitleErr] = reactExports.useState(false);
  const [descErr, setDescErr] = reactExports.useState(false);
  const [ingName, setIngName] = reactExports.useState("");
  const [ingQty, setIngQty] = reactExports.useState("");
  const [ingErr, setIngErr] = reactExports.useState(false);
  const [ingredients, setIngredients] = reactExports.useState(initialDraft?.ingredients ?? editRecipe?.ingredients ?? []);
  const [stepInput, setStepInput] = reactExports.useState("");
  const [stepErr, setStepErr] = reactExports.useState(false);
  const [steps, setSteps] = reactExports.useState(initialDraft?.steps ?? editRecipe?.steps ?? []);
  const [tab, setTab] = reactExports.useState("ingredients");
  const [trayOpen, setTrayOpen] = reactExports.useState(!!initialDraft?.trayOpen);
  const [newCategorySelection, setNewCategorySelection] = reactExports.useState(initialDraft?.newCategory || null);
  const [savedCategory, setSavedCategory] = reactExports.useState(null);
  const [editing, setEditing] = reactExports.useState(null);
  const editRowRef = reactExports.useRef(null);
  const cancelEdit = () => setEditing(null);
  const startEditIngredient = (i) => {
    if (editing) cancelEdit();
    const it = ingredients[i];
    setEditing({ kind: "ingredient", index: i, name: it.name, qty: it.qty });
  };
  const confirmEditIngredient = () => {
    if (!editing || editing.kind !== "ingredient") return;
    if (!editing.name.trim()) return;
    const idx = editing.index;
    const next = { name: editing.name.trim(), qty: editing.qty.trim() };
    setIngredients((arr) => arr.map((v, i) => i === idx ? next : v));
    setEditing(null);
  };
  const startEditStep = (i) => {
    if (editing) cancelEdit();
    setEditing({ kind: "step", index: i, text: steps[i] });
  };
  const confirmEditStep = () => {
    if (!editing || editing.kind !== "step") return;
    if (!editing.text.trim()) return;
    const idx = editing.index;
    const text = editing.text.trim();
    setSteps((arr) => arr.map((v, i) => i === idx ? text : v));
    setEditing(null);
  };
  reactExports.useEffect(() => {
    if (!editing) return;
    const onDown = (e) => {
      const node = editRowRef.current;
      if (node && !node.contains(e.target)) cancelEdit();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [editing]);
  const onHeaderBack = () => {
    if (step === 1) back();
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(3);
    else if (step === 6) {
      reset();
      back();
    }
  };
  const reset = () => {
    setStep(1);
    setTitle("");
    setDesc("");
    setTitleErr(false);
    setDescErr(false);
    setIngName("");
    setIngQty("");
    setIngErr(false);
    setIngredients([]);
    setStepInput("");
    setStepErr(false);
    setSteps([]);
    setTab("ingredients");
    setTrayOpen(false);
    setSavedCategory(null);
    setEditing(null);
  };
  const tryAdvance1 = () => {
    const tErr = !title.trim();
    const dErr = !desc.trim();
    setTitleErr(tErr);
    setDescErr(dErr);
    if (!tErr && !dErr) setStep(2);
  };
  const addIngredient = () => {
    if (!ingName.trim()) {
      setIngErr(true);
      return;
    }
    setIngredients((arr) => [...arr, { name: ingName.trim(), qty: ingQty.trim() }]);
    setIngName("");
    setIngQty("");
    setIngErr(false);
  };
  const removeIngredient = (i) => setIngredients((arr) => arr.filter((_, idx) => idx !== i));
  const addStep = () => {
    if (!stepInput.trim()) {
      setStepErr(true);
      return;
    }
    setSteps((arr) => [...arr, stepInput.trim()]);
    setStepInput("");
    setStepErr(false);
  };
  const removeStep = (i) => setSteps((arr) => arr.filter((_, idx) => idx !== i));
  const tryAdvance3 = () => {
    if (steps.length === 0) {
      setStepErr(true);
      return;
    }
    setStep(4);
  };
  const onPickCategory = async (key, label, menuInfo) => {
    const id = Date.now();
    await saveRecipe({
      id,
      title: title.trim(),
      description: desc.trim(),
      category: key,
      ingredients,
      steps,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }, "manual", key);
    if (menuInfo) {
      addRecipeToMenuSection(menuInfo.menuId, menuInfo.section, id);
    }
    setSavedCategory({ key, label });
    setTrayOpen(false);
    setStep(6);
  };
  const saveEdit = async () => {
    if (!isEdit || !editRecipe || !editRecipe.savedId) return;
    await updateSavedRecipe(editRecipe.savedId, {
      title: title.trim(),
      description: desc.trim(),
      ingredients,
      steps
    });
    const updated = {
      ...editRecipe,
      title: title.trim(),
      description: desc.trim(),
      ingredients,
      steps
    };
    onSaveEdit?.(updated, editCategoryLabel ?? editRecipe.category);
  };
  const previewRecipe = {
    title: title || "—",
    description: desc || "—",
    color: C$5.accent,
    category: savedCategory?.label.toLowerCase() ?? "your recipe",
    ingredients,
    steps
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: C$5.bg, position: "relative" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      height: 52,
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      position: "relative",
      flexShrink: 0
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onHeaderBack, "aria-label": "Back", style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      padding: 0
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "rgba(35,60,0,0.6)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "15 18 9 12 15 6" }) }) }) }),
    step >= 1 && step <= 3 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { padding: "0 24px 20px", flexShrink: 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { height: 2, background: C$5.progressTrack, borderRadius: 2, overflow: "hidden" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      height: "100%",
      background: C$5.progressFill,
      borderRadius: 2,
      width: `${step * 20}%`,
      transition: "width 0.35s ease"
    } }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, overflowY: "auto", padding: "0 24px 28px" }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(ScreenWrap, { children: [
      step === 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Title$1, { children: "What are we making?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Sub$1, { children: "Give your recipe a name and a short description." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label$4, { children: "Recipe name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TextInput$2, { value: title, onChange: (v) => {
            setTitle(v);
            if (v.trim()) setTitleErr(false);
          }, placeholder: "e.g. Spicy Tomato Pasta" }),
          titleErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg$4, { children: "Please give your recipe a name." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Field, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label$4, { children: "Short description" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TextArea$2, { value: desc, onChange: (v) => {
            setDesc(v);
            if (v.trim()) setDescErr(false);
          }, placeholder: "One or two lines about the dish." }),
          descErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg$4, { children: "Please add a short description." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PrimaryBtn, { onClick: tryAdvance1, children: "Continue to Ingredients →" }),
        isEdit && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setShowDelete(true), style: {
          width: "100%",
          background: "transparent",
          color: C$5.error,
          border: "none",
          padding: "12px",
          fontFamily: fontSans$5,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: "pointer",
          marginTop: 4
        }, children: "Delete recipe" })
      ] }),
      step === 2 && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Title$1, { children: "What goes in it?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Sub$1, { children: "Add each ingredient with a name and quantity." }),
        ingredients.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { marginBottom: 14 }, children: ingredients.map((it, i) => {
          const isEditing = editing?.kind === "ingredient" && editing.index === i;
          if (isEditing && editing?.kind === "ingredient") {
            return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: editRowRef, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(ListItem, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 10, flex: 1, alignItems: "center" }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 80, flexShrink: 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  EditInput,
                  {
                    value: editing.qty,
                    onChange: (v) => setEditing({ ...editing, qty: v }),
                    placeholder: "Qty",
                    onEnter: confirmEditIngredient
                  }
                ) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  EditInput,
                  {
                    value: editing.name,
                    onChange: (v) => setEditing({ ...editing, name: v }),
                    placeholder: "Ingredient",
                    autoFocus: true,
                    onEnter: confirmEditIngredient
                  }
                ) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(ConfirmBtn, { onClick: confirmEditIngredient })
            ] }) }, i);
          }
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(ListItem, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 80, flexShrink: 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                value: it.qty,
                readOnly: true,
                onClick: () => startEditIngredient(i),
                style: {
                  width: 80,
                  minWidth: 80,
                  maxWidth: 80,
                  background: C$5.inputBg,
                  border: `1px solid ${C$5.inputBorder}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 15,
                  fontWeight: 500,
                  fontFamily: fontSans$5,
                  color: C$5.textVeryLight,
                  textAlign: "center",
                  fontVariantNumeric: "tabular-nums",
                  cursor: "pointer",
                  boxSizing: "border-box"
                }
              }
            ) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                onClick: () => startEditIngredient(i),
                style: { flex: 1, cursor: "pointer" },
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    value: it.name,
                    readOnly: true,
                    style: {
                      width: "100%",
                      background: C$5.inputBg,
                      border: `1px solid ${C$5.inputBorder}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      fontSize: 15,
                      fontWeight: 400,
                      fontFamily: fontSans$5,
                      color: C$5.text,
                      cursor: "pointer"
                    }
                  }
                )
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(DelBtn, { onClick: () => removeIngredient(i) })
          ] }, i);
        }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 10, marginBottom: 8 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 80, flexShrink: 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              id: "qty-input",
              type: "text",
              value: ingQty,
              onChange: (e) => setIngQty(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addIngredient();
                }
              },
              placeholder: "Qty",
              style: {
                width: 80,
                minWidth: 80,
                maxWidth: 80,
                background: C$5.inputBg,
                border: `1px solid ${C$5.inputBorder}`,
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 15,
                fontWeight: 500,
                fontFamily: fontSans$5,
                color: C$5.textVeryLight,
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
                outline: "none",
                boxSizing: "border-box"
              }
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            TextInput$2,
            {
              value: ingName,
              onChange: (v) => {
                setIngName(v);
                if (v.trim()) setIngErr(false);
              },
              placeholder: "Ingredient",
              onEnter: () => {
                const el = document.getElementById("qty-input");
                el?.focus();
              }
            }
          ) })
        ] }),
        ingErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg$4, { children: "Please enter an ingredient name." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AddBtn, { onClick: addIngredient, children: "Add ingredient" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { height: 16 } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PrimaryBtn, { onClick: () => setStep(3), children: "Continue to Steps →" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(GhostBtn, { onClick: () => setStep(1), children: "← Back" })
      ] }),
      step === 3 && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Title$1, { children: "How do you make it?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Sub$1, { children: "Walk through each step in order." }),
        steps.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { marginBottom: 14 }, children: steps.map((s, i) => {
          const isEditing = editing?.kind === "step" && editing.index === i;
          if (isEditing && editing?.kind === "step") {
            return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: editRowRef, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(ListItem, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: C$5.stepNumBg,
                border: `1px solid ${C$5.stepNumBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                fontFamily: fontSans$5,
                fontSize: 11,
                fontWeight: 500,
                color: C$5.stepNumText
              }, children: i + 1 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                EditInput,
                {
                  value: editing.text,
                  onChange: (v) => setEditing({ ...editing, text: v }),
                  placeholder: "Describe the step",
                  autoFocus: true,
                  onEnter: confirmEditStep
                }
              ) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(ConfirmBtn, { onClick: confirmEditStep })
            ] }) }, i);
          }
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(ListItem, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: C$5.stepNumBg,
              border: `1px solid ${C$5.stepNumBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
              fontFamily: fontSans$5,
              fontSize: 11,
              fontWeight: 500,
              color: C$5.stepNumText
            }, children: i + 1 }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                value: s,
                readOnly: true,
                onClick: () => startEditStep(i),
                style: {
                  width: "100%",
                  background: C$5.inputBg,
                  border: `1px solid ${C$5.inputBorder}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 14,
                  fontWeight: 400,
                  fontFamily: fontSans$5,
                  color: C$5.text,
                  lineHeight: 1.5,
                  cursor: "pointer"
                }
              }
            ) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(DelBtn, { onClick: () => removeStep(i) })
          ] }, i);
        }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          TextInput$2,
          {
            value: stepInput,
            onChange: (v) => {
              setStepInput(v);
              if (v.trim()) setStepErr(false);
            },
            placeholder: "Describe the step",
            onEnter: addStep
          }
        ),
        stepErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg$4, { children: steps.length === 0 && !stepInput.trim() ? "Add at least one step to continue." : "Please enter a step." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { height: 8 } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AddBtn, { onClick: addStep, children: "Add step" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { height: 16 } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PrimaryBtn, { onClick: tryAdvance3, children: "Preview recipe card →" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(GhostBtn, { onClick: () => setStep(2), children: "← Back to Ingredients" })
      ] }),
      step === 4 && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$5, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(35,60,0,0.35)", marginBottom: 16 }, children: "Looking good." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PreviewCard, { recipe: previewRecipe, tab, setTab }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", justifyContent: "center", marginTop: 20 }, children: isEdit ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: saveEdit, style: {
          padding: "12px 28px",
          background: C$5.nextBtnBg,
          color: C$5.nextBtnText,
          border: "none",
          borderRadius: 20,
          fontFamily: fontSans$5,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.02em",
          textTransform: "lowercase",
          cursor: "pointer"
        }, children: "Save" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setTrayOpen(true), style: {
          padding: "12px 28px",
          background: C$5.nextBtnBg,
          color: C$5.nextBtnText,
          border: "none",
          borderRadius: 20,
          fontFamily: fontSans$5,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.02em",
          textTransform: "lowercase",
          cursor: "pointer"
        }, children: "Save" }) })
      ] }),
      step === 6 && savedCategory && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(35,60,0,0.06)",
          border: "1px solid rgba(35,60,0,0.14)",
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 16
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 7, height: 7, borderRadius: "50%", background: C$5.text } }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { fontFamily: fontSans$5, fontSize: 12, color: C$5.text, fontWeight: 500 }, children: [
            "Saved to ",
            savedCategory.label
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Title$1, { children: title }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Sub$1, { children: "Tap the card to view it in Explore." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { onClick: () => goRecipe({ ...previewRecipe, categoryKey: savedCategory.key }, savedCategory.key, savedCategory.label), style: { cursor: "pointer" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(PreviewCard, { recipe: previewRecipe, tab, setTab }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8, marginTop: 8 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: reset, style: browseActionStyle(false), children: "Add another" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: goCategories, style: browseActionStyle(true), children: "Explore all" })
        ] })
      ] })
    ] }, step) }),
    trayOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
      SaveRecipeFlow,
      {
        onClose: () => {
          setTrayOpen(false);
          setNewCategorySelection(null);
        },
        onPick: onPickCategory,
        onNew: () => {
          setTrayOpen(false);
          onCreateCategoryForRecipe?.({
            title: title.trim(),
            description: desc.trim(),
            ingredients,
            steps
          });
        },
        initialSelectedCategory: newCategorySelection
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `
        @keyframes tipsy-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tipsy-slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes tipsy-fadeup { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      ` }),
    isEdit && showDelete && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        onClick: () => setShowDelete(false),
        style: {
          position: "absolute",
          inset: 0,
          background: "rgba(35,60,0,0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 30,
          padding: 24
        },
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              background: C$5.bg,
              borderRadius: 16,
              padding: "24px 20px",
              width: "100%",
              maxWidth: 280,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              border: `1px solid ${C$5.inputBorder}`
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontDisplay$1,
                fontStyle: "normal",
                fontSize: 20,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: C$5.text,
                textAlign: "center"
              }, children: "Delete this recipe?" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$5, fontSize: 13, color: C$5.textLight, textAlign: "center", marginBottom: 12 }, children: "This can't be undone." }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setShowDelete(false),
                  style: {
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    background: "transparent",
                    border: `1px solid ${C$5.inputBorder}`,
                    color: C$5.textLight,
                    fontFamily: fontSans$5,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer"
                  },
                  children: "Cancel"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: async () => {
                    if (editRecipe && editRecipe.savedId) {
                      await deleteSavedRecipe(editRecipe.savedId);
                    }
                    setShowDelete(false);
                    onDeleted?.();
                  },
                  style: {
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    background: C$5.error,
                    border: "none",
                    color: C$5.bg,
                    fontFamily: fontSans$5,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer"
                  },
                  children: "Delete"
                }
              )
            ]
          }
        )
      }
    )
  ] });
}
function ScreenWrap({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { animation: "tipsy-fadeup 0.28s ease" }, children });
}
function Title$1({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontDisplay$1, fontStyle: "normal", fontSize: 26, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: C$5.text, marginBottom: 4, lineHeight: 1.1 }, children });
}
function Sub$1({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$5, fontSize: 12, color: C$5.textLight, lineHeight: 1.5, marginBottom: 20 }, children });
}
function Field({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { marginBottom: 18 }, children });
}
function Label$4({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("label", { style: { display: "block", fontFamily: fontSans$5, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C$5.textMuted, marginBottom: 6 }, children });
}
function ValMsg$4({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$5, fontSize: 11, color: C$5.error, marginTop: 5 }, children });
}
const inputStyleBase$4 = {
  width: "100%",
  background: C$5.inputBg,
  border: `1px solid ${C$5.inputBorder}`,
  borderRadius: 10,
  padding: "12px 14px",
  fontFamily: fontSans$5,
  fontSize: 15,
  fontWeight: 400,
  color: C$5.text,
  lineHeight: 1.4,
  outline: "none",
  WebkitAppearance: "none"
};
function TextInput$2({
  value,
  onChange,
  placeholder,
  onEnter,
  id
}) {
  const [focused, setFocused] = reactExports.useState(false);
  const onKey = (e) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      id,
      type: "text",
      value,
      onChange: (e) => onChange(e.target.value),
      onKeyDown: onKey,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      placeholder,
      style: {
        ...inputStyleBase$4,
        borderColor: focused ? C$5.inputBorderActive : C$5.inputBorder
      }
    }
  );
}
function TextArea$2({ value, onChange, placeholder }) {
  const [focused, setFocused] = reactExports.useState(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "textarea",
    {
      value,
      onChange: (e) => onChange(e.target.value),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      placeholder,
      rows: 3,
      style: {
        ...inputStyleBase$4,
        fontFamily: fontSerif$3,
        fontStyle: "italic",
        fontWeight: 300,
        fontSize: 15,
        resize: "none",
        lineHeight: 1.5,
        minHeight: 80,
        borderColor: focused ? C$5.inputBorderActive : C$5.inputBorder
      }
    }
  );
}
function PrimaryBtn({ children, onClick }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick, style: {
    width: "100%",
    background: C$5.nextBtnBg,
    color: C$5.nextBtnText,
    border: "none",
    borderRadius: 12,
    padding: "14px",
    fontFamily: fontSans$5,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer",
    marginTop: 8
  }, children });
}
function GhostBtn({ children, onClick }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick, style: {
    width: "100%",
    background: "none",
    color: C$5.textLight,
    border: `1px solid ${C$5.inputBorder}`,
    borderRadius: 12,
    padding: "12px",
    fontFamily: fontSans$5,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    marginTop: 8
  }, children });
}
function AddBtn({ children, onClick }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick, style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    fontFamily: fontSans$5,
    fontSize: 13,
    fontWeight: 500,
    color: C$5.textMuted,
    background: "none",
    border: "none",
    padding: "4px 0",
    cursor: "pointer",
    width: "100%",
    marginTop: 4
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "5", y1: "12", x2: "19", y2: "12" })
    ] }),
    children
  ] });
}
function ListItem({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    background: C$5.inputBg,
    border: `1px solid ${C$5.inputBorder}`,
    borderRadius: 10,
    padding: "10px 12px",
    marginBottom: 6,
    gap: 10,
    animation: "tipsy-fadeup 0.2s ease"
  }, children });
}
function DelBtn({ onClick }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick, "aria-label": "Remove", style: {
    background: "none",
    border: "none",
    cursor: "pointer",
    width: 20,
    height: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    padding: 0
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: C$5.textRemove, strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
  ] }) });
}
function EditInput({
  value,
  onChange,
  placeholder,
  onEnter,
  autoFocus
}) {
  const [focused, setFocused] = reactExports.useState(false);
  const onKey = (e) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      type: "text",
      autoFocus,
      value,
      onChange: (e) => onChange(e.target.value),
      onKeyDown: onKey,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      placeholder,
      style: {
        ...inputStyleBase$4,
        padding: "12px 14px",
        fontSize: 15,
        borderColor: focused ? C$5.inputBorderActive : C$5.inputBorder
      }
    }
  );
}
function ConfirmBtn({ onClick }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      onClick: (e) => {
        e.stopPropagation();
        onClick();
      },
      onMouseDown: (e) => e.preventDefault(),
      "aria-label": "Confirm",
      style: {
        background: C$5.nextBtnBg,
        border: "none",
        color: C$5.nextBtnText,
        cursor: "pointer",
        width: 28,
        height: 28,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        padding: 0
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 12l5 5L20 7" }) })
    }
  );
}
function browseActionStyle(primary) {
  return {
    flex: 1,
    background: primary ? C$5.text : "none",
    border: `1px solid ${primary ? C$5.text : "rgba(35,60,0,0.1)"}`,
    color: primary ? C$5.bg : C$5.text,
    borderRadius: 12,
    padding: "12px",
    fontFamily: fontSans$5,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer"
  };
}
function PreviewCard({
  recipe,
  tab,
  setTab
}) {
  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginBottom: 20 }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontDisplay$1, fontSize: 28, textTransform: "uppercase", color: C$5.text, marginBottom: 6, lineHeight: 1.2 }, children: recipe.title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSerif$3, fontStyle: "italic", fontSize: 14, color: "rgba(35,60,0,0.55)", lineHeight: 1.5, marginBottom: 16 }, children: recipe.description }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", gap: 24, borderBottom: `1px solid rgba(35,60,0,0.08)`, marginBottom: 12 }, children: ["ingredients", "steps"].map((t) => {
      const active = tab === t;
      return /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setTab(t), style: {
        padding: "10px 0",
        fontFamily: fontSans$5,
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontWeight: 500,
        color: active ? C$5.text : "rgba(35,60,0,0.3)",
        background: "none",
        border: "none",
        borderBottom: active ? `1.5px solid ${C$5.text}` : "none",
        marginBottom: active ? -1 : 0,
        cursor: "pointer"
      }, children: t }, t);
    }) }),
    tab === "ingredients" && (ingredients.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$5, fontSize: 12, color: "rgba(35,60,0,0.35)", fontStyle: "italic", textAlign: "center", padding: 14 }, children: "No ingredients added." }) : ingredients.map((it, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 0",
      fontFamily: fontSans$5,
      fontSize: 15,
      borderBottom: i === ingredients.length - 1 ? "none" : "1px dotted rgba(35,60,0,0.1)"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { color: C$5.text }, children: it.name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { color: "rgba(35,60,0,0.45)", fontSize: 14, fontVariantNumeric: "tabular-nums" }, children: it.qty })
    ] }, i))),
    tab === "steps" && (steps.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$5, fontSize: 12, color: "rgba(35,60,0,0.35)", fontStyle: "italic", textAlign: "center", padding: 14 }, children: "No steps added." }) : steps.map((s, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      display: "flex",
      gap: 14,
      padding: "12px 0",
      alignItems: "flex-start",
      borderBottom: i === steps.length - 1 ? "none" : "1px dotted rgba(35,60,0,0.1)"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
        width: 28,
        height: 28,
        minWidth: 28,
        borderRadius: "50%",
        background: "rgba(35,60,0,0.06)",
        border: "1px solid rgba(35,60,0,0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: fontSans$5,
        fontSize: 11,
        fontWeight: 500,
        color: "rgba(35,60,0,0.45)"
      }, children: i + 1 }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontFamily: fontSans$5, fontSize: 14, color: C$5.text, lineHeight: 1.5, flex: 1, paddingTop: 3 }, children: s })
    ] }, i)))
  ] });
}
const C$4 = {
  bg: "#FAF7F2",
  inputBg: "rgba(35,60,0,0.05)",
  inputBorder: "rgba(35,60,0,0.1)",
  green: "#233C00",
  cream: "#FAF7F2",
  muted: "rgba(35,60,0,0.35)",
  mutedText: "rgba(35,60,0,0.6)",
  arrow: "rgba(35,60,0,0.6)"
};
const fontDisplay = "Inter, sans-serif";
const fontSans$4 = "Inter, sans-serif";
function NewCategory({ back, onSaved, editKey, onEditSaved, onDeleted }) {
  const isEdit = !!editKey;
  const [name, setName] = reactExports.useState("");
  const [nameErr, setNameErr] = reactExports.useState(false);
  const [gradientIdx, setGradientIdx] = reactExports.useState(0);
  const [showDelete, setShowDelete] = reactExports.useState(false);
  const [loading, setLoading] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (isEdit && editKey) {
      const loadExisting = async () => {
        const existing = await findCustomCategory(editKey);
        if (existing) {
          setName(existing.label);
          const idx = Math.max(0, categories.findIndex((c) => c.gradient === existing.gradient));
          setGradientIdx(idx);
        }
      };
      loadExisting();
    }
  }, [isEdit, editKey]);
  const trySave = async () => {
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    setLoading(true);
    try {
      const trimmed = name.trim();
      const gradient = categories[gradientIdx].gradient;
      if (isEdit && editKey) {
        await updateCustomCategory(editKey, trimmed, gradient);
        onEditSaved?.(trimmed);
      } else {
        const cat = await saveCustomCategory(trimmed, gradient);
        onSaved(cat);
      }
    } catch (error) {
      console.error("Error saving category:", error);
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: C$4.bg }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      background: C$4.bg,
      padding: "0 20px",
      height: 52,
      display: "flex",
      alignItems: "center",
      flexShrink: 0
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: back, "aria-label": "Back", style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: C$4.arrow,
      display: "flex",
      alignItems: "center",
      padding: 0
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19 12H5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 19l-7-7 7-7" })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1, overflowY: "auto", padding: "20px 16px 28px", display: "flex", flexDirection: "column" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Eyebrow, { children: isEdit ? "Edit category" : "New category" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Title, { children: isEdit ? "Edit your category" : "Create a category" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Sub, { children: isEdit ? "Update the name or style." : "Give it a name and pick a style." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginBottom: 18 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label$3, { children: "Category name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(NameInput$1, { value: name, onChange: (v) => {
          setName(v);
          if (v.trim()) setNameErr(false);
        }, onEnter: trySave, placeholder: "e.g. French, BBQ, Pasta" }),
        nameErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg$3, { children: "Please give your category a name." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginBottom: 18 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Label$3, { children: "Choose a style" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }, children: categories.map((c, i) => {
          const selected = i === gradientIdx;
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setGradientIdx(i),
              "aria-label": `Style ${i + 1}`,
              style: {
                width: "100%",
                aspectRatio: "1 / 1",
                borderRadius: 12,
                cursor: "pointer",
                padding: 0,
                background: c.gradient,
                border: selected ? `2px solid ${C$4.green}` : "2px solid transparent",
                boxSizing: "border-box"
              }
            },
            c.key
          );
        }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: trySave, style: {
        width: "100%",
        background: C$4.green,
        color: C$4.cream,
        border: "none",
        borderRadius: 14,
        padding: "14px",
        fontFamily: fontSans$4,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: "pointer",
        marginTop: 8
      }, children: isEdit ? "Save changes" : "Save category" }),
      isEdit && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setShowDelete(true), style: {
        width: "100%",
        background: "transparent",
        color: "#B85C5C",
        border: "none",
        padding: "12px",
        fontFamily: fontSans$4,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: "pointer",
        marginTop: 4
      }, children: "Delete category" })
    ] }),
    isEdit && showDelete && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        onClick: () => setShowDelete(false),
        style: {
          position: "absolute",
          inset: 0,
          background: "rgba(35,60,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          padding: 24
        },
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              background: C$4.bg,
              borderRadius: 16,
              padding: "24px 20px",
              width: "100%",
              maxWidth: 280,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              border: `1px solid ${C$4.inputBorder}`
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontDisplay, fontSize: 24, color: C$4.green, fontWeight: 400, textAlign: "center", textTransform: "uppercase", lineHeight: 1.2 }, children: "Delete this category?" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$4, fontSize: 13, color: C$4.mutedText, textAlign: "center", marginBottom: 12 }, children: "This will also remove all recipes saved to this category. This can't be undone." }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setShowDelete(false),
                  style: {
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    background: "transparent",
                    border: `1px solid ${C$4.inputBorder}`,
                    color: C$4.green,
                    fontFamily: fontSans$4,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer"
                  },
                  children: "Cancel"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: async () => {
                    if (editKey) {
                      setLoading(true);
                      try {
                        await deleteCustomCategory(editKey);
                        setShowDelete(false);
                        onDeleted?.();
                      } catch (error) {
                        console.error("Error deleting category:", error);
                      } finally {
                        setLoading(false);
                      }
                    }
                  },
                  style: {
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    background: "#B85C5C",
                    border: "none",
                    color: "#FAF7F2",
                    fontFamily: fontSans$4,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer"
                  },
                  children: "Delete"
                }
              )
            ]
          }
        )
      }
    )
  ] });
}
function Eyebrow({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$4, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C$4.muted, marginBottom: 6, fontWeight: 500 }, children });
}
function Title({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontDisplay, fontSize: 28, fontWeight: 400, color: C$4.green, marginBottom: 8, lineHeight: 1.1, textTransform: "uppercase" }, children });
}
function Sub({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$4, fontSize: 13, color: C$4.mutedText, lineHeight: 1.5, marginBottom: 20 }, children });
}
function Label$3({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("label", { style: { display: "block", fontFamily: fontSans$4, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C$4.muted, marginBottom: 8, fontWeight: 500 }, children });
}
function ValMsg$3({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: fontSans$4, fontSize: 11, color: "#B85C5C", marginTop: 5 }, children });
}
const inputStyleBase$3 = {
  width: "100%",
  background: C$4.inputBg,
  border: `1px solid ${C$4.inputBorder}`,
  borderRadius: 10,
  padding: "14px 16px",
  fontFamily: fontSans$4,
  fontSize: 15,
  color: C$4.green,
  fontWeight: 400,
  outline: "none",
  WebkitAppearance: "none"
};
function NameInput$1({ value, onChange, placeholder, onEnter }) {
  const onKey = (e) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      type: "text",
      value,
      onChange: (e) => onChange(e.target.value),
      onKeyDown: onKey,
      placeholder,
      style: inputStyleBase$3
    }
  );
}
const btnStyle$2 = {
  background: "#233C00",
  color: "#FAF7F2",
  border: "none",
  borderRadius: 14,
  padding: "14px 0",
  fontFamily: "'Inter', sans-serif",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  width: "100%",
  cursor: "pointer",
  flexShrink: 0
};
function QuestionScreen({
  question,
  hint,
  field,
  onUpdate,
  onNext
}) {
  const [val, setVal] = reactExports.useState("");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", padding: "44px 24px 28px" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { marginBottom: 14 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#233C00", textTransform: "uppercase", lineHeight: 1.3, marginBottom: 8 }, children: question }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: "'Fraunces', serif", fontSize: 12, color: "rgba(35,60,0,0.55)", fontWeight: 300, fontStyle: "italic", lineHeight: 1.5 }, children: hint })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "textarea",
      {
        value: val,
        onChange: (e) => setVal(e.target.value),
        placeholder: "Type here...",
        style: {
          height: "40%",
          width: "100%",
          background: "rgba(35,60,0,0.05)",
          border: "1px solid rgba(35,60,0,0.1)",
          borderRadius: 12,
          padding: "12px 14px",
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: "#233C00",
          resize: "none",
          lineHeight: 1.6,
          marginBottom: 16,
          outline: "none"
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 } }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        style: btnStyle$2,
        onClick: async () => {
          await onUpdate({ [field]: val });
          setVal("");
          onNext();
        },
        children: "Continue"
      }
    )
  ] });
}
function Loader({ onUpdate, onDone }) {
  reactExports.useEffect(() => {
    const t = setTimeout(async () => {
      await onUpdate({ onboarding_complete: true });
      onDone();
    }, 2500);
    return () => clearTimeout(t);
  }, [onDone, onUpdate]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center", gap: 28, padding: 32 }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `@keyframes tipsyPulse {0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.08);opacity:1}}` }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      width: 96,
      height: 96,
      background: "rgba(35,60,0,0.1)",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      animation: "tipsyPulse 2.4s ease-in-out infinite"
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "44", height: "44", viewBox: "0 0 24 24", fill: "none", stroke: "#233C00", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6 13.5c-1.66 0-3-1.34-3-3 0-1.5 1.1-2.74 2.55-2.96A3.5 3.5 0 0 1 12 6a3.5 3.5 0 0 1 6.45 1.54A3 3 0 0 1 21 10.5c0 1.66-1.34 3-3 3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6 13.5h12V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5.5z" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M9 17h.01M12 17h.01M15 17h.01" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(35,60,0,0.45)", letterSpacing: "0.06em", textAlign: "center" }, children: "Setting up your kitchen..." })
  ] });
}
function Onboarding({ onComplete, profile, onUpdate }) {
  const [step, setStep] = reactExports.useState(1);
  const [transition, setTransition] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      input::placeholder, textarea::placeholder {
        color: rgba(35,60,0,0.3);
        opacity: 1;
      }
      input:focus {
        border-bottom-color: #233C00 !important;
      }
      textarea:focus {
        border-color: #233C00 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  const next = () => {
    setStep((s) => {
      const to = s + 1;
      setTransition({ from: s, to });
      return to;
    });
  };
  const renderStep = (s) => {
    if (s === 1) return /* @__PURE__ */ jsxRuntimeExports.jsx(QuestionScreen, { label: "Taste", question: "Your palate", hint: "Cuisines, flavors, techniques — what makes your cooking yours?", field: "palate", onUpdate, onNext: next }, "s1");
    if (s === 2) return /* @__PURE__ */ jsxRuntimeExports.jsx(QuestionScreen, { label: "Inspiration", question: "Your inspiration", hint: "Sites, accounts, chefs, cookbooks — who shapes how you cook?", field: "inspiration", onUpdate, onNext: next }, "s2");
    if (s === 3) return /* @__PURE__ */ jsxRuntimeExports.jsx(QuestionScreen, { label: "Constraints", question: "Your no-gos", hint: "Allergies, aversions, or anything that never makes your plate?", field: "constraints", onUpdate, onNext: next }, "s3");
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Loader, { onUpdate, onDone: onComplete }, "s4");
  };
  const DURATION2 = 280;
  const EASE2 = "cubic-bezier(0.22, 1, 0.36, 1)";
  const transKey = transition ? `${transition.from}->${transition.to}` : null;
  const [armedKey, setArmedKey] = reactExports.useState(null);
  const phase = transKey && armedKey !== transKey ? "start" : "end";
  reactExports.useEffect(() => {
    if (!transKey) return;
    if (armedKey === transKey) return;
    let r2 = 0;
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      r2 = requestAnimationFrame(() => {
        if (!cancelled) setArmedKey(transKey);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [transKey, armedKey]);
  reactExports.useEffect(() => {
    if (!transition) return;
    if (phase !== "end") return;
    const t = setTimeout(() => {
      setTransition(null);
      setArmedKey(null);
    }, DURATION2 + 20);
    return () => clearTimeout(t);
  }, [phase, transition]);
  const layerBase = {
    position: "absolute",
    inset: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#FAF7F2",
    willChange: "transform"
  };
  if (!transition) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { ...layerBase, position: "relative" }, children: renderStep(step) });
  }
  const fromTransform = phase === "start" ? "translateX(0)" : "translateX(-25%)";
  const toTransform = phase === "start" ? "translateX(100%)" : "translateX(0)";
  const transitionStyle = phase === "start" ? "none" : `transform ${DURATION2}ms ${EASE2}`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#FAF7F2" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { ...layerBase, transform: fromTransform, transition: transitionStyle, zIndex: 1, pointerEvents: "none" }, children: renderStep(transition.from) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { ...layerBase, transform: toTransform, transition: transitionStyle, zIndex: 2, pointerEvents: "none" }, children: renderStep(transition.to) })
  ] });
}
const KEYS = {
  name: "tipsyDinnerName",
  email: "tipsyDinnerEmail",
  palate: "tipsyDinnerPalate",
  inspiration: "tipsyDinnerInspiration",
  table: "tipsyDinnerTable",
  constraints: "tipsyDinnerConstraints"
};
function read(k) {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
}
function getInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function Avatar({ size = 28, onClick }) {
  const initials = getInitials(read(KEYS.name));
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      onClick,
      style: {
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#233C00",
        color: "#FAF7F2",
        border: "none",
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
        fontWeight: 500,
        padding: 0,
        lineHeight: 1
      },
      children: initials
    }
  );
}
const sectionLabel = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(35,60,0,0.35)",
  padding: "16px 20px 8px"
};
const rowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "transparent",
  padding: "14px 20px",
  borderBottom: "1px solid rgba(35,60,0,0.06)",
  cursor: "pointer",
  border: "none",
  width: "100%",
  textAlign: "left"
};
const titleStyle = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 15,
  fontWeight: 500,
  color: "#233C00"
};
const subStyle = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  fontWeight: 400,
  color: "rgba(35,60,0,0.45)",
  marginTop: 2
};
const chevStyle = {
  color: "rgba(35,60,0,0.2)",
  fontSize: 18,
  fontFamily: "'Inter', sans-serif"
};
function trim30(s) {
  if (!s) return "—";
  return s.length > 30 ? s.slice(0, 30) + "…" : s;
}
function Row({ title, subtitle, onClick }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { style: rowStyle, onClick, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: titleStyle, children: title }),
      subtitle !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: subStyle, children: subtitle })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: chevStyle, children: "›" })
  ] });
}
const FIELD_META = {
  name: { label: "Name", multiline: false },
  email: { label: "Email", multiline: false },
  palate: { label: "Your palate", multiline: true },
  inspiration: { label: "Inspiration", multiline: true },
  table: { label: "Your table", multiline: true },
  constraints: { label: "Constraints", multiline: true }
};
function Profile({ back, openEdit, isTabRoot = false, onSignOut, profile, onUpdate }) {
  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Sign out error:", error);
        return;
      }
      onSignOut();
    } catch (err) {
      console.error("Unexpected sign out error:", err);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      display: "grid",
      gridTemplateColumns: "44px 1fr 44px",
      alignItems: "center",
      padding: "20px 16px 14px"
    }, children: [
      !isTabRoot ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: back, style: { background: "none", border: "none", cursor: "pointer", color: "rgba(35,60,0,0.6)", fontSize: 22, padding: 0, textAlign: "left" }, children: "‹" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: "#233C00" }, children: "Profile" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", justifyContent: "flex-end" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Avatar, {}) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1, overflowY: "auto" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: sectionLabel, children: "Account" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { title: "Name", subtitle: profile?.display_name || read(KEYS.name) || "—", onClick: () => openEdit("name") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { title: "Email", subtitle: read(KEYS.email) || "—", onClick: () => openEdit("email") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: sectionLabel, children: "Your Kitchen" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { title: "Your palate", subtitle: trim30(profile?.palate || ""), onClick: () => openEdit("palate") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { title: "Inspiration", subtitle: trim30(profile?.inspiration || ""), onClick: () => openEdit("inspiration") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { title: "Constraints", subtitle: trim30(profile?.constraints || ""), onClick: () => openEdit("constraints") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: sectionLabel, children: "Support" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { title: "Sign Out", onClick: handleSignOut }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Row, { title: "Contact us" })
    ] })
  ] });
}
function ProfileEdit({ fieldKey, back, profile, onUpdate }) {
  const meta = FIELD_META[fieldKey];
  const storageKey = KEYS[fieldKey];
  const getInitialValue = () => {
    if (fieldKey === "name") return profile?.display_name || read(storageKey);
    if (fieldKey === "palate") return profile?.palate || "";
    if (fieldKey === "inspiration") return profile?.inspiration || "";
    if (fieldKey === "constraints") return profile?.constraints || "";
    return read(storageKey);
  };
  const [val, setVal] = reactExports.useState(getInitialValue());
  const inputBase = {
    width: "100%",
    background: "rgba(35,60,0,0.05)",
    border: "1px solid rgba(35,60,0,0.12)",
    borderRadius: 12,
    padding: "12px 14px",
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    color: "#233C00",
    outline: "none",
    lineHeight: 1.6,
    boxSizing: "border-box"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      display: "grid",
      gridTemplateColumns: "44px 1fr 44px",
      alignItems: "center",
      padding: "20px 16px 14px"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: back, style: { background: "none", border: "none", cursor: "pointer", color: "rgba(35,60,0,0.6)", fontSize: 22, padding: 0, textAlign: "left" }, children: "‹" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: "#233C00" }, children: meta.label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", {})
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1, padding: "12px 24px 24px", display: "flex", flexDirection: "column" }, children: [
      meta.multiline ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "textarea",
        {
          value: val,
          onChange: (e) => setVal(e.target.value),
          style: { ...inputBase, height: "45%", resize: "none" }
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          value: val,
          onChange: (e) => setVal(e.target.value),
          type: fieldKey === "email" ? "email" : "text",
          style: inputBase
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1 } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: async () => {
            if (fieldKey === "name") {
              await onUpdate({ display_name: val });
            } else if (fieldKey === "palate" || fieldKey === "inspiration" || fieldKey === "constraints") {
              await onUpdate({ [fieldKey]: val });
            } else {
              try {
                localStorage.setItem(storageKey, val);
              } catch {
              }
            }
            back();
          },
          style: {
            background: "#233C00",
            color: "#FAF7F2",
            border: "none",
            borderRadius: 100,
            padding: "14px 0",
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            width: "100%",
            cursor: "pointer"
          },
          children: "Save"
        }
      )
    ] })
  ] });
}
const C$3 = {
  bg: "#FAF7F2",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  textLight: "rgba(35,60,0,0.6)",
  iconColor: "rgba(35,60,0,0.35)",
  divider: "rgba(35,60,0,0.06)",
  actionIcon: "rgba(35,60,0,0.2)",
  plusBorder: "rgba(35,60,0,0.2)",
  accentBg: "rgba(35,60,0,0.06)",
  borderLight: "rgba(35,60,0,0.08)",
  border: "rgba(35,60,0,0.1)",
  midBlue: "#233C00",
  btnBlue: "#233C00",
  muted: "rgba(35,60,0,0.3)",
  navy: "#233C00"
};
const fontSerif$2 = "'Fraunces', serif";
const fontSans$3 = "'Inter', sans-serif";
const ICON_OPTIONS$1 = [
  { name: "IconChefHat", component: IconChefHat },
  { name: "IconCandle", component: IconCandle },
  { name: "IconGrill", component: IconGrill },
  { name: "IconCake", component: IconCake },
  { name: "IconGlassFull", component: IconGlassFull },
  { name: "IconHeart", component: IconHeart },
  { name: "IconStar", component: IconStar },
  { name: "IconSun", component: IconSun },
  { name: "IconMoon", component: IconMoon },
  { name: "IconSnowflake", component: IconSnowflake },
  { name: "IconFlame", component: IconFlame },
  { name: "IconLeaf", component: IconLeaf },
  { name: "IconToolsKitchen2", component: IconToolsKitchen2 },
  { name: "IconBowlSpoon", component: IconBowlSpoon },
  { name: "IconPizza", component: IconPizza }
];
function assignIcon(name) {
  const lower = name.toLowerCase();
  if (lower.includes("christmas") || lower.includes("holiday")) return "IconSnowflake";
  if (lower.includes("birthday") || lower.includes("celebration")) return "IconCake";
  if (lower.includes("bbq") || lower.includes("grill") || lower.includes("summer")) return "IconGrill";
  if (lower.includes("dinner") || lower.includes("party")) return "IconCandle";
  if (lower.includes("brunch") || lower.includes("breakfast")) return "IconSun";
  if (lower.includes("romantic") || lower.includes("date") || lower.includes("valentine")) return "IconHeart";
  if (lower.includes("thanksgiving") || lower.includes("fall")) return "IconLeaf";
  if (lower.includes("cocktail") || lower.includes("drinks")) return "IconGlassFull";
  if (lower.includes("pizza")) return "IconPizza";
  if (lower.includes("special") || lower.includes("fancy")) return "IconStar";
  return "IconChefHat";
}
function getIconComponent$1(iconName) {
  return ICON_OPTIONS$1.find((opt) => opt.name === iconName)?.component ?? IconChefHat;
}
function Occasions({ back, push, isTabRoot = false }) {
  const [state, setState] = reactExports.useState({
    occasions: [],
    menuCounts: {},
    loading: true
  });
  const [showCreate, setShowCreate] = reactExports.useState(false);
  const [editingOccasion, setEditingOccasion] = reactExports.useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = reactExports.useState(null);
  reactExports.useEffect(() => {
    let ignore = false;
    async function initialLoad() {
      const loaded = await loadOccasions();
      if (ignore) return;
      const counts = {};
      await Promise.all(
        loaded.map(async (occasion) => {
          const menus = await getMenusForOccasion(occasion.id);
          counts[occasion.id] = menus.length;
        })
      );
      if (ignore) return;
      setState({
        occasions: loaded,
        menuCounts: counts,
        loading: false
      });
    }
    initialLoad();
    return () => {
      ignore = true;
    };
  }, []);
  const refreshOccasions = async () => {
    const loaded = await loadOccasions();
    const counts = {};
    await Promise.all(
      loaded.map(async (occasion) => {
        const menus = await getMenusForOccasion(occasion.id);
        counts[occasion.id] = menus.length;
      })
    );
    setState((prev) => ({
      ...prev,
      occasions: loaded,
      menuCounts: counts
    }));
  };
  if (state.loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2", alignItems: "center", justifyContent: "center" } });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      padding: "16px 24px",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      position: "relative",
      zIndex: 1
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
        fontFamily: fontSans$3,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: C$3.text
      }, children: "Menus" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => setShowCreate(true),
          "aria-label": "New occasion",
          style: {
            width: 32,
            height: 32,
            background: "transparent",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            border: `1px solid ${C$3.plusBorder}`,
            color: C$3.textLight,
            flexShrink: 0
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 5v14" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 12h14" })
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, overflowY: "auto", padding: "8px 20px 16px", position: "relative", zIndex: 1 }, children: state.occasions.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px"
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: {
      fontFamily: fontSerif$2,
      fontStyle: "italic",
      fontSize: 14,
      color: C$3.textLight,
      margin: 0,
      textAlign: "center"
    }, children: "Create your first occasion to start building menus." }) }) : state.occasions.map((occasion, index) => {
      const IconComponent = getIconComponent$1(occasion.icon);
      const menuCount = state.menuCounts[occasion.id] || 0;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          style: {
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "18px 4px",
            borderBottom: index === state.occasions.length - 1 ? "none" : `1px solid ${C$3.divider}`
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconComponent, { size: 22, color: C$3.iconColor, strokeWidth: 1.5 }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => push(occasion),
                style: {
                  flex: 1,
                  minWidth: 0,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2
                },
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                    fontFamily: fontSans$3,
                    fontSize: 16,
                    fontWeight: 500,
                    color: C$3.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }, children: occasion.name }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
                    fontFamily: fontSans$3,
                    fontSize: 12,
                    color: C$3.textMuted
                  }, children: [
                    menuCount,
                    " ",
                    menuCount === 1 ? "menu" : "menus"
                  ] })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 14 }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setEditingOccasion(occasion),
                  "aria-label": "Edit occasion",
                  style: {
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: C$3.actionIcon,
                    flexShrink: 0
                  },
                  children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" })
                  ] })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setConfirmDeleteId(occasion.id),
                  "aria-label": "Delete occasion",
                  style: {
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: C$3.actionIcon,
                    flexShrink: 0
                  },
                  children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "3 6 5 6 21 6" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 11v6M14 11v6" })
                  ] })
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => push(occasion),
                style: {
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: C$3.actionIcon,
                  flexShrink: 0
                },
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "9 18 15 12 9 6" }) })
              }
            )
          ]
        },
        occasion.id
      );
    }) }),
    showCreate && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CreateOccasionSheet,
      {
        onClose: () => setShowCreate(false),
        onSaved: (occasion) => {
          setShowCreate(false);
          refreshOccasions();
          push(occasion);
        }
      }
    ),
    editingOccasion && /* @__PURE__ */ jsxRuntimeExports.jsx(
      EditOccasionSheet$1,
      {
        occasion: editingOccasion,
        onClose: () => setEditingOccasion(null),
        onSaved: () => {
          setEditingOccasion(null);
          refreshOccasions();
        },
        onDeleted: () => {
          setEditingOccasion(null);
          refreshOccasions();
        }
      }
    ),
    confirmDeleteId && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        onClick: () => setConfirmDeleteId(null),
        style: {
          position: "absolute",
          inset: 0,
          background: "rgba(35,60,0,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 20,
          padding: 24
        },
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              background: C$3.bg,
              borderRadius: 16,
              padding: "24px 20px",
              width: "100%",
              maxWidth: 280,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              border: `0.5px solid ${C$3.border}`
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSerif$2,
                fontSize: 20,
                color: C$3.navy,
                fontWeight: 400,
                textAlign: "center"
              }, children: "Delete this occasion?" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSans$3,
                fontSize: 13,
                color: C$3.midBlue,
                textAlign: "center",
                marginBottom: 12
              }, children: "This will also remove all menus for this occasion. This can't be undone." }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setConfirmDeleteId(null),
                  style: {
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    background: "transparent",
                    border: `0.5px solid ${C$3.border}`,
                    color: C$3.midBlue,
                    fontFamily: fontSans$3,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer"
                  },
                  children: "Cancel"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: async () => {
                    await deleteOccasion(confirmDeleteId);
                    setConfirmDeleteId(null);
                    refreshOccasions();
                  },
                  style: {
                    width: "100%",
                    padding: "12px",
                    borderRadius: 10,
                    background: "#B85C5C",
                    border: "none",
                    color: C$3.bg,
                    fontFamily: fontSans$3,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer"
                  },
                  children: "Delete"
                }
              )
            ]
          }
        )
      }
    )
  ] });
}
function CreateOccasionSheet({
  onClose,
  onSaved
}) {
  const [name, setName] = reactExports.useState("");
  const [nameErr, setNameErr] = reactExports.useState(false);
  const [selectedIcon, setSelectedIcon] = reactExports.useState("IconChefHat");
  const [sheetPhase, setSheetPhase] = reactExports.useState("entering");
  const handleNameChange = (value) => {
    setName(value);
    if (value.trim()) {
      setNameErr(false);
      const assigned = assignIcon(value);
      setSelectedIcon(assigned);
    }
  };
  const trySave = () => {
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    const occasion = saveOccasion(name.trim());
    onSaved(occasion);
  };
  reactExports.useState(() => {
    requestAnimationFrame(() => {
      setSheetPhase("entered");
    });
  });
  const SelectedIconComponent = getIconComponent$1(selectedIcon);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      onClick: onClose,
      style: {
        position: "absolute",
        inset: 0,
        background: "rgba(35,60,0,0.25)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 10,
        transition: sheetPhase === "entering" ? "none" : "opacity 250ms ease-out",
        opacity: sheetPhase === "entered" ? 1 : 0
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "100%",
            background: C$3.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: "24px 20px calc(80px + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxHeight: "80%",
            overflowY: "auto",
            transform: sheetPhase === "entered" ? "translateY(0)" : "translateY(100%)",
            transition: sheetPhase === "entering" ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSerif$2,
                fontSize: 20,
                fontWeight: 500,
                color: C$3.navy
              }, children: "New occasion" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onClose,
                  "aria-label": "Close",
                  style: {
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: C$3.muted,
                    padding: 0,
                    fontSize: 24,
                    lineHeight: 1
                  },
                  children: "×"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$2, { children: "Occasion name" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                NameInput,
                {
                  value: name,
                  onChange: handleNameChange,
                  onEnter: trySave,
                  placeholder: "e.g. Christmas Dinner, Birthday Party"
                }
              ),
              nameErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg$2, { children: "Please give your occasion a name." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$2, { children: "Icon" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                width: "100%",
                padding: "16px",
                background: C$3.accentBg,
                border: `1px solid ${C$3.borderLight}`,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: C$3.bg,
                border: `1px solid ${C$3.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectedIconComponent, { size: 28, color: C$3.midBlue }) }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$2, { children: "Choose an icon" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 8
              }, children: ICON_OPTIONS$1.map((opt) => {
                const IconComp = opt.component;
                const isSelected = selectedIcon === opt.name;
                return /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => setSelectedIcon(opt.name),
                    "aria-label": opt.name,
                    style: {
                      width: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: 10,
                      background: isSelected ? C$3.accentBg : C$3.bg,
                      border: isSelected ? `2px solid ${C$3.btnBlue}` : `1px solid ${C$3.borderLight}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0
                    },
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconComp, { size: 22, color: C$3.midBlue })
                  },
                  opt.name
                );
              }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: trySave,
                style: {
                  width: "100%",
                  background: C$3.btnBlue,
                  color: C$3.bg,
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: fontSans$3,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  marginTop: 4
                },
                children: "Save occasion"
              }
            )
          ]
        }
      )
    }
  );
}
function EditOccasionSheet$1({
  occasion,
  onClose,
  onSaved,
  onDeleted
}) {
  const [name, setName] = reactExports.useState(occasion.name);
  const [nameErr, setNameErr] = reactExports.useState(false);
  const [selectedIcon, setSelectedIcon] = reactExports.useState(occasion.icon);
  const [sheetPhase, setSheetPhase] = reactExports.useState("entering");
  const [showDelete, setShowDelete] = reactExports.useState(false);
  const trySave = () => {
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    updateOccasion(occasion.id, { name: name.trim(), icon: selectedIcon });
    onSaved();
  };
  const tryDelete = () => {
    deleteOccasion(occasion.id);
    onDeleted();
  };
  reactExports.useState(() => {
    requestAnimationFrame(() => {
      setSheetPhase("entered");
    });
  });
  const SelectedIconComponent = getIconComponent$1(selectedIcon);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      onClick: onClose,
      style: {
        position: "absolute",
        inset: 0,
        background: "rgba(35,60,0,0.25)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 10,
        transition: sheetPhase === "entering" ? "none" : "opacity 250ms ease-out",
        opacity: sheetPhase === "entered" ? 1 : 0
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "100%",
            background: C$3.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: "24px 20px calc(80px + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxHeight: "80%",
            overflowY: "auto",
            transform: sheetPhase === "entered" ? "translateY(0)" : "translateY(100%)",
            transition: sheetPhase === "entering" ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSerif$2,
                fontSize: 20,
                fontWeight: 500,
                color: C$3.navy
              }, children: "Edit occasion" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onClose,
                  "aria-label": "Close",
                  style: {
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: C$3.muted,
                    padding: 0,
                    fontSize: 24,
                    lineHeight: 1
                  },
                  children: "×"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$2, { children: "Occasion name" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                NameInput,
                {
                  value: name,
                  onChange: (v) => {
                    setName(v);
                    if (v.trim()) setNameErr(false);
                  },
                  onEnter: trySave,
                  placeholder: "e.g. Christmas Dinner, Birthday Party"
                }
              ),
              nameErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg$2, { children: "Please give your occasion a name." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$2, { children: "Icon" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                width: "100%",
                padding: "16px",
                background: C$3.accentBg,
                border: `1px solid ${C$3.borderLight}`,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: C$3.bg,
                border: `1px solid ${C$3.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectedIconComponent, { size: 28, color: C$3.midBlue }) }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$2, { children: "Choose an icon" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 8
              }, children: ICON_OPTIONS$1.map((opt) => {
                const IconComp = opt.component;
                const isSelected = selectedIcon === opt.name;
                return /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => setSelectedIcon(opt.name),
                    "aria-label": opt.name,
                    style: {
                      width: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: 10,
                      background: isSelected ? C$3.accentBg : C$3.bg,
                      border: isSelected ? `2px solid ${C$3.btnBlue}` : `1px solid ${C$3.borderLight}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0
                    },
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconComp, { size: 22, color: C$3.midBlue })
                  },
                  opt.name
                );
              }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: trySave,
                style: {
                  width: "100%",
                  background: C$3.btnBlue,
                  color: C$3.bg,
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: fontSans$3,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  marginTop: 4
                },
                children: "Save changes"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => setShowDelete(true),
                style: {
                  width: "100%",
                  background: "transparent",
                  color: "#B85C5C",
                  border: "none",
                  padding: "12px",
                  fontFamily: fontSans$3,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer"
                },
                children: "Delete occasion"
              }
            ),
            showDelete && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                onClick: () => setShowDelete(false),
                style: {
                  position: "fixed",
                  inset: 0,
                  background: "rgba(35,60,0,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 20,
                  padding: 24
                },
                children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "div",
                  {
                    onClick: (e) => e.stopPropagation(),
                    style: {
                      background: C$3.bg,
                      borderRadius: 16,
                      padding: "24px 20px",
                      width: "100%",
                      maxWidth: 280,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      border: `0.5px solid ${C$3.border}`
                    },
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                        fontFamily: fontSerif$2,
                        fontSize: 20,
                        color: C$3.navy,
                        fontWeight: 400,
                        textAlign: "center"
                      }, children: "Delete this occasion?" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                        fontFamily: fontSans$3,
                        fontSize: 13,
                        color: C$3.midBlue,
                        textAlign: "center",
                        marginBottom: 12
                      }, children: "This will also remove all menus for this occasion. This can't be undone." }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          onClick: () => setShowDelete(false),
                          style: {
                            width: "100%",
                            padding: "12px",
                            borderRadius: 10,
                            background: "transparent",
                            border: `0.5px solid ${C$3.border}`,
                            color: C$3.midBlue,
                            fontFamily: fontSans$3,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: "pointer"
                          },
                          children: "Cancel"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          onClick: tryDelete,
                          style: {
                            width: "100%",
                            padding: "12px",
                            borderRadius: 10,
                            background: "#B85C5C",
                            border: "none",
                            color: C$3.bg,
                            fontFamily: fontSans$3,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: "pointer"
                          },
                          children: "Delete"
                        }
                      )
                    ]
                  }
                )
              }
            )
          ]
        }
      )
    }
  );
}
function Label$2({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("label", { style: {
    display: "block",
    fontFamily: fontSans$3,
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: C$3.muted,
    marginBottom: 8
  }, children });
}
function ValMsg$2({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
    fontFamily: fontSans$3,
    fontSize: 11,
    color: "#c0392b",
    marginTop: 5
  }, children });
}
const inputStyleBase$2 = {
  width: "100%",
  background: C$3.white,
  border: `1px solid ${C$3.borderLight}`,
  borderRadius: 10,
  padding: "11px 14px",
  fontFamily: fontSans$3,
  fontSize: 13,
  color: C$3.navy,
  outline: "none",
  WebkitAppearance: "none"
};
function NameInput({
  value,
  onChange,
  placeholder,
  onEnter
}) {
  const [focused, setFocused] = reactExports.useState(false);
  const onKey = (e) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      type: "text",
      value,
      onChange: (e) => onChange(e.target.value),
      onKeyDown: onKey,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      placeholder,
      style: {
        ...inputStyleBase$2,
        borderColor: focused ? C$3.border : C$3.borderLight,
        boxShadow: focused ? "0 0 0 3px rgba(133,183,235,0.18)" : "none"
      }
    }
  );
}
const C$2 = {
  bg: "#FAF7F2",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  textLight: "rgba(35,60,0,0.6)",
  cardBg: "rgba(35,60,0,0.05)",
  cardBorder: "rgba(35,60,0,0.1)",
  photoBg: "rgba(35,60,0,0.06)",
  photoLabel: "rgba(35,60,0,0.25)",
  descText: "rgba(35,60,0,0.45)",
  actionIcon: "rgba(35,60,0,0.2)",
  plusBorder: "rgba(35,60,0,0.2)",
  accentBg: "rgba(35,60,0,0.06)",
  borderLight: "rgba(35,60,0,0.08)",
  border: "rgba(35,60,0,0.1)",
  midBlue: "#233C00",
  btnBlue: "#233C00",
  muted: "rgba(35,60,0,0.3)",
  navy: "#233C00"
};
const fontSerif$1 = "'Fraunces', serif";
const fontSans$2 = "'Inter', sans-serif";
const ICON_OPTIONS = [
  { name: "IconChefHat", component: IconChefHat },
  { name: "IconCandle", component: IconCandle },
  { name: "IconGrill", component: IconGrill },
  { name: "IconCake", component: IconCake },
  { name: "IconGlassFull", component: IconGlassFull },
  { name: "IconHeart", component: IconHeart },
  { name: "IconStar", component: IconStar },
  { name: "IconSun", component: IconSun },
  { name: "IconMoon", component: IconMoon },
  { name: "IconSnowflake", component: IconSnowflake },
  { name: "IconFlame", component: IconFlame },
  { name: "IconLeaf", component: IconLeaf },
  { name: "IconToolsKitchen2", component: IconToolsKitchen2 },
  { name: "IconBowlSpoon", component: IconBowlSpoon },
  { name: "IconPizza", component: IconPizza }
];
function getIconComponent(iconName) {
  return ICON_OPTIONS.find((opt) => opt.name === iconName)?.component ?? IconChefHat;
}
function Menus({ occasionId, occasionName, back, push }) {
  const [state, setState] = reactExports.useState({
    menus: [],
    occasion: null,
    loading: true
  });
  const [showCreate, setShowCreate] = reactExports.useState(false);
  const [editingMenu, setEditingMenu] = reactExports.useState(null);
  const [editingOccasion, setEditingOccasion] = reactExports.useState(false);
  reactExports.useEffect(() => {
    setState({ menus: [], occasion: null, loading: true });
  }, [occasionId]);
  reactExports.useEffect(() => {
    let ignore = false;
    async function initialLoad() {
      const [loadedMenus, loadedOccasion] = await Promise.all([
        getMenusForOccasion(occasionId),
        findOccasion(occasionId)
      ]);
      if (ignore) return;
      setState({
        menus: loadedMenus,
        occasion: loadedOccasion,
        loading: false
      });
    }
    initialLoad();
    return () => {
      ignore = true;
    };
  }, [occasionId]);
  const refreshMenus = async () => {
    const loaded = await getMenusForOccasion(occasionId);
    setState((prev) => ({
      ...prev,
      menus: loaded
    }));
  };
  if (state.loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2", alignItems: "center", justifyContent: "center" } });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      padding: "16px 24px",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: back,
            "aria-label": "Back",
            style: {
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: C$2.textLight,
              display: "flex",
              alignItems: "center"
            },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "15 18 9 12 15 6" }) })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 1 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
            fontFamily: fontSans$2,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: C$2.text
          }, children: occasionName }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
            fontFamily: fontSans$2,
            fontSize: 11,
            color: C$2.textMuted
          }, children: [
            state.menus.length,
            " ",
            state.menus.length === 1 ? "menu" : "menus"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => setShowCreate(true),
          "aria-label": "New menu",
          style: {
            width: 32,
            height: 32,
            background: "transparent",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            border: `1px solid ${C$2.plusBorder}`,
            color: C$2.textLight,
            flexShrink: 0
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 5v14" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 12h14" })
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, overflowY: "auto", padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 12 }, children: state.menus.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px"
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: {
      fontFamily: fontSerif$1,
      fontStyle: "italic",
      fontSize: 14,
      color: C$2.textLight,
      margin: 0,
      textAlign: "center"
    }, children: "Create your first menu for this occasion." }) }) : state.menus.map((menu) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        style: {
          borderRadius: 16,
          overflow: "hidden",
          flexShrink: 0,
          background: C$2.cardBg,
          border: `1px solid ${C$2.cardBorder}`,
          cursor: "pointer"
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
            height: 130,
            background: C$2.photoBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
            fontFamily: fontSans$2,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: C$2.photoLabel
          }, children: "add a photo" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
            padding: "12px 16px 14px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => push(menu),
                style: {
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 3,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left"
                },
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                    fontFamily: fontSans$2,
                    fontSize: 15,
                    fontWeight: 500,
                    color: C$2.text,
                    width: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }, children: menu.title }),
                  menu.description && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                    fontFamily: fontSerif$1,
                    fontStyle: "italic",
                    fontWeight: 300,
                    fontSize: 13,
                    color: C$2.descText,
                    lineHeight: 1.4,
                    width: "100%",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden"
                  }, children: menu.description })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 14, flexShrink: 0, paddingTop: 2 }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setEditingMenu(menu),
                  "aria-label": "Edit menu",
                  style: {
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: C$2.actionIcon
                  },
                  children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" })
                  ] })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => {
                    if (window.confirm(`Delete ${menu.title}?`)) {
                      deleteMenu(menu.id);
                      refreshMenus();
                    }
                  },
                  "aria-label": "Delete menu",
                  style: {
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: C$2.actionIcon
                  },
                  children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "3 6 5 6 21 6" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 11v6M14 11v6" })
                  ] })
                }
              )
            ] })
          ] })
        ]
      },
      menu.id
    )) }),
    showCreate && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CreateMenuSheet,
      {
        occasionId,
        onClose: () => setShowCreate(false),
        onSaved: (menu) => {
          setShowCreate(false);
          refreshMenus();
          push(menu);
        }
      }
    ),
    editingMenu && /* @__PURE__ */ jsxRuntimeExports.jsx(
      EditMenuSheet$1,
      {
        menu: editingMenu,
        onClose: () => setEditingMenu(null),
        onSaved: () => {
          setEditingMenu(null);
          refreshMenus();
        },
        onDeleted: () => {
          setEditingMenu(null);
          refreshMenus();
        }
      }
    ),
    editingOccasion && state.occasion && /* @__PURE__ */ jsxRuntimeExports.jsx(
      EditOccasionSheet,
      {
        occasion: state.occasion,
        onClose: () => setEditingOccasion(false),
        onSaved: () => {
          setEditingOccasion(false);
        }
      }
    )
  ] });
}
const SECTION_OPTIONS$1 = [
  { key: "apps", label: "Apps" },
  { key: "mains", label: "Mains" },
  { key: "sides", label: "Sides" },
  { key: "desserts", label: "Desserts" },
  { key: "drinks", label: "Drinks" }
];
function CreateMenuSheet({
  occasionId,
  onClose,
  onSaved
}) {
  const [title, setTitle] = reactExports.useState("");
  const [titleErr, setTitleErr] = reactExports.useState(false);
  const [description, setDescription] = reactExports.useState("");
  const [enabledSections, setEnabledSections] = reactExports.useState([]);
  const [sheetPhase, setSheetPhase] = reactExports.useState("entering");
  const toggleSection = (section) => {
    if (enabledSections.includes(section)) {
      setEnabledSections(enabledSections.filter((s) => s !== section));
    } else {
      setEnabledSections([...enabledSections, section]);
    }
  };
  const trySave = async () => {
    if (!title.trim()) {
      setTitleErr(true);
      return;
    }
    try {
      const menu = await saveMenu(occasionId, title.trim(), description.trim(), enabledSections);
      onSaved(menu);
    } catch (err) {
      console.error("saveMenu failed:", err);
    }
  };
  reactExports.useState(() => {
    requestAnimationFrame(() => {
      setSheetPhase("entered");
    });
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      onClick: onClose,
      style: {
        position: "absolute",
        inset: 0,
        background: "rgba(35,60,0,0.25)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 10,
        transition: sheetPhase === "entering" ? "none" : "opacity 250ms ease-out",
        opacity: sheetPhase === "entered" ? 1 : 0
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "100%",
            background: C$2.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: "24px 20px calc(80px + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxHeight: "80%",
            overflowY: "auto",
            transform: sheetPhase === "entered" ? "translateY(0)" : "translateY(100%)",
            transition: sheetPhase === "entering" ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSerif$1,
                fontSize: 20,
                fontWeight: 500,
                color: C$2.navy
              }, children: "New menu" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onClose,
                  "aria-label": "Close",
                  style: {
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: C$2.muted,
                    padding: 0,
                    fontSize: 24,
                    lineHeight: 1
                  },
                  children: "×"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$1, { children: "Menu title" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                TextInput$1,
                {
                  value: title,
                  onChange: (v) => {
                    setTitle(v);
                    if (v.trim()) setTitleErr(false);
                  },
                  onEnter: trySave,
                  placeholder: "e.g. Christmas Eve Dinner"
                }
              ),
              titleErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg$1, { children: "Please give your menu a title." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$1, { children: "Description (optional)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                TextArea$1,
                {
                  value: description,
                  onChange: setDescription,
                  placeholder: "Add a note about this menu...",
                  rows: 3
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                background: C$2.bg,
                border: `1px solid ${C$2.borderLight}`,
                borderRadius: 12,
                overflow: "hidden"
              }, children: SECTION_OPTIONS$1.map((opt, idx) => {
                const isOn = enabledSections.includes(opt.key);
                return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    onClick: () => toggleSection(opt.key),
                    style: {
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      background: "transparent",
                      border: "none",
                      borderBottom: idx < SECTION_OPTIONS$1.length - 1 ? `0.5px solid ${C$2.borderLight}` : "none",
                      cursor: "pointer"
                    },
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                        fontFamily: fontSans$2,
                        fontSize: 13,
                        color: C$2.navy,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        fontWeight: 500
                      }, children: opt.label }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        background: isOn ? C$2.btnBlue : C$2.border,
                        position: "relative",
                        transition: "background 200ms ease",
                        flexShrink: 0
                      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: C$2.bg,
                        position: "absolute",
                        top: 2,
                        left: isOn ? 22 : 2,
                        transition: "left 200ms ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.12)"
                      } }) })
                    ]
                  },
                  opt.key
                );
              }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSans$2,
                fontSize: 11,
                color: C$2.muted,
                marginTop: 8,
                lineHeight: 1.4
              }, children: "Toggle on the sections you want in this menu. You can change this later." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: trySave,
                style: {
                  width: "100%",
                  background: C$2.btnBlue,
                  color: C$2.bg,
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: fontSans$2,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  marginTop: 4
                },
                children: "Save menu"
              }
            )
          ]
        }
      )
    }
  );
}
function EditMenuSheet$1({
  menu,
  onClose,
  onSaved,
  onDeleted
}) {
  const [title, setTitle] = reactExports.useState(menu.title);
  const [titleErr, setTitleErr] = reactExports.useState(false);
  const [description, setDescription] = reactExports.useState(menu.description);
  const [enabledSections, setEnabledSections] = reactExports.useState(menu.enabledSections);
  const [sheetPhase, setSheetPhase] = reactExports.useState("entering");
  const [showDelete, setShowDelete] = reactExports.useState(false);
  const toggleSection = (section) => {
    if (enabledSections.includes(section)) {
      setEnabledSections(enabledSections.filter((s) => s !== section));
    } else {
      setEnabledSections([...enabledSections, section]);
    }
  };
  const trySave = async () => {
    if (!title.trim()) {
      setTitleErr(true);
      return;
    }
    await updateMenu(menu.id, {
      title: title.trim(),
      description: description.trim(),
      enabledSections
    });
    onSaved();
  };
  const tryDelete = async () => {
    await deleteMenu(menu.id);
    onDeleted();
  };
  reactExports.useState(() => {
    requestAnimationFrame(() => {
      setSheetPhase("entered");
    });
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      onClick: onClose,
      style: {
        position: "absolute",
        inset: 0,
        background: "rgba(35,60,0,0.25)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 10,
        transition: sheetPhase === "entering" ? "none" : "opacity 250ms ease-out",
        opacity: sheetPhase === "entered" ? 1 : 0
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "100%",
            background: C$2.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: "24px 20px calc(80px + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxHeight: "80%",
            overflowY: "auto",
            transform: sheetPhase === "entered" ? "translateY(0)" : "translateY(100%)",
            transition: sheetPhase === "entering" ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSerif$1,
                fontSize: 20,
                fontWeight: 500,
                color: C$2.navy
              }, children: "Edit menu" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onClose,
                  "aria-label": "Close",
                  style: {
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: C$2.muted,
                    padding: 0,
                    fontSize: 24,
                    lineHeight: 1
                  },
                  children: "×"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$1, { children: "Menu title" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                TextInput$1,
                {
                  value: title,
                  onChange: (v) => {
                    setTitle(v);
                    if (v.trim()) setTitleErr(false);
                  },
                  onEnter: trySave,
                  placeholder: "e.g. Christmas Eve Dinner"
                }
              ),
              titleErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg$1, { children: "Please give your menu a title." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$1, { children: "Description (optional)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                TextArea$1,
                {
                  value: description,
                  onChange: setDescription,
                  placeholder: "Add a note about this menu...",
                  rows: 3
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                background: C$2.bg,
                border: `1px solid ${C$2.borderLight}`,
                borderRadius: 12,
                overflow: "hidden"
              }, children: SECTION_OPTIONS$1.map((opt, idx) => {
                const isOn = enabledSections.includes(opt.key);
                return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    onClick: () => toggleSection(opt.key),
                    style: {
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      background: "transparent",
                      border: "none",
                      borderBottom: idx < SECTION_OPTIONS$1.length - 1 ? `0.5px solid ${C$2.borderLight}` : "none",
                      cursor: "pointer"
                    },
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                        fontFamily: fontSans$2,
                        fontSize: 13,
                        color: C$2.navy,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        fontWeight: 500
                      }, children: opt.label }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        background: isOn ? C$2.btnBlue : C$2.border,
                        position: "relative",
                        transition: "background 200ms ease",
                        flexShrink: 0
                      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: C$2.bg,
                        position: "absolute",
                        top: 2,
                        left: isOn ? 22 : 2,
                        transition: "left 200ms ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.12)"
                      } }) })
                    ]
                  },
                  opt.key
                );
              }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSans$2,
                fontSize: 11,
                color: C$2.muted,
                marginTop: 8,
                lineHeight: 1.4
              }, children: "Toggle on the sections you want in this menu. You can change this later." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: trySave,
                style: {
                  width: "100%",
                  background: C$2.btnBlue,
                  color: C$2.white,
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: fontSans$2,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  marginTop: 4
                },
                children: "Save changes"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => setShowDelete(true),
                style: {
                  width: "100%",
                  background: "transparent",
                  color: "#B85C5C",
                  border: "none",
                  padding: "12px",
                  fontFamily: fontSans$2,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer"
                },
                children: "Delete menu"
              }
            ),
            showDelete && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                onClick: () => setShowDelete(false),
                style: {
                  position: "fixed",
                  inset: 0,
                  background: "rgba(35,60,0,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 20,
                  padding: 24
                },
                children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "div",
                  {
                    onClick: (e) => e.stopPropagation(),
                    style: {
                      background: C$2.bg,
                      borderRadius: 16,
                      padding: "24px 20px",
                      width: "100%",
                      maxWidth: 280,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      border: `0.5px solid ${C$2.border}`
                    },
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                        fontFamily: fontSerif$1,
                        fontSize: 20,
                        color: C$2.navy,
                        fontWeight: 400,
                        textAlign: "center"
                      }, children: "Delete this menu?" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                        fontFamily: fontSans$2,
                        fontSize: 13,
                        color: C$2.midBlue,
                        textAlign: "center",
                        marginBottom: 12
                      }, children: "This can't be undone." }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          onClick: () => setShowDelete(false),
                          style: {
                            width: "100%",
                            padding: "12px",
                            borderRadius: 10,
                            background: "transparent",
                            border: `0.5px solid ${C$2.border}`,
                            color: C$2.midBlue,
                            fontFamily: fontSans$2,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: "pointer"
                          },
                          children: "Cancel"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          onClick: tryDelete,
                          style: {
                            width: "100%",
                            padding: "12px",
                            borderRadius: 10,
                            background: "#B85C5C",
                            border: "none",
                            color: C$2.bg,
                            fontFamily: fontSans$2,
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: "pointer"
                          },
                          children: "Delete"
                        }
                      )
                    ]
                  }
                )
              }
            )
          ]
        }
      )
    }
  );
}
function EditOccasionSheet({
  occasion,
  onClose,
  onSaved
}) {
  const [name, setName] = reactExports.useState(occasion.name);
  const [nameErr, setNameErr] = reactExports.useState(false);
  const [selectedIcon, setSelectedIcon] = reactExports.useState(occasion.icon);
  const [sheetPhase, setSheetPhase] = reactExports.useState("entering");
  const trySave = async () => {
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    await updateOccasion(occasion.id, { name: name.trim(), icon: selectedIcon });
    onSaved();
  };
  reactExports.useState(() => {
    requestAnimationFrame(() => {
      setSheetPhase("entered");
    });
  });
  const SelectedIconComponent = getIconComponent(selectedIcon);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      onClick: onClose,
      style: {
        position: "absolute",
        inset: 0,
        background: "rgba(4,44,83,0.55)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 10,
        transition: sheetPhase === "entering" ? "none" : "opacity 250ms ease-out",
        opacity: sheetPhase === "entered" ? 1 : 0
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "100%",
            background: C$2.white,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: "24px 20px calc(80px + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxHeight: "80%",
            overflowY: "auto",
            transform: sheetPhase === "entered" ? "translateY(0)" : "translateY(100%)",
            transition: sheetPhase === "entering" ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSerif$1,
                fontSize: 20,
                fontWeight: 500,
                color: C$2.navy
              }, children: "Edit occasion" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onClose,
                  "aria-label": "Close",
                  style: {
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: C$2.muted,
                    padding: 0,
                    fontSize: 24,
                    lineHeight: 1
                  },
                  children: "×"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$1, { children: "Occasion name" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                TextInput$1,
                {
                  value: name,
                  onChange: (v) => {
                    setName(v);
                    if (v.trim()) setNameErr(false);
                  },
                  onEnter: trySave,
                  placeholder: "e.g. Christmas Dinner, Birthday Party"
                }
              ),
              nameErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg$1, { children: "Please give your occasion a name." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$1, { children: "Icon" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                width: "100%",
                padding: "16px",
                background: C$2.accentBg,
                border: `1px solid ${C$2.borderLight}`,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: C$2.white,
                border: `1px solid ${C$2.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectedIconComponent, { size: 28, color: C$2.midBlue }) }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label$1, { children: "Choose an icon" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 8
              }, children: ICON_OPTIONS.map((opt) => {
                const IconComp = opt.component;
                const isSelected = selectedIcon === opt.name;
                return /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => setSelectedIcon(opt.name),
                    "aria-label": opt.name,
                    style: {
                      width: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: 10,
                      background: isSelected ? C$2.accentBg : C$2.bg,
                      border: isSelected ? `2px solid ${C$2.btnBlue}` : `1px solid ${C$2.borderLight}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0
                    },
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconComp, { size: 22, color: C$2.midBlue })
                  },
                  opt.name
                );
              }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: trySave,
                style: {
                  width: "100%",
                  background: C$2.btnBlue,
                  color: C$2.white,
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: fontSans$2,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  marginTop: 4
                },
                children: "Save changes"
              }
            )
          ]
        }
      )
    }
  );
}
function Label$1({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("label", { style: {
    display: "block",
    fontFamily: fontSans$2,
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: C$2.muted,
    marginBottom: 8
  }, children });
}
function ValMsg$1({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
    fontFamily: fontSans$2,
    fontSize: 11,
    color: "#c0392b",
    marginTop: 5
  }, children });
}
const inputStyleBase$1 = {
  width: "100%",
  background: C$2.white,
  border: `1px solid ${C$2.borderLight}`,
  borderRadius: 10,
  padding: "11px 14px",
  fontFamily: fontSans$2,
  fontSize: 13,
  color: C$2.navy,
  outline: "none",
  WebkitAppearance: "none"
};
function TextInput$1({
  value,
  onChange,
  placeholder,
  onEnter
}) {
  const [focused, setFocused] = reactExports.useState(false);
  const onKey = (e) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      type: "text",
      value,
      onChange: (e) => onChange(e.target.value),
      onKeyDown: onKey,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      placeholder,
      style: {
        ...inputStyleBase$1,
        borderColor: focused ? C$2.border : C$2.borderLight,
        boxShadow: focused ? "0 0 0 3px rgba(133,183,235,0.18)" : "none"
      }
    }
  );
}
function TextArea$1({
  value,
  onChange,
  placeholder,
  rows = 3
}) {
  const [focused, setFocused] = reactExports.useState(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "textarea",
    {
      value,
      onChange: (e) => onChange(e.target.value),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      placeholder,
      rows,
      style: {
        ...inputStyleBase$1,
        borderColor: focused ? C$2.border : C$2.borderLight,
        boxShadow: focused ? "0 0 0 3px rgba(133,183,235,0.18)" : "none",
        resize: "vertical",
        minHeight: 80
      }
    }
  );
}
const C$1 = {
  bg: "#FAF7F2",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  textLight: "rgba(35,60,0,0.6)",
  sectionBg: "rgba(35,60,0,0.04)",
  sectionBorder: "rgba(35,60,0,0.08)",
  sectionName: "rgba(35,60,0,0.6)",
  sectionCount: "rgba(35,60,0,0.3)",
  bodyBg: "rgba(35,60,0,0.02)",
  rowBorder: "rgba(35,60,0,0.05)",
  removeIcon: "rgba(35,60,0,0.2)",
  addText: "rgba(35,60,0,0.3)",
  chevron: "rgba(35,60,0,0.25)"
};
const fontSerif = "'Fraunces', serif";
const fontSans$1 = "'Inter', sans-serif";
const SECTION_LABELS = {
  apps: "APPS",
  mains: "MAINS",
  sides: "SIDES",
  desserts: "DESSERTS",
  drinks: "DRINKS"
};
function MenuInterior({ menuId, back, push }) {
  const [menuState, setMenuState] = reactExports.useState({
    menu: null,
    loading: true
  });
  const [expandedSections, setExpandedSections] = reactExports.useState(/* @__PURE__ */ new Set());
  const [sectionRecipes, setSectionRecipes] = reactExports.useState({});
  const [loadingStates, setLoadingStates] = reactExports.useState(/* @__PURE__ */ new Set());
  const [showEdit, setShowEdit] = reactExports.useState(false);
  reactExports.useEffect(() => {
    async function loadMenu() {
      const loadedMenu = await findMenu(menuId);
      setMenuState({ menu: loadedMenu, loading: false });
    }
    loadMenu();
  }, [menuId]);
  reactExports.useEffect(() => {
    if (expandedSections.size === 0) {
      setLoadingStates(/* @__PURE__ */ new Set());
      return;
    }
    const sections = Array.from(expandedSections);
    setLoadingStates(new Set(sections));
    Promise.all(
      sections.map(
        (section) => getRecipesForMenuSection(menuId, section).then((recipes) => ({ section, recipes }))
      )
    ).then((results) => {
      const newRecipes = {};
      results.forEach(({ section, recipes }) => {
        newRecipes[section] = recipes;
      });
      setSectionRecipes((prev) => ({ ...prev, ...newRecipes }));
      setLoadingStates(/* @__PURE__ */ new Set());
    });
  }, [expandedSections, menuId]);
  if (menuState.loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: C$1.bg, alignItems: "center", justifyContent: "center", padding: 24 } });
  }
  if (!menuState.menu) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: C$1.bg, alignItems: "center", justifyContent: "center", padding: 24 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: { fontFamily: fontSans$1, fontSize: 13, color: C$1.midBlue }, children: "Menu not found." }) });
  }
  const toggleSection = (section) => {
    const next = new Set(expandedSections);
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }
    setExpandedSections(next);
  };
  const refreshMenu = async () => {
    const updated = await findMenu(menuId);
    if (updated) setMenuState({ menu: updated, loading: false });
    setLoadingStates(new Set(expandedSections));
    for (const section of expandedSections) {
      const recipes = await getRecipesForMenuSection(menuId, section);
      setSectionRecipes((prev) => ({ ...prev, [section]: recipes }));
      setLoadingStates((prev) => {
        const next = new Set(prev);
        next.delete(section);
        return next;
      });
    }
  };
  const visibleSections = ["apps", "mains", "sides", "desserts", "drinks"].filter(
    (section) => menuState.menu.enabledSections.includes(section) || menuState.menu.recipes[section].length > 0
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      padding: "16px 24px",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: back,
            "aria-label": "Back",
            style: {
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: C$1.textLight,
              display: "flex",
              alignItems: "center"
            },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "15 18 9 12 15 6" }) })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 1 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
            fontFamily: fontSans$1,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: C$1.text
          }, children: menuState.menu.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
            fontFamily: fontSans$1,
            fontSize: 11,
            color: C$1.textMuted
          } })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => setShowEdit(true),
          "aria-label": "Edit menu",
          style: {
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: C$1.textMuted,
            flexShrink: 0
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" })
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, overflowY: "auto", padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 8 }, children: visibleSections.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px"
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: {
      fontFamily: fontSerif,
      fontStyle: "italic",
      fontSize: 14,
      color: C$1.textLight,
      margin: 0,
      textAlign: "center"
    }, children: "Enable sections in the menu settings to start adding recipes." }) }) : visibleSections.map((section) => {
      const recipes = sectionRecipes[section] || [];
      const isExpanded = expandedSections.has(section);
      const count = menuState.menu.recipes[section].length;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          style: {
            borderRadius: 14,
            overflow: "hidden",
            flexShrink: 0
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => toggleSection(section),
                style: {
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: C$1.sectionBg,
                  border: `1px solid ${C$1.sectionBorder}`,
                  borderRadius: isExpanded ? "14px 14px 0 0" : 14,
                  borderBottom: isExpanded ? "none" : `1px solid ${C$1.sectionBorder}`,
                  cursor: "pointer"
                },
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                      fontFamily: fontSans$1,
                      fontSize: 12,
                      fontWeight: 500,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: C$1.sectionName
                    }, children: SECTION_LABELS[section] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: {
                      fontFamily: fontSans$1,
                      fontSize: 11,
                      color: C$1.sectionCount
                    }, children: [
                      count,
                      " ",
                      count === 1 ? "recipe" : "recipes"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: C$1.chevron, strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", style: {
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 200ms ease"
                  }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "9 18 15 12 9 6" }) })
                ]
              }
            ),
            isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
              background: C$1.bodyBg,
              border: `1px solid ${C$1.sectionBorder}`,
              borderTop: "none",
              borderRadius: "0 0 14px 14px"
            }, children: [
              loadingStates.has(section) ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { padding: 16 } }) : recipes.map((recipe, idx) => {
                const category = findCustomCategory(recipe.category);
                const categoryLabel = category?.label ?? "Unknown";
                return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom: idx === recipes.length - 1 ? "none" : `1px solid ${C$1.rowBorder}`,
                      gap: 12
                    },
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          onClick: () => {
                            const recipeData = {
                              title: recipe.title,
                              description: recipe.description,
                              color: category?.gradient ?? "linear-gradient(135deg, #C5DCF4 0%, #85B7EB 100%)",
                              category: categoryLabel.toLowerCase(),
                              ingredients: recipe.ingredients,
                              steps: recipe.steps,
                              savedId: recipe.id,
                              categoryKey: recipe.category
                            };
                            push({ name: "recipe", recipe: recipeData, categoryLabel });
                          },
                          style: {
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: 2,
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            textAlign: "left"
                          },
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                              fontFamily: fontSans$1,
                              fontSize: 14,
                              fontWeight: 500,
                              color: C$1.text
                            }, children: recipe.title }),
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
                              fontFamily: fontSans$1,
                              fontSize: 11,
                              color: C$1.textMuted
                            }, children: [
                              categoryLabel,
                              " · 30 min"
                            ] })
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          onClick: () => {
                            removeRecipeFromMenuSection(menuId, section, recipe.id);
                            refreshMenu();
                          },
                          "aria-label": "Remove recipe",
                          style: {
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            color: C$1.removeIcon
                          },
                          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
                          ] })
                        }
                      )
                    ]
                  },
                  recipe.id
                );
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  onClick: () => {
                    push({ name: "recipepicker", menuId, section });
                  },
                  style: {
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 16px",
                    background: "transparent",
                    border: "none",
                    borderTop: recipes.length > 0 ? `1px solid ${C$1.rowBorder}` : "none",
                    cursor: "pointer"
                  },
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: C$1.addText, strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 5v14" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 12h14" })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                      fontFamily: fontSans$1,
                      fontSize: 12,
                      fontWeight: 500,
                      color: C$1.addText
                    }, children: "add a recipe" })
                  ]
                }
              )
            ] })
          ]
        },
        section
      );
    }) }),
    showEdit && /* @__PURE__ */ jsxRuntimeExports.jsx(
      EditMenuSheet,
      {
        menu: menuState.menu,
        onClose: () => setShowEdit(false),
        onSaved: () => {
          setShowEdit(false);
          refreshMenu();
        }
      }
    )
  ] });
}
const SECTION_OPTIONS = [
  { key: "apps", label: "Apps" },
  { key: "mains", label: "Mains" },
  { key: "sides", label: "Sides" },
  { key: "desserts", label: "Desserts" },
  { key: "drinks", label: "Drinks" }
];
function EditMenuSheet({
  menu,
  onClose,
  onSaved
}) {
  const [title, setTitle] = reactExports.useState(menu.title);
  const [titleErr, setTitleErr] = reactExports.useState(false);
  const [description, setDescription] = reactExports.useState(menu.description);
  const [enabledSections, setEnabledSections] = reactExports.useState(menu.enabledSections);
  const [sheetPhase, setSheetPhase] = reactExports.useState("entering");
  const toggleSection = (section) => {
    if (enabledSections.includes(section)) {
      setEnabledSections(enabledSections.filter((s) => s !== section));
    } else {
      setEnabledSections([...enabledSections, section]);
    }
  };
  const trySave = () => {
    if (!title.trim()) {
      setTitleErr(true);
      return;
    }
    updateMenu(menu.id, {
      title: title.trim(),
      description: description.trim(),
      enabledSections
    });
    onSaved();
  };
  reactExports.useState(() => {
    requestAnimationFrame(() => {
      setSheetPhase("entered");
    });
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      onClick: onClose,
      style: {
        position: "absolute",
        inset: 0,
        background: "rgba(4,44,83,0.55)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 10,
        transition: sheetPhase === "entering" ? "none" : "opacity 250ms ease-out",
        opacity: sheetPhase === "entered" ? 1 : 0
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "100%",
            background: C$1.white,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: "24px 20px calc(80px + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxHeight: "80%",
            overflowY: "auto",
            transform: sheetPhase === "entered" ? "translateY(0)" : "translateY(100%)",
            transition: sheetPhase === "entering" ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSerif,
                fontSize: 20,
                fontWeight: 500,
                color: C$1.navy
              }, children: "Edit menu" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onClose,
                  "aria-label": "Close",
                  style: {
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: C$1.muted,
                    padding: 0,
                    fontSize: 24,
                    lineHeight: 1
                  },
                  children: "×"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Menu title" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                TextInput,
                {
                  value: title,
                  onChange: (v) => {
                    setTitle(v);
                    if (v.trim()) setTitleErr(false);
                  },
                  onEnter: trySave,
                  placeholder: "e.g. Christmas Eve Dinner"
                }
              ),
              titleErr && /* @__PURE__ */ jsxRuntimeExports.jsx(ValMsg, { children: "Please give your menu a title." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Description (optional)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                TextArea,
                {
                  value: description,
                  onChange: setDescription,
                  placeholder: "Add a note about this menu...",
                  rows: 3
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                background: C$1.bg,
                border: `1px solid ${C$1.borderLight}`,
                borderRadius: 12,
                overflow: "hidden"
              }, children: SECTION_OPTIONS.map((opt, idx) => {
                const isOn = enabledSections.includes(opt.key);
                return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    onClick: () => toggleSection(opt.key),
                    style: {
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      background: "transparent",
                      border: "none",
                      borderBottom: idx < SECTION_OPTIONS.length - 1 ? `0.5px solid ${C$1.borderLight}` : "none",
                      cursor: "pointer"
                    },
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                        fontFamily: fontSans$1,
                        fontSize: 13,
                        color: C$1.navy,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        fontWeight: 500
                      }, children: opt.label }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        background: isOn ? C$1.btnBlue : C$1.border,
                        position: "relative",
                        transition: "background 200ms ease",
                        flexShrink: 0
                      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: C$1.white,
                        position: "absolute",
                        top: 2,
                        left: isOn ? 22 : 2,
                        transition: "left 200ms ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.12)"
                      } }) })
                    ]
                  },
                  opt.key
                );
              }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: fontSans$1,
                fontSize: 11,
                color: C$1.muted,
                marginTop: 8,
                lineHeight: 1.4
              }, children: "Toggle on the sections you want in this menu. You can change this later." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: trySave,
                style: {
                  width: "100%",
                  background: C$1.btnBlue,
                  color: C$1.white,
                  border: "none",
                  borderRadius: 12,
                  padding: "14px",
                  fontFamily: fontSans$1,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  marginTop: 4
                },
                children: "Save changes"
              }
            )
          ]
        }
      )
    }
  );
}
function Label({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("label", { style: {
    display: "block",
    fontFamily: fontSans$1,
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: C$1.muted,
    marginBottom: 8
  }, children });
}
function ValMsg({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
    fontFamily: fontSans$1,
    fontSize: 11,
    color: "#c0392b",
    marginTop: 5
  }, children });
}
const inputStyleBase = {
  width: "100%",
  background: C$1.white,
  border: `1px solid ${C$1.borderLight}`,
  borderRadius: 10,
  padding: "11px 14px",
  fontFamily: fontSans$1,
  fontSize: 13,
  color: C$1.navy,
  outline: "none",
  WebkitAppearance: "none"
};
function TextInput({
  value,
  onChange,
  placeholder,
  onEnter
}) {
  const [focused, setFocused] = reactExports.useState(false);
  const onKey = (e) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      type: "text",
      value,
      onChange: (e) => onChange(e.target.value),
      onKeyDown: onKey,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      placeholder,
      style: {
        ...inputStyleBase,
        borderColor: focused ? C$1.border : C$1.borderLight,
        boxShadow: focused ? "0 0 0 3px rgba(133,183,235,0.18)" : "none"
      }
    }
  );
}
function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3
}) {
  const [focused, setFocused] = reactExports.useState(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "textarea",
    {
      value,
      onChange: (e) => onChange(e.target.value),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      placeholder,
      rows,
      style: {
        ...inputStyleBase,
        borderColor: focused ? C$1.border : C$1.borderLight,
        boxShadow: focused ? "0 0 0 3px rgba(133,183,235,0.18)" : "none",
        resize: "vertical",
        minHeight: 80
      }
    }
  );
}
const C = {
  bg: "#FAF7F2",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  borderLight: "rgba(35,60,0,0.08)",
  button: "#233C00",
  buttonText: "#FAF7F2",
  white: "#FAF7F2"
};
const fontSans = "'Inter', sans-serif";
const DURATION$2 = 300;
const EASE$2 = "cubic-bezier(0.4, 0, 0.2, 1)";
function RecipePicker({ menuId, section, onClose }) {
  const [view, setView] = reactExports.useState("categories");
  const [transition, setTransition] = reactExports.useState(null);
  const [addedInSession, setAddedInSession] = reactExports.useState(/* @__PURE__ */ new Set());
  const [existingRecipeIds, setExistingRecipeIds] = reactExports.useState([]);
  const [categories2, setCategories] = reactExports.useState([]);
  reactExports.useEffect(() => {
    const loadCategories = async () => {
      const cats = await loadCustomCategories();
      setCategories(cats);
    };
    loadCategories();
  }, []);
  reactExports.useEffect(() => {
    const loadExistingRecipes = async () => {
      const recipes = await getRecipesForMenuSection(menuId, section);
      setExistingRecipeIds(recipes.map((r) => r.id));
    };
    loadExistingRecipes();
  }, [menuId, section]);
  const SECTION_LABELS2 = {
    apps: "Apps",
    mains: "Mains",
    sides: "Sides",
    desserts: "Desserts",
    drinks: "Drinks"
  };
  const handleCategoryTap = (catKey, catLabel) => {
    const toView = { category: catKey, label: catLabel };
    setTransition({ from: view, to: toView, direction: "forward" });
    setTimeout(() => {
      setView(toView);
      setTimeout(() => setTransition(null), DURATION$2);
    }, 0);
  };
  const handleRecipeTap = (recipeId) => {
    if (existingRecipeIds.includes(recipeId)) return;
    addRecipeToMenuSection(menuId, section, recipeId);
    setAddedInSession((prev) => /* @__PURE__ */ new Set([...prev, recipeId]));
  };
  const handleBack = () => {
    if (view !== "categories") {
      setTransition({ from: view, to: "categories", direction: "back" });
      setTimeout(() => {
        setView("categories");
        setTimeout(() => setTransition(null), DURATION$2);
      }, 0);
    }
  };
  const transKey = transition ? `${viewKey(transition.from)}->${viewKey(transition.to)}:${transition.direction}` : null;
  const [armedKey, setArmedKey] = reactExports.useState(null);
  const animPhase = transKey && armedKey !== transKey ? "start" : "end";
  reactExports.useEffect(() => {
    if (!transKey) {
      if (armedKey !== null) setArmedKey(null);
      return;
    }
    if (armedKey === transKey) return;
    let r2 = 0;
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      r2 = requestAnimationFrame(() => {
        if (cancelled) return;
        setArmedKey(transKey);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [transKey, armedKey]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", background: C.bg }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      background: C.white,
      borderBottom: `1px solid ${C.borderLight}`,
      padding: "0 16px",
      height: 50,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: 0
    }, children: [
      view !== "categories" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: handleBack,
          "aria-label": "Back",
          style: {
            background: "none",
            border: "none",
            cursor: "pointer",
            color: C.text,
            display: "flex",
            alignItems: "center",
            padding: 0
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19 12H5" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 19l-7-7 7-7" })
          ] })
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 12 } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
        fontFamily: fontSans,
        fontSize: 16,
        color: C.text,
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)"
      }, children: "Tipsy Dinner" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onClose,
          style: {
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: fontSans,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: C.text,
            padding: 0
          },
          children: "Done"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      background: C.white,
      borderBottom: `1px solid ${C.borderLight}`,
      padding: "10px 16px 12px",
      flexShrink: 0
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
        fontFamily: fontSans,
        fontSize: 9,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: C.textMuted,
        marginBottom: 2
      }, children: [
        "Adding to ",
        SECTION_LABELS2[section]
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
        fontFamily: fontSans,
        fontSize: 20,
        color: C.text,
        fontWeight: 400
      }, children: view === "categories" ? "Choose a category" : view.label })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, position: "relative", overflow: "hidden", background: C.bg }, children: !transition ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      ViewContent,
      {
        view,
        categories: categories2,
        existingRecipeIds,
        addedInSession,
        onCategoryTap: handleCategoryTap,
        onRecipeTap: handleRecipeTap
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ViewLayer,
        {
          view: transition.from,
          categories: categories2,
          existingRecipeIds,
          addedInSession,
          onCategoryTap: handleCategoryTap,
          onRecipeTap: handleRecipeTap,
          transform: getTransform(transition.direction, "from", animPhase),
          transitionStyle: animPhase === "start" ? "none" : `transform ${DURATION$2}ms ${EASE$2}`,
          zIndex: transition.direction === "forward" ? 1 : 2
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ViewLayer,
        {
          view: transition.to,
          categories: categories2,
          existingRecipeIds,
          addedInSession,
          onCategoryTap: handleCategoryTap,
          onRecipeTap: handleRecipeTap,
          transform: getTransform(transition.direction, "to", animPhase),
          transitionStyle: animPhase === "start" ? "none" : `transform ${DURATION$2}ms ${EASE$2}`,
          zIndex: transition.direction === "forward" ? 2 : 1
        }
      )
    ] }) })
  ] });
}
function viewKey(v) {
  return v === "categories" ? "categories" : `recipe-list:${v.category}`;
}
function getTransform(direction, layer, phase) {
  if (direction === "forward") {
    if (layer === "from") {
      return phase === "start" ? "translateX(0)" : "translateX(-25%)";
    } else {
      return phase === "start" ? "translateX(100%)" : "translateX(0)";
    }
  } else {
    if (layer === "from") {
      return phase === "start" ? "translateX(0)" : "translateX(100%)";
    } else {
      return phase === "start" ? "translateX(-25%)" : "translateX(0)";
    }
  }
}
function renderView(view, categories2, existingRecipeIds, addedInSession, onCategoryTap, onRecipeTap) {
  if (view === "categories") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: 12
    }, children: categories2.map((cat) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => onCategoryTap(cat.key, cat.label),
        style: {
          background: cat.gradient,
          border: "none",
          borderRadius: 16,
          padding: 0,
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
          aspectRatio: "1"
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
            position: "absolute",
            inset: 0,
            background: "rgba(35, 60, 0, 0.2)"
          } }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: fontSans,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.95)",
            textShadow: "0 1px 3px rgba(0, 0, 0, 0.3)"
          }, children: cat.label })
        ]
      },
      cat.key
    )) });
  } else {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      RecipeList,
      {
        categoryKey: view.category,
        categoryLabel: view.label,
        existingRecipeIds,
        addedInSession,
        onRecipeTap
      }
    );
  }
}
function ViewContent({
  view,
  categories: categories2,
  existingRecipeIds,
  addedInSession,
  onCategoryTap,
  onRecipeTap
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    background: C.bg
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 16px"
  }, children: renderView(view, categories2, existingRecipeIds, addedInSession, onCategoryTap, onRecipeTap) }) });
}
function ViewLayer({
  view,
  categories: categories2,
  existingRecipeIds,
  addedInSession,
  onCategoryTap,
  onRecipeTap,
  transform,
  transitionStyle,
  zIndex
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    background: C.bg,
    transform,
    transition: transitionStyle,
    zIndex,
    pointerEvents: "none",
    willChange: "transform"
  }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 16px"
  }, children: renderView(view, categories2, existingRecipeIds, addedInSession, onCategoryTap, onRecipeTap) }) });
}
function RecipeList({
  categoryKey,
  categoryLabel,
  existingRecipeIds,
  addedInSession,
  onRecipeTap
}) {
  const [recipes, setRecipes] = reactExports.useState([]);
  reactExports.useEffect(() => {
    const loadRecipes = async () => {
      const data = await getRecipesForCategory(categoryKey, categoryLabel);
      setRecipes(data);
    };
    loadRecipes();
  }, [categoryKey, categoryLabel]);
  if (recipes.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      textAlign: "center",
      padding: "40px 20px",
      fontFamily: fontSans,
      fontSize: 13,
      color: C.textMuted,
      fontStyle: "italic"
    }, children: "No recipes in this category yet." });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: recipes.filter((recipe) => recipe.savedId != null).map((recipe) => {
    const recipeId = recipe.savedId;
    const isAlreadyAdded = existingRecipeIds.includes(recipeId);
    const justAdded = addedInSession.has(recipeId);
    const disabled = isAlreadyAdded && !justAdded;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => !disabled && onRecipeTap(recipeId),
        disabled,
        style: {
          background: C.white,
          border: `1px solid ${C.borderLight}`,
          borderRadius: 14,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          textAlign: "left",
          position: "relative"
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
              fontFamily: fontSans,
              fontSize: 15,
              fontWeight: 500,
              color: C.text,
              marginBottom: 2
            }, children: recipe.title || "Untitled" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
              fontFamily: fontSans,
              fontSize: 11,
              color: C.textMuted,
              lineHeight: 1.4
            }, children: recipe.description || "No description" })
          ] }),
          justAdded && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: C.button,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: C.buttonText, strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M20 6L9 17l-5-5" }) }) })
        ]
      },
      recipeId
    );
  }) });
}
const fullLogo = "/assets/Full_logo-Bq3_mZX9.png";
const fieldLabel$1 = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(35,60,0,0.35)",
  marginBottom: 6
};
const fieldInput$1 = {
  width: "100%",
  height: 32,
  background: "transparent",
  border: "none",
  borderBottom: "1px solid rgba(35,60,0,0.2)",
  borderRadius: 0,
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  color: "#233C00",
  outline: "none",
  padding: "0 2px"
};
const btnStyle$1 = {
  background: "#233C00",
  color: "#FAF7F2",
  border: "none",
  borderRadius: 14,
  padding: "14px 0",
  fontFamily: "'Inter', sans-serif",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  width: "100%",
  cursor: "pointer",
  flexShrink: 0
};
const pillBtn$1 = {
  background: "#233C00",
  color: "#FAF7F2",
  border: "none",
  borderRadius: 20,
  padding: "8px 16px",
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer"
};
function SignUp({ onNavigateToSignIn, onSuccess }) {
  const [name, setName] = reactExports.useState("");
  const [email, setEmail] = reactExports.useState("");
  const [password, setPassword] = reactExports.useState("");
  const [confirmPassword, setConfirmPassword] = reactExports.useState("");
  const [loading, setLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState("");
  reactExports.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      input::placeholder {
        color: rgba(35,60,0,0.3);
        opacity: 1;
      }
      input:focus {
        border-bottom-color: #233C00 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  const handleSignUp = async () => {
    setError("");
    if (!name || !email || !password || !confirmPassword) {
      setError("All fields are required");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name
          }
        }
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      if (data.user) {
        onSuccess();
      }
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };
  const handleGoogleSignUp = async () => {
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google"
      });
      if (oauthError) {
        setError(oauthError.message);
      }
    } catch {
      setError("Failed to sign up with Google");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#FAF7F2",
        padding: "32px 28px 28px"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { position: "absolute", top: 28, right: 28 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { style: pillBtn$1, onClick: onNavigateToSignIn, children: "Sign In" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { textAlign: "center", marginBottom: 32, marginTop: 8 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "img",
          {
            src: fullLogo,
            alt: "Tipsy Dinner",
            style: { height: 120, display: "block", margin: "0 auto" }
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 18 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: fieldLabel$1, children: "Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                style: fieldInput$1,
                value: name,
                onChange: (e) => setName(e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: fieldLabel$1, children: "Email" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                style: fieldInput$1,
                type: "email",
                value: email,
                onChange: (e) => setEmail(e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: fieldLabel$1, children: "Password" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                style: fieldInput$1,
                type: "password",
                value: password,
                onChange: (e) => setPassword(e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: fieldLabel$1, children: "Confirm Password" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                style: fieldInput$1,
                type: "password",
                value: confirmPassword,
                onChange: (e) => setConfirmPassword(e.target.value)
              }
            )
          ] }),
          error && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              style: {
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                color: "#c03000",
                textAlign: "center"
              },
              children: error
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              style: {
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 400,
                color: "rgba(35,60,0,0.35)",
                textAlign: "center",
                marginTop: 12
              },
              children: "or sign up with"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "center",
                cursor: "pointer",
                marginBottom: 32
              },
              onClick: handleGoogleSignUp,
              children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "path",
                  {
                    d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z",
                    fill: "#4285F4"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "path",
                  {
                    d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z",
                    fill: "#34A853"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "path",
                  {
                    d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z",
                    fill: "#FBBC05"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "path",
                  {
                    d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z",
                    fill: "#EA4335"
                  }
                )
              ] })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            style: { ...btnStyle$1, opacity: loading ? 0.6 : 1 },
            onClick: handleSignUp,
            disabled: loading,
            children: loading ? "Creating Account..." : "Let's Get Started"
          }
        )
      ]
    }
  );
}
const fieldLabel = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(35,60,0,0.35)",
  marginBottom: 6
};
const fieldInput = {
  width: "100%",
  height: 32,
  background: "transparent",
  border: "none",
  borderBottom: "1px solid rgba(35,60,0,0.2)",
  borderRadius: 0,
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  color: "#233C00",
  outline: "none",
  padding: "0 2px"
};
const btnStyle = {
  background: "#233C00",
  color: "#FAF7F2",
  border: "none",
  borderRadius: 14,
  padding: "14px 0",
  fontFamily: "'Inter', sans-serif",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  width: "100%",
  cursor: "pointer",
  flexShrink: 0
};
const pillBtn = {
  background: "#233C00",
  color: "#FAF7F2",
  border: "none",
  borderRadius: 20,
  padding: "8px 16px",
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer"
};
function SignIn({ onNavigateToSignUp, onSuccess }) {
  const [email, setEmail] = reactExports.useState("");
  const [password, setPassword] = reactExports.useState("");
  const [loading, setLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState("");
  reactExports.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      input::placeholder {
        color: rgba(35,60,0,0.3);
        opacity: 1;
      }
      input:focus {
        border-bottom-color: #233C00 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  const handleSignIn = async () => {
    setError("");
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      if (data.user) {
        onSuccess();
      }
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };
  const handleGoogleSignIn = async () => {
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google"
      });
      if (oauthError) {
        setError(oauthError.message);
      }
    } catch {
      setError("Failed to sign in with Google");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#FAF7F2",
        padding: "56px 28px 28px"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { position: "absolute", top: 28, right: 28 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { style: pillBtn, onClick: onNavigateToSignUp, children: "Sign Up" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { textAlign: "center", marginBottom: 32, marginTop: 24 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "img",
          {
            src: fullLogo,
            alt: "Tipsy Dinner",
            style: { height: 120, display: "block", margin: "0 auto" }
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 18 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: fieldLabel, children: "Email" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                style: fieldInput,
                type: "email",
                value: email,
                onChange: (e) => setEmail(e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: fieldLabel, children: "Password" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                style: fieldInput,
                type: "password",
                value: password,
                onChange: (e) => setPassword(e.target.value)
              }
            )
          ] }),
          error && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              style: {
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                color: "#c03000",
                textAlign: "center"
              },
              children: error
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              style: {
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 400,
                color: "rgba(35,60,0,0.35)",
                textAlign: "center",
                marginTop: 12
              },
              children: "or sign in with"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "center",
                cursor: "pointer"
              },
              onClick: handleGoogleSignIn,
              children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "path",
                  {
                    d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z",
                    fill: "#4285F4"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "path",
                  {
                    d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z",
                    fill: "#34A853"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "path",
                  {
                    d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z",
                    fill: "#FBBC05"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "path",
                  {
                    d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z",
                    fill: "#EA4335"
                  }
                )
              ] })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            style: { ...btnStyle, opacity: loading ? 0.6 : 1 },
            onClick: handleSignIn,
            disabled: loading,
            children: loading ? "Signing In..." : "Sign In"
          }
        )
      ]
    }
  );
}
const DURATION$1 = 300;
const EASE$1 = "cubic-bezier(0.4, 0, 0.2, 1)";
function AuthFlow({ initialScreen = "signup", onSuccess }) {
  const [current, setCurrent] = reactExports.useState(initialScreen);
  const [transition, setTransition] = reactExports.useState(null);
  const transKey = transition ? `${transition.from}->${transition.to}:${transition.direction}` : null;
  const [armedKey, setArmedKey] = reactExports.useState(null);
  const animPhase = transKey && armedKey !== transKey ? "start" : "end";
  reactExports.useEffect(() => {
    if (!transKey) {
      if (armedKey !== null) setArmedKey(null);
      return;
    }
    if (armedKey === transKey) return;
    let r2 = 0;
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      r2 = requestAnimationFrame(() => {
        if (cancelled) return;
        setArmedKey(transKey);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [transKey, armedKey]);
  reactExports.useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setTransition(null), DURATION$1 + 20);
    return () => clearTimeout(t);
  }, [transition]);
  const navigateTo = (screen) => {
    if (screen === current) return;
    const direction2 = screen === "signin" ? "forward" : "backward";
    setTransition({ from: current, to: screen, direction: direction2 });
    setCurrent(screen);
  };
  const layerBase = {
    position: "absolute",
    inset: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#FAF7F2",
    willChange: "transform"
  };
  const renderAuthScreen = (screen) => {
    if (screen === "signup") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        SignUp,
        {
          onNavigateToSignIn: () => navigateTo("signin"),
          onSuccess
        }
      );
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      SignIn,
      {
        onNavigateToSignUp: () => navigateTo("signup"),
        onSuccess
      }
    );
  };
  if (!transition) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { ...layerBase, position: "relative" }, children: renderAuthScreen(current) });
  }
  const { from, to, direction } = transition;
  let fromTransform = "translateX(0)";
  let toTransform = "translateX(0)";
  if (direction === "forward") {
    fromTransform = animPhase === "start" ? "translateX(0)" : "translateX(-25%)";
    toTransform = animPhase === "start" ? "translateX(100%)" : "translateX(0)";
  } else {
    fromTransform = animPhase === "start" ? "translateX(0)" : "translateX(100%)";
    toTransform = animPhase === "start" ? "translateX(-25%)" : "translateX(0)";
  }
  const transitionStyle = animPhase === "start" ? "none" : `transform ${DURATION$1}ms ${EASE$1}`;
  const fromZ = direction === "forward" ? 1 : 2;
  const toZ = direction === "forward" ? 2 : 1;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#FAF7F2" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        style: {
          ...layerBase,
          transform: fromTransform,
          transition: transitionStyle,
          zIndex: fromZ,
          pointerEvents: "none"
        },
        children: renderAuthScreen(from)
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        style: {
          ...layerBase,
          transform: toTransform,
          transition: transitionStyle,
          zIndex: toZ,
          pointerEvents: "none"
        },
        children: renderAuthScreen(to)
      }
    )
  ] });
}
const watermarkSquare = "/assets/watermark_square-CXWDIbxY.png";
const watermarkCircle = "/assets/watermark_circle-M8ElkDyE.png";
async function* parseSSEStream(response) {
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
const S = {
  page: {
    minHeight: "100vh",
    background: "#D8E8F2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 12px"
  },
  phone: {
    width: 320,
    height: 640,
    background: "#FAF7F2",
    borderRadius: 32,
    border: "none",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(4,44,83,0.12)",
    position: "relative"
  }
};
const DURATION = 300;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
function screenKey(s) {
  switch (s.name) {
    case "cook":
      return s.resetKey ? `cook:${s.resetKey}` : "cook";
    case "addown":
      return s.editRecipe?.savedId ? `addown:edit:${s.editRecipe.savedId}` : "addown";
    case "newcategory":
      return "newcategory";
    case "newcategoryforrecipe":
      return "newcategoryforrecipe";
    case "editcategory":
      return `editcategory:${s.categoryKey}`;
    case "categories":
      return "categories";
    case "recipes":
      return `recipes:${s.categoryKey}`;
    case "recipe":
      return `recipe:${s.categoryLabel}:${s.recipe.title}`;
    case "occasions":
      return "occasions";
    case "menus":
      return `menus:${s.occasionId}`;
    case "menuinterior":
      return `menuinterior:${s.menuId}`;
    case "recipepicker":
      return `recipepicker:${s.menuId}:${s.section}`;
    case "profile":
      return "profile";
    case "profileedit":
      return `profileedit:${s.fieldKey}`;
    case "placeholder":
      return `placeholder:${s.title}`;
  }
}
function renderScreen(s, push, back, isTabRoot, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe, finishSaveRecipe, onSignOut, profile, onUpdate) {
  switch (s.name) {
    case "cook":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        Cook,
        {
          back,
          push,
          finishSaveRecipe: (r, k, l) => finishSaveRecipe?.(r, k, l),
          screen: s,
          isTabRoot,
          profile,
          onUpdate
        },
        s.resetKey
      );
    case "addown":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        AddYourOwn,
        {
          back,
          goCategories: () => push({ name: "categories" }),
          goRecipe: (recipe, categoryKey, categoryLabel) => finishSaveRecipe?.(recipe, categoryKey, categoryLabel),
          editRecipe: s.editRecipe,
          editCategoryLabel: s.editCategoryLabel,
          onSaveEdit: (updated, label) => replaceRecipe?.(updated, label),
          onDeleted: () => finishDeleteRecipe?.(),
          initialDraft: s.draft ? { ...s.draft, step: 4, trayOpen: s.draft.trayOpen } : void 0,
          onCreateCategoryForRecipe: (payload) => push({ name: "newcategoryforrecipe", draft: payload, returnTo: "addown" })
        }
      );
    case "newcategory":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(NewCategory, { back, onSaved: back });
    case "newcategoryforrecipe":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        NewCategory,
        {
          back,
          onSaved: (cat) => {
            if (cat) finishCreateCategoryForRecipe?.(cat.key, cat.label, s.draft, s.returnTo);
          }
        }
      );
    case "editcategory":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        NewCategory,
        {
          back,
          onSaved: back,
          editKey: s.categoryKey,
          onEditSaved: (newLabel) => finishEditCategory?.(newLabel),
          onDeleted: () => finishDeleteCategory?.()
        }
      );
    case "categories":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Categories, { push, back, isTabRoot });
    case "recipes":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        Recipes,
        {
          categoryKey: s.categoryKey,
          categoryLabel: s.categoryLabel,
          push,
          back
        }
      );
    case "recipe":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        RecipeCard,
        {
          recipe: s.recipe,
          categoryLabel: s.categoryLabel,
          back,
          push
        }
      );
    case "occasions":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        Occasions,
        {
          back,
          push: (occasion) => push({ name: "menus", occasionId: occasion.id, occasionName: occasion.name }),
          isTabRoot
        }
      );
    case "menus":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        Menus,
        {
          occasionId: s.occasionId,
          occasionName: s.occasionName,
          back,
          push: (menu) => push({ name: "menuinterior", menuId: menu.id })
        }
      );
    case "menuinterior":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        MenuInterior,
        {
          menuId: s.menuId,
          back,
          push
        }
      );
    case "recipepicker":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        RecipePicker,
        {
          menuId: s.menuId,
          section: s.section,
          onClose: back
        }
      );
    case "profile":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Profile, { back, openEdit: (k) => push({ name: "profileedit", fieldKey: k }), isTabRoot, onSignOut, profile: profile || null, onUpdate: onUpdate || (async () => {
      }) });
    case "profileedit":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ProfileEdit, { fieldKey: s.fieldKey, back, profile: profile || null, onUpdate: onUpdate || (async () => {
      }) });
    case "placeholder":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Placeholder, { title: s.title, back });
  }
}
const TAB_ORDER = ["build", "recipes", "menus", "profile"];
function getTabIndex(tab) {
  return TAB_ORDER.indexOf(tab);
}
function App() {
  const [activeTab, setActiveTab] = reactExports.useState("build");
  const [tabStacks, setTabStacks] = reactExports.useState({
    build: [{ name: "cook" }],
    recipes: [{ name: "categories" }],
    menus: [{ name: "occasions" }],
    profile: [{ name: "profile" }]
  });
  const currentStack = tabStacks[activeTab];
  const current = currentStack[currentStack.length - 1];
  const isTabRoot = currentStack.length === 1;
  const [session, setSession] = reactExports.useState(void 0);
  const [authScreen, setAuthScreen] = reactExports.useState("signup");
  const [showOnboarding, setShowOnboarding] = reactExports.useState(null);
  const [profile, setProfile] = reactExports.useState(null);
  const loadProfile = async (userId) => {
    if (!userId) {
      throw new Error("No userId provided - cannot load profile");
    }
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (error) {
        if (error.code === "PGRST116") {
          const newProfile = {
            id: userId,
            palate: "",
            inspiration: "",
            constraints: "",
            display_name: "",
            onboarding_complete: false
          };
          const { data: created, error: upsertError } = await supabase.from("profiles").upsert(newProfile, { onConflict: "id" }).select().single();
          if (upsertError) throw upsertError;
          const profileData2 = created;
          setProfile(profileData2);
          return profileData2;
        }
        throw error;
      }
      const profileData = data;
      setProfile(profileData);
      return profileData;
    } catch (err) {
      console.error("Error loading profile:", err);
      throw err;
    }
  };
  const updateProfile = async (updates, userId) => {
    try {
      const effectiveUserId = userId || session?.user?.id;
      if (!effectiveUserId) {
        throw new Error("No active session - cannot update profile");
      }
      const { error } = await supabase.from("profiles").upsert(
        { id: effectiveUserId, ...updates },
        { onConflict: "id" }
      );
      if (error) throw error;
      setProfile((prev) => prev ? { ...prev, ...updates } : null);
    } catch (err) {
      console.error("Error updating profile:", err);
      throw err;
    }
  };
  const migrateFromLocalStorage = async (userId) => {
    if (!userId) {
      return;
    }
    try {
      const palate = localStorage.getItem("tipsyDinnerPalate");
      const inspiration = localStorage.getItem("tipsyDinnerInspiration");
      const constraints = localStorage.getItem("tipsyDinnerConstraints");
      const onboardingComplete = localStorage.getItem("tipsyDinnerOnboardingComplete") === "true";
      if (palate || inspiration || constraints || onboardingComplete) {
        const updates = {};
        if (palate) updates.palate = palate;
        if (inspiration) updates.inspiration = inspiration;
        if (constraints) updates.constraints = constraints;
        if (onboardingComplete) updates.onboarding_complete = true;
        await updateProfile(updates, userId);
        localStorage.removeItem("tipsyDinnerPalate");
        localStorage.removeItem("tipsyDinnerInspiration");
        localStorage.removeItem("tipsyDinnerConstraints");
        localStorage.removeItem("tipsyDinnerOnboardingComplete");
        console.log("Migrated profile from localStorage to Supabase");
      }
    } catch (err) {
      console.error("Migration error:", err);
    }
  };
  reactExports.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: session2 } }) => {
      setSession(session2);
    });
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session2) => {
      setSession(session2);
      if (session2 && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        try {
          await loadProfile(session2.user.id);
          await migrateFromLocalStorage(session2.user.id);
          const finalProfile = await loadProfile(session2.user.id);
          setShowOnboarding(!finalProfile.onboarding_complete);
        } catch (err) {
          console.error("Error initializing profile on sign in:", err);
          setShowOnboarding(false);
        }
      } else if (!session2) {
        setAuthScreen("signin");
        setShowOnboarding(null);
        setProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  reactExports.useEffect(() => {
    if (session) {
      migrateRecipesFromLocalStorage().catch((err) => {
        console.error("Migration error:", err);
      });
      try {
        localStorage.removeItem("tipsyDinnerCategories");
        cleanupMenusLocalStorage();
      } catch (err) {
        console.error("Error removing old localStorage keys:", err);
      }
    }
  }, [session]);
  const [transition, setTransition] = reactExports.useState(null);
  const [topLevelTransition, setTopLevelTransition] = reactExports.useState(null);
  const updateCurrentTabStack = (updater) => {
    setTabStacks((stacks) => ({
      ...stacks,
      [activeTab]: updater(stacks[activeTab])
    }));
  };
  const switchToTab = (tab, screen) => {
    if (tab === activeTab) {
      setTabStacks((prevStacks) => {
        const stack = prevStacks[tab];
        const currentScreen = stack[stack.length - 1];
        const currentIsTabRoot = stack.length === 1;
        if (tab === "build") {
          const freshCook = { name: "cook", resetKey: Date.now() };
          setTransition({
            from: currentScreen,
            to: freshCook,
            direction: "back",
            fromIsTabRoot: currentIsTabRoot,
            toIsTabRoot: true
          });
          return {
            ...prevStacks,
            build: [freshCook]
          };
        } else if (stack.length > 1) {
          const root = stack[0];
          setTransition({
            from: currentScreen,
            to: root,
            direction: "back",
            fromIsTabRoot: false,
            toIsTabRoot: true
          });
          return {
            ...prevStacks,
            [tab]: [root]
          };
        }
        return prevStacks;
      });
      return;
    }
    const fromIndex = getTabIndex(activeTab);
    const toIndex = getTabIndex(tab);
    const direction = toIndex > fromIndex ? "forward" : "back";
    const targetStack = tabStacks[tab];
    const targetScreen = screen || targetStack[targetStack.length - 1];
    const fromIsTabRoot = currentStack.length === 1;
    const toIsTabRoot = screen ? false : targetStack.length === 1;
    setTransition({
      from: current,
      to: targetScreen,
      direction,
      fromIsTabRoot,
      toIsTabRoot
    });
    setActiveTab(tab);
    if (screen) {
      setTabStacks((stacks) => ({
        ...stacks,
        [tab]: [...stacks[tab], screen]
      }));
    }
  };
  const push = (s) => {
    if (transition) return;
    if (s.name === "newcategoryforrecipe" && current.name === "addown") {
      const updatedAddown = { ...current, draft: { ...s.draft, trayOpen: true } };
      setTransition({ from: current, to: s, direction: "forward", fromIsTabRoot: isTabRoot, toIsTabRoot: false });
      updateCurrentTabStack((st) => {
        const next = st.slice();
        next[next.length - 1] = updatedAddown;
        next.push(s);
        return next;
      });
      return;
    }
    setTransition({ from: current, to: s, direction: "forward", fromIsTabRoot: isTabRoot, toIsTabRoot: false });
    updateCurrentTabStack((st) => [...st, s]);
  };
  const back = () => {
    if (transition) return;
    if (currentStack.length <= 1) return;
    const prev = currentStack[currentStack.length - 2];
    const prevIsTabRoot = currentStack.length === 2;
    setTransition({ from: current, to: prev, direction: "back", fromIsTabRoot: isTabRoot, toIsTabRoot: prevIsTabRoot });
    updateCurrentTabStack((st) => st.slice(0, -1));
  };
  const replaceRecipeAndBack = (updated, categoryLabel) => {
    if (transition) return;
    if (currentStack.length < 2) return;
    const prevIdx = currentStack.length - 2;
    const prev = currentStack[prevIdx];
    if (prev.name !== "recipe") {
      back();
      return;
    }
    const newPrev = { name: "recipe", recipe: updated, categoryLabel };
    const prevIsTabRoot = currentStack.length === 2;
    setTransition({ from: current, to: newPrev, direction: "back", fromIsTabRoot: isTabRoot, toIsTabRoot: prevIsTabRoot });
    updateCurrentTabStack((st) => {
      const next = st.slice(0, -1);
      next[next.length - 1] = newPrev;
      return next;
    });
  };
  const finishEditCategory = (newLabel) => {
    if (transition) return;
    if (currentStack.length < 2) return;
    const prev = currentStack[currentStack.length - 2];
    if (prev.name !== "recipes") {
      back();
      return;
    }
    const newPrev = { name: "recipes", categoryKey: prev.categoryKey, categoryLabel: newLabel };
    const prevIsTabRoot = currentStack.length === 2;
    setTransition({ from: current, to: newPrev, direction: "back", fromIsTabRoot: isTabRoot, toIsTabRoot: prevIsTabRoot });
    updateCurrentTabStack((st) => {
      const next = st.slice(0, -1);
      next[next.length - 1] = newPrev;
      return next;
    });
  };
  const finishDeleteCategory = () => {
    if (transition) return;
    const idx = (() => {
      for (let i = currentStack.length - 2; i >= 0; i--) {
        if (currentStack[i].name === "categories") return i;
      }
      return -1;
    })();
    if (idx === -1) {
      back();
      return;
    }
    const target = currentStack[idx];
    const targetIsTabRoot = idx === 0;
    setTransition({ from: current, to: target, direction: "back", fromIsTabRoot: isTabRoot, toIsTabRoot: targetIsTabRoot });
    updateCurrentTabStack((st) => st.slice(0, idx + 1));
  };
  const finishDeleteRecipe = () => {
    if (transition) return;
    const idx = (() => {
      for (let i = currentStack.length - 2; i >= 0; i--) {
        if (currentStack[i].name === "recipes") return i;
      }
      return -1;
    })();
    if (idx === -1) {
      back();
      return;
    }
    const target = currentStack[idx];
    const targetIsTabRoot = idx === 0;
    setTransition({ from: current, to: target, direction: "back", fromIsTabRoot: isTabRoot, toIsTabRoot: targetIsTabRoot });
    updateCurrentTabStack((st) => st.slice(0, idx + 1));
  };
  const finishCreateCategoryForRecipe = (catKey, catLabel, draft, returnTo) => {
    if (transition) return;
    if (returnTo === "cook") {
      updateCurrentTabStack((prev) => {
        const newStack = prev.slice(0, -1);
        return [...newStack, { name: "cook", newCategory: { key: catKey, label: catLabel }, draft }];
      });
    } else {
      updateCurrentTabStack((prev) => {
        const newStack = prev.slice(0, -1);
        return [...newStack, {
          name: "addown",
          draft: { ...draft, trayOpen: true, newCategory: { key: catKey, label: catLabel } }
        }];
      });
    }
  };
  const finishSaveRecipe = (recipe, categoryKey, categoryLabel) => {
    if (transition) return;
    const target = { name: "recipe", recipe, categoryLabel };
    setTabStacks((stacks) => ({
      ...stacks,
      build: [{ name: "cook" }],
      // Reset Build tab to root
      recipes: [
        { name: "categories" },
        { name: "recipes", categoryKey, categoryLabel },
        target
      ]
    }));
    setActiveTab("recipes");
  };
  reactExports.useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setTransition(null), DURATION);
    return () => clearTimeout(t);
  }, [transition]);
  const topLevelTransKey = topLevelTransition ? `${topLevelTransition.from}->${topLevelTransition.to}:${topLevelTransition.direction}` : null;
  const [topLevelArmedKey, setTopLevelArmedKey] = reactExports.useState(null);
  const topLevelAnimPhase = topLevelTransKey && topLevelArmedKey !== topLevelTransKey ? "start" : "end";
  reactExports.useEffect(() => {
    if (!topLevelTransKey) {
      if (topLevelArmedKey !== null) setTopLevelArmedKey(null);
      return;
    }
    if (topLevelArmedKey === topLevelTransKey) return;
    let r2 = 0;
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      r2 = requestAnimationFrame(() => {
        if (cancelled) return;
        setTopLevelArmedKey(topLevelTransKey);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [topLevelTransKey, topLevelArmedKey]);
  reactExports.useEffect(() => {
    if (!topLevelTransition) return;
    const t = setTimeout(() => {
      setTopLevelTransition(null);
      if (topLevelTransition.to === "auth") {
        setSession(null);
        setShowOnboarding(null);
      }
    }, DURATION + 20);
    return () => clearTimeout(t);
  }, [topLevelTransition]);
  const handleSignOut = () => {
    setTopLevelTransition({
      from: "app",
      to: "auth",
      direction: "back"
    });
    setAuthScreen("signin");
  };
  const handleAuthSuccess = () => {
  };
  const renderTopLevelView = (view) => {
    if (view === "auth") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        AuthFlow,
        {
          initialScreen: authScreen,
          onSuccess: handleAuthSuccess
        }
      );
    }
    if (view === "onboarding") {
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Onboarding, { onComplete: () => setShowOnboarding(false), profile, onUpdate: updateProfile });
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", position: "relative", background: "#FAF7F2" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ScreenStage,
        {
          current,
          transition,
          push,
          back,
          isTabRoot,
          replaceRecipe: replaceRecipeAndBack,
          finishEditCategory,
          finishDeleteCategory,
          finishDeleteRecipe,
          finishCreateCategoryForRecipe,
          finishSaveRecipe,
          onSignOut: handleSignOut,
          profile,
          updateProfile: async (updates) => updateProfile(updates, session?.user?.id)
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(BottomTabBar, { activeTab, onTabClick: switchToTab })
    ] });
  };
  const getCurrentView = () => {
    if (session === void 0) return null;
    if (session === null) return "auth";
    if (showOnboarding === null) return null;
    if (showOnboarding) return "onboarding";
    return "app";
  };
  const currentView = getCurrentView();
  const layerBase = {
    position: "absolute",
    inset: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#FAF7F2",
    willChange: "transform"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: S.page, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: S.phone, children: currentView === null ? null : topLevelTransition ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#FAF7F2" }, children: (() => {
      const { from, to, direction } = topLevelTransition;
      let fromTransform = "translateX(0)";
      let toTransform = "translateX(0)";
      if (direction === "forward") {
        fromTransform = topLevelAnimPhase === "start" ? "translateX(0)" : "translateX(-25%)";
        toTransform = topLevelAnimPhase === "start" ? "translateX(100%)" : "translateX(0)";
      } else {
        fromTransform = topLevelAnimPhase === "start" ? "translateX(0)" : "translateX(100%)";
        toTransform = topLevelAnimPhase === "start" ? "translateX(-25%)" : "translateX(0)";
      }
      const transitionStyle = topLevelAnimPhase === "start" ? "none" : `transform ${DURATION}ms ${EASE}`;
      const fromZ = direction === "forward" ? 1 : 2;
      const toZ = direction === "forward" ? 2 : 1;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              ...layerBase,
              transform: fromTransform,
              transition: transitionStyle,
              zIndex: fromZ,
              pointerEvents: "none"
            },
            children: renderTopLevelView(from)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              ...layerBase,
              transform: toTransform,
              transition: transitionStyle,
              zIndex: toZ,
              pointerEvents: "none"
            },
            children: renderTopLevelView(to)
          }
        )
      ] });
    })() }) : renderTopLevelView(currentView) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: async () => {
          await updateProfile({ onboarding_complete: false });
          setTabStacks({
            build: [{ name: "cook" }],
            recipes: [{ name: "categories" }],
            menus: [{ name: "occasions" }],
            profile: [{ name: "profile" }]
          });
          setActiveTab("build");
          setShowOnboarding(true);
        },
        style: {
          position: "fixed",
          bottom: 12,
          right: 12,
          zIndex: 9999,
          background: "rgba(12,68,124,0.85)",
          color: "#EEF4F8",
          border: "none",
          borderRadius: 100,
          padding: "6px 12px",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          cursor: "pointer",
          opacity: 0.7
        },
        children: "Reset onboarding"
      }
    )
  ] });
}
function ScreenStage({
  current,
  transition,
  push,
  back,
  isTabRoot,
  replaceRecipe,
  finishEditCategory,
  finishDeleteCategory,
  finishDeleteRecipe,
  finishCreateCategoryForRecipe,
  finishSaveRecipe,
  onSignOut,
  profile,
  updateProfile
}) {
  const transKey = transition ? `${screenKey(transition.from)}->${screenKey(transition.to)}:${transition.direction}` : null;
  const [armedKey, setArmedKey] = reactExports.useState(null);
  const animPhase = transKey && armedKey !== transKey ? "start" : "end";
  reactExports.useEffect(() => {
    if (!transKey) {
      if (armedKey !== null) setArmedKey(null);
      return;
    }
    if (armedKey === transKey) return;
    let r2 = 0;
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      r2 = requestAnimationFrame(() => {
        if (cancelled) return;
        setArmedKey(transKey);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [transKey, armedKey]);
  const layerBase = {
    position: "absolute",
    inset: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#FAF7F2",
    willChange: "transform"
  };
  if (!transition) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { ...layerBase, position: "relative", height: "100%", paddingBottom: 64, background: "#FAF7F2" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { ...layerBase, position: "relative", height: "100%" }, children: renderScreen(current, push, back, isTabRoot, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe, finishSaveRecipe, onSignOut, profile, updateProfile) }) });
  }
  const { from, to, direction } = transition;
  let fromTransform = "translateX(0)";
  let toTransform = "translateX(0)";
  if (direction === "forward") {
    fromTransform = animPhase === "start" ? "translateX(0)" : "translateX(-25%)";
    toTransform = animPhase === "start" ? "translateX(100%)" : "translateX(0)";
  } else {
    fromTransform = animPhase === "start" ? "translateX(0)" : "translateX(100%)";
    toTransform = animPhase === "start" ? "translateX(-25%)" : "translateX(0)";
  }
  const transitionStyle = animPhase === "start" ? "none" : `transform ${DURATION}ms ${EASE}`;
  const fromZ = direction === "forward" ? 1 : 2;
  const toZ = direction === "forward" ? 2 : 1;
  const fromIsTabRoot = transition.fromIsTabRoot ?? isTabRoot;
  const toIsTabRoot = transition.toIsTabRoot ?? isTabRoot;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { position: "relative", height: "100%", background: "#FAF7F2" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { ...layerBase, transform: fromTransform, transition: transitionStyle, zIndex: fromZ, pointerEvents: "none", paddingBottom: 64 }, children: renderScreen(from, push, back, fromIsTabRoot, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe, finishSaveRecipe, onSignOut, profile, updateProfile) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { ...layerBase, transform: toTransform, transition: transitionStyle, zIndex: toZ, pointerEvents: "none", paddingBottom: 64 }, children: renderScreen(to, push, back, toIsTabRoot, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe, finishSaveRecipe, onSignOut, profile, updateProfile) })
  ] });
}
function BottomTabBar({ activeTab, onTabClick }) {
  const tabs = [
    { id: "build", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconChefHat, { size: 22, stroke: 1.5 }), label: "Build" },
    { id: "recipes", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconBook, { size: 22, stroke: 1.5 }), label: "Recipes" },
    { id: "menus", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconLayoutList, { size: 22, stroke: 1.5 }), label: "Menus" },
    { id: "profile", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconUser, { size: 22, stroke: 1.5 }), label: "Profile" }
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      style: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#FAF7F2",
        borderTop: "1px solid rgba(35,60,0,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        padding: "0 8px 6px",
        paddingBottom: "env(safe-area-inset-bottom)",
        zIndex: 100
      },
      children: tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => onTabClick(tab.id),
            style: {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "6px 0 6px",
              color: isActive ? "#233C00" : "rgba(35,60,0,0.25)",
              position: "relative"
            },
            children: [
              tab.icon,
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  style: {
                    fontFamily: "Inter, sans-serif",
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase"
                  },
                  children: tab.label
                }
              ),
              isActive && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "div",
                {
                  style: {
                    position: "absolute",
                    bottom: 2,
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "#233C00"
                  }
                }
              )
            ]
          },
          tab.id
        );
      })
    }
  );
}
function Categories({ push, back, isTabRoot }) {
  const [cats, setCats] = reactExports.useState([]);
  const [recipeCounts, setRecipeCounts] = reactExports.useState({});
  reactExports.useEffect(() => {
    const loadCategories = async () => {
      const categories2 = await getAllCategories();
      setCats(categories2);
    };
    loadCategories();
  }, []);
  reactExports.useEffect(() => {
    const loadCounts = async () => {
      const counts = {};
      for (const cat of cats) {
        const recipes = await getRecipesForCategory(cat.key, "");
        counts[cat.key] = recipes.length;
      }
      setRecipeCounts(counts);
    };
    if (cats.length > 0) {
      loadCounts();
    }
  }, [cats.length]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#233C00" }, children: "Recipes" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => push({ name: "newcategory" }),
          "aria-label": "New category",
          style: {
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "1px solid rgba(35,60,0,0.25)",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer"
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "rgba(35,60,0,0.7)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "5", y1: "12", x2: "19", y2: "12" })
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, overflowY: "auto", padding: "8px 20px 16px" }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gridAutoRows: "160px", gap: 12 }, children: [
      cats.map((c) => {
        const count = recipeCounts[c.key] ?? 0;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            onClick: () => push({ name: "recipes", categoryKey: c.key, categoryLabel: c.label }),
            style: {
              background: "rgba(35,60,0,0.06)",
              border: "1px solid rgba(35,60,0,0.1)",
              borderRadius: 16,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: 16,
              cursor: "pointer"
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: 28, lineHeight: 1 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconBook, { size: 28, stroke: 1.5, color: "rgba(35,60,0,0.2)" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 400, color: "rgba(35,60,0,0.4)" }, children: [
                  count,
                  " ",
                  count === 1 ? "recipe" : "recipes"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#233C00", lineHeight: 1.15 }, children: c.label })
              ] })
            ]
          },
          c.key
        );
      }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          onClick: () => push({ name: "newcategory" }),
          style: {
            background: "rgba(35,60,0,0.04)",
            border: "1px dashed rgba(35,60,0,0.2)",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer"
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "rgba(35,60,0,0.25)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "5", y1: "12", x2: "19", y2: "12" })
          ] })
        }
      )
    ] }) })
  ] });
}
function Recipes({
  categoryKey,
  categoryLabel,
  push,
  back
}) {
  const [recipes, setRecipes] = reactExports.useState([]);
  reactExports.useEffect(() => {
    const loadRecipes = async () => {
      const data = await getRecipesForCategory(categoryKey, categoryLabel);
      setRecipes(data);
    };
    loadRecipes();
  }, [categoryKey, categoryLabel]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { height: 56, display: "flex", alignItems: "center", padding: "0 24px", flexShrink: 0, gap: 12 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: back,
          "aria-label": "Back",
          style: { background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "rgba(35,60,0,0.6)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "15 18 9 12 15 6" }) })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 1 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#233C00" }, children: categoryLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 400, color: "rgba(35,60,0,0.35)" }, children: [
          recipes.length,
          " ",
          recipes.length === 1 ? "recipe" : "recipes"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, overflowY: "auto", padding: "4px 20px 16px", display: "flex", flexDirection: "column", gap: 10 }, children: recipes.map((r, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        onClick: () => push({ name: "recipe", recipe: r, categoryLabel }),
        style: {
          height: 80,
          background: "rgba(35,60,0,0.06)",
          border: "1px solid rgba(35,60,0,0.1)",
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 14,
          flexShrink: 0,
          cursor: "pointer"
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
            width: 40,
            height: 40,
            minWidth: 40,
            borderRadius: 10,
            background: "rgba(35,60,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconBook, { size: 22, stroke: 1.5, color: "rgba(35,60,0,0.2)" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
              fontFamily: "Inter, sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "capitalize",
              color: "#233C00",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }, children: r.title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
              fontFamily: "Fraunces, serif",
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: 12,
              color: "rgba(35,60,0,0.45)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }, children: r.description }),
            r.yield && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
              fontFamily: "Inter, sans-serif",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "rgba(35,60,0,0.25)"
            }, children: r.yield })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flexShrink: 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "rgba(35,60,0,0.2)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "9 18 15 12 9 6" }) }) })
        ]
      },
      i
    )) })
  ] });
}
function RecipeCard({
  recipe,
  categoryLabel,
  back,
  push
}) {
  const [tab, setTab] = reactExports.useState("ingredients");
  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];
  const editable = typeof recipe.savedId === "number";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1, overflowY: "auto" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { padding: "4px 24px 20px", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: back,
            "aria-label": "Back",
            style: { background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "rgba(35,60,0,0.6)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "15 18 9 12 15 6" }) })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 16 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              "aria-label": "Share",
              style: { background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" },
              children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "rgba(35,60,0,0.5)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "18", cy: "5", r: "3" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "6", cy: "12", r: "3" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "18", cy: "19", r: "3" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "8.59", y1: "13.51", x2: "15.42", y2: "17.49" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "15.41", y1: "6.51", x2: "8.59", y2: "10.49" })
              ] })
            }
          ),
          editable && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => push({ name: "addown", editRecipe: recipe, editCategoryLabel: categoryLabel }),
              "aria-label": "Edit",
              style: { background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" },
              children: /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "rgba(35,60,0,0.5)", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" })
              ] })
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "rgba(35,60,0,0.35)",
        marginBottom: 6
      }, children: recipe.category }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
        fontFamily: "Inter, sans-serif",
        fontStyle: "normal",
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "capitalize",
        color: "#233C00",
        lineHeight: 1.1,
        marginBottom: 8
      }, children: recipe.title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
        fontFamily: "Fraunces, serif",
        fontStyle: "italic",
        fontWeight: 300,
        fontSize: 15,
        color: "rgba(35,60,0,0.55)",
        lineHeight: 1.5,
        marginBottom: 18
      }, children: recipe.description }),
      recipe.yield && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", gap: 24 }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 2 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
          fontFamily: "Inter, sans-serif",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "rgba(35,60,0,0.3)"
        }, children: "Yield" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
          fontFamily: "Inter, sans-serif",
          fontSize: 14,
          fontWeight: 500,
          color: "#233C00"
        }, children: recipe.yield })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      display: "flex",
      padding: "20px 24px 0",
      flexShrink: 0,
      gap: 28,
      borderBottom: "1px solid rgba(35,60,0,0.08)",
      position: "sticky",
      top: 0,
      zIndex: 10,
      background: "#FAF7F2"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setTab("ingredients"),
          style: {
            paddingBottom: 12,
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: tab === "ingredients" ? "#233C00" : "rgba(35,60,0,0.3)",
            position: "relative",
            cursor: "pointer",
            background: "transparent",
            border: "none"
          },
          children: [
            "Ingredients",
            tab === "ingredients" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
              position: "absolute",
              bottom: -1,
              left: 0,
              right: 0,
              height: 1.5,
              background: "#233C00",
              borderRadius: 2
            } })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setTab("steps"),
          style: {
            paddingBottom: 12,
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: tab === "steps" ? "#233C00" : "rgba(35,60,0,0.3)",
            position: "relative",
            cursor: "pointer",
            background: "transparent",
            border: "none"
          },
          children: [
            "Steps",
            tab === "steps" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
              position: "absolute",
              bottom: -1,
              left: 0,
              right: 0,
              height: 1.5,
              background: "#233C00",
              borderRadius: 2
            } })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { paddingTop: 4 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: tab === "ingredients" ? "block" : "none" }, children: [
        ingredients.map((i, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          padding: "12px 24px",
          borderBottom: idx === ingredients.length - 1 ? "none" : "1px dotted rgba(35,60,0,0.1)"
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
            fontFamily: "Inter, sans-serif",
            fontSize: 15,
            fontWeight: 400,
            color: "#233C00",
            textAlign: "left",
            flex: 1,
            maxWidth: "58%"
          }, children: i.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
            color: "rgba(35,60,0,0.4)",
            textAlign: "right",
            flexShrink: 0,
            maxWidth: "40%"
          }, children: i.qty })
        ] }, idx)),
        ingredients.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: {
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          color: "rgba(35,60,0,0.4)",
          padding: "20px 24px"
        }, children: "No ingredients yet." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: tab === "steps" ? "block" : "none", padding: "20px 24px" }, children: [
        steps.map((s, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          marginBottom: idx === steps.length - 1 ? 0 : 20
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
            fontFamily: "Inter, sans-serif",
            fontSize: 18,
            fontWeight: 500,
            color: "rgba(35,60,0,0.3)",
            flexShrink: 0,
            lineHeight: 1.4
          }, children: idx + 1 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: {
            fontFamily: "Inter, sans-serif",
            fontSize: 14,
            color: "#233C00",
            lineHeight: 1.6,
            margin: 0
          }, children: s })
        ] }, idx)),
        steps.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { style: {
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          color: "rgba(35,60,0,0.4)"
        }, children: "No steps yet." })
      ] })
    ] })
  ] }) });
}
function Placeholder({ title, back }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { padding: "32px 24px 14px", flexShrink: 0 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: back, "aria-label": "Back", style: { background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#185FA5", display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(BackArrow, {}) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 700, textTransform: "uppercase", color: "#042C53" }, children: title })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, flexDirection: "column", gap: 16 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: 32, height: 1, background: "#85B7EB" } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: "#042C53", textAlign: "center" }, children: "coming soon" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: 12, color: "#185FA5", letterSpacing: "0.04em" }, children: "we're still simmering this one." })
    ] })
  ] });
}
function BackArrow() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19 12H5" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 19l-7-7 7-7" })
  ] });
}
function Cook({ back, push, finishSaveRecipe, screen, isTabRoot, profile, onUpdate }) {
  const [trayOpen, setTrayOpen] = reactExports.useState(!!screen.newCategory);
  const [newCategorySelection, setNewCategorySelection] = reactExports.useState(screen.newCategory || null);
  const [messages, setMessages] = reactExports.useState([]);
  const [typing, setTyping] = reactExports.useState(false);
  const [input, setInput] = reactExports.useState("");
  const [recipeRevealed, setRecipeRevealed] = reactExports.useState(!!screen.draft);
  const [miniBarVisible, setMiniBarVisible] = reactExports.useState(!!screen.draft);
  const [miniTitleVisible, setMiniTitleVisible] = reactExports.useState(!!screen.draft);
  const [expanded, setExpanded] = reactExports.useState(false);
  const [generatingRecipe, setGeneratingRecipe] = reactExports.useState(false);
  const [currentRecipe, setCurrentRecipe] = reactExports.useState(screen.draft || null);
  const [conversationHistory, setConversationHistory] = reactExports.useState([]);
  const [recipePulse, setRecipePulse] = reactExports.useState(false);
  const scrollRef = reactExports.useRef(null);
  const bottomBarRef = reactExports.useRef(null);
  const [bottomBarHeight, setBottomBarHeight] = reactExports.useState(0);
  const idRef = reactExports.useRef(0);
  reactExports.useRef(null);
  reactExports.useEffect(() => {
    const measure = () => {
      if (bottomBarRef.current) setBottomBarHeight(bottomBarRef.current.offsetHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [recipeRevealed]);
  reactExports.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing, miniBarVisible]);
  reactExports.useEffect(() => {
    if (recipePulse) {
      const timer = setTimeout(() => setRecipePulse(false), 800);
      return () => clearTimeout(timer);
    }
  }, [recipePulse]);
  const sendMessage = async () => {
    if (!input.trim() || typing) return;
    if (expanded) {
      setExpanded(false);
    }
    const userText = input.trim();
    const userMsg = { id: ++idRef.current, role: "user", text: userText };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    setGeneratingRecipe(false);
    const updatedHistory = [...conversationHistory, { role: "user", content: userText }];
    setConversationHistory(updatedHistory);
    const palate = profile?.palate || "";
    const inspiration = profile?.inspiration || "";
    const constraints = profile?.constraints || "";
    try {
      console.log("Calling AI chat API...");
      const supabaseAnonKey2 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6cG1tdGhyZWV5c2NpZGh3cml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MzMwNDcsImV4cCI6MjA5NTIwOTA0N30.0lb3IjdLp2V9usQW9TLVucxEwnrKpL2uEXO0FQ8ldAo";
      if (!supabaseAnonKey2) ;
      const systemPrompt = `You are the cooking assistant inside Tipsy Dinner, a personal recipe app. Your job is to help the user figure out what they want to make, then create a recipe once they've landed on something. Think of yourself as a knowledgeable friend who happens to be standing in the kitchen with them — confident, direct, and warm, but never performative or gushing.
Your two modes:
Brainstorm mode — helping the user land on a dish. Stay here until they've chosen something specific and want a recipe built.
Recipe mode — only enter this when the user has chosen a specific dish and indicated they want the recipe. Never jump here early.
Brainstorm mode rules:
If the request is broad or the cuisine direction is still open, ask one focused question before offering suggestions. Broad means anything where cuisine type, protein, occasion, or dietary direction is still unknown. Do not offer suggestions until you have enough to make them meaningful.
Once you have enough to go on, always open with one short natural line before the suggestions — something like 'a few ideas' or 'here's where I'd go' — then offer three to five specific, concrete suggestions. Never lead directly with a bolded dish name. There must always be a line of prose before the list. Not "a pasta dish" but "cacio e pepe with lemon zest." Make them sound genuinely good. Format each suggestion with the dish name in bold, followed by an em dash, then the description on the same line. Example: **Grilled little gem wedges** — halved, charred face-down until edges crisp, hit with olive oil and flaky salt. Never bold full sentences or descriptive copy — only the dish name itself.
If the user says "show me more," offer another round of equally specific suggestions in the same format.
Close each round of suggestions with a short directional question. Vary the phrasing. Never use the same closing line twice in a conversation.
If the user gives you a very short or one-word answer and it's enough to go on, acknowledge it briefly in one short phrase before moving into suggestions — something like 'good call' or 'light bites it is' — then go straight into the list. Only ask a follow-up if the answer genuinely isn't enough to proceed.
When the user lands on a dish, confirm and move to recipe mode. If they pick more than one dish, start with one and sequence them — never build multiple recipes at once.
Recipe mode rules:
Only enter recipe mode when the user has chosen a specific dish and wants it built.
Open with a natural one to two sentence handoff before the ingredient list. This is the moment to sound most like a person. Never lead cold with an ingredient list.
Format: dish title, one-line description, then ingredients and steps. Ingredients as a clean list. Steps in plain prose, not numbered bullets.
When updating a recipe based on user feedback, always confirm it with a short natural line above the updated recipe block — something like 'done, doubled below' or 'updated the recipe below.' Never let an updated recipe block appear with no text above it. No re-explanation of what changed unless the user asks.
Technique and tangent questions:
Answer wine pairing, technique, equipment, and any other cooking questions naturally as part of the conversation. Never preface these with a comment about what kind of question it is. Just answer it like a person would.
Do not trigger a recipe card update for conversational tangents. Only update the card when the user is explicitly iterating on the recipe itself.
General rules:
No markdown formatting except bold for dish names in brainstorm lists. Never use asterisks for anything other than bolding item names in lists. No headers, no bullet points in responses. Plain conversational prose everywhere else.
Never pepper the user with questions. One question maximum before committing to something useful.
Anchor to the user's stated parameters throughout the entire conversation. If they say light and summery, every suggestion stays light and summery until they explicitly change direction.
Never acknowledge what type of question is being asked. Never categorize a request before answering it. Just answer.
Never reference the user's profile explicitly. Let it shape every suggestion invisibly.
User profile:
Palate: ${palate || "Not specified"}
Inspiration: ${inspiration || "Not specified"}
Constraints: ${constraints || "Not specified"}
When you are ready to present a recipe, use this exact format:

<recipe>
<title>Recipe Title Here</title>
<description>One-sentence description</description>
<ingredients>
<item><name>Ingredient name</name><qty>Amount</qty></item>
<item><name>Another ingredient</name><qty>Amount</qty></item>
</ingredients>
<steps>
<step>First step instructions</step>
<step>Second step instructions</step>
</steps>
</recipe>

Use this format every time a recipe is created or updated. Never deviate from it. The text above the recipe block should always be a natural one to two sentence handoff as described above — never let the recipe block appear with no text above it.

In the recipe JSON, the ingredient name field must contain only the ingredient name — never include quantity, amount, or preparation notes in the name field. All quantity information including amount, unit, and preparation notes must go in the quantity field only.`;
      const response = await fetch(
        "https://xzpmmthreeyscidhwriv.supabase.co/functions/v1/ai-chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey2}`
          },
          body: JSON.stringify({
            messages: updatedHistory,
            systemPrompt
          })
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edge Function error: ${errorText}`);
      }
      const stream = parseSSEStream(response);
      setTyping(false);
      const aiMessageId = ++idRef.current;
      setMessages((m) => [...m, { id: aiMessageId, role: "ai", text: "" }]);
      let fullText = "";
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          fullText += chunk.delta.text;
          if (!generatingRecipe && fullText.includes("<recipe>")) {
            setGeneratingRecipe(true);
          }
          let displayText2 = fullText;
          displayText2 = displayText2.replace(/<recipe>[\s\S]*?<\/recipe>/g, "");
          const recipeStartIndex = displayText2.indexOf("<recipe>");
          if (recipeStartIndex !== -1) {
            displayText2 = displayText2.substring(0, recipeStartIndex);
          }
          displayText2 = displayText2.trim();
          setMessages((m) => m.map(
            (msg) => msg.id === aiMessageId ? { ...msg, text: displayText2 } : msg
          ));
        }
      }
      console.log("Anthropic response received");
      if (!fullText) {
        throw new Error("Empty response from API");
      }
      const recipeMatch = fullText.match(/<recipe>([\s\S]*?)<\/recipe>/);
      let parsedRecipe = null;
      if (recipeMatch) {
        const recipeXml = recipeMatch[1];
        const titleMatch = recipeXml.match(/<title>(.*?)<\/title>/);
        const descMatch = recipeXml.match(/<description>(.*?)<\/description>/);
        const ingredientsMatch = recipeXml.match(/<ingredients>([\s\S]*?)<\/ingredients>/);
        const stepsMatch = recipeXml.match(/<steps>([\s\S]*?)<\/steps>/);
        const ingredients = [];
        if (ingredientsMatch) {
          const itemMatches = [
            ...ingredientsMatch[1].matchAll(
              /<item>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<qty>(.*?)<\/qty>[\s\S]*?<\/item>/g
            )
          ];
          for (const match of itemMatches) {
            ingredients.push({ name: match[1].trim(), qty: match[2].trim() });
          }
        }
        const steps = [];
        if (stepsMatch) {
          const stepMatches = [...stepsMatch[1].matchAll(/<step>(.*?)<\/step>/g)];
          for (const match of stepMatches) {
            steps.push(match[1].trim());
          }
        }
        if (titleMatch && descMatch && ingredients.length > 0 && steps.length > 0) {
          parsedRecipe = {
            title: titleMatch[1].trim(),
            description: descMatch[1].trim(),
            ingredients,
            steps
          };
          console.log("Recipe parsed:", parsedRecipe.title);
        }
      }
      const displayText = fullText.replace(/<recipe>[\s\S]*?<\/recipe>/g, "").trim();
      setMessages((m) => m.map(
        (msg) => msg.id === aiMessageId ? { ...msg, text: displayText || "..." } : msg
      ));
      setConversationHistory([...updatedHistory, { role: "assistant", content: fullText }]);
      if (parsedRecipe) {
        setCurrentRecipe(parsedRecipe);
        setGeneratingRecipe(false);
        if (!recipeRevealed) {
          setRecipeRevealed(true);
          setTimeout(() => {
            setMiniBarVisible(true);
            setTimeout(() => {
              setMiniTitleVisible(true);
              setRecipePulse(true);
            }, 200);
          }, 300);
        } else {
          setMiniBarVisible(true);
          setMiniTitleVisible(true);
          setRecipePulse(true);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setTyping(false);
      setGeneratingRecipe(false);
      setMessages((m) => [
        ...m,
        {
          id: ++idRef.current,
          role: "ai",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
        }
      ]);
    }
  };
  const onPickCategory = async (catKey, catLabel, menuInfo) => {
    if (!currentRecipe) return;
    const recipeId = await saveRecipe({
      id: Date.now(),
      title: currentRecipe.title,
      description: currentRecipe.description,
      category: catKey,
      ingredients: currentRecipe.ingredients,
      steps: currentRecipe.steps,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }, "ai", catKey);
    if (menuInfo) {
      await addRecipeToMenuSection(menuInfo.menuId, menuInfo.section, recipeId);
    }
    const recipe = {
      title: currentRecipe.title,
      description: currentRecipe.description,
      color: "linear-gradient(135deg, #C5DCF4 0%, #85B7EB 100%)",
      category: catLabel.toLowerCase(),
      ingredients: currentRecipe.ingredients,
      steps: currentRecipe.steps,
      savedId: recipeId,
      categoryKey: catKey
    };
    setTrayOpen(false);
    finishSaveRecipe(recipe, catKey, catLabel);
  };
  const onPickNewCategory = () => {
    if (!currentRecipe) return;
    setTrayOpen(false);
    push({
      name: "newcategoryforrecipe",
      draft: {
        title: currentRecipe.title,
        description: currentRecipe.description,
        ingredients: currentRecipe.ingredients,
        steps: currentRecipe.steps
      },
      returnTo: "cook"
    });
  };
  const isEmpty = messages.length === 0;
  const placeholder = "ask anything";
  const handleChipClick = (text) => {
    if (typing) return;
    const userText = text.trim();
    const userMsg = { id: ++idRef.current, role: "user", text: userText };
    setMessages((m) => [...m, userMsg]);
    setTyping(true);
    setGeneratingRecipe(false);
    const updatedHistory = [...conversationHistory, { role: "user", content: userText }];
    setConversationHistory(updatedHistory);
    const palate = profile?.palate || "";
    const inspiration = profile?.inspiration || "";
    const constraints = profile?.constraints || "";
    (async () => {
      try {
        const supabaseAnonKey2 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6cG1tdGhyZWV5c2NpZGh3cml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MzMwNDcsImV4cCI6MjA5NTIwOTA0N30.0lb3IjdLp2V9usQW9TLVucxEwnrKpL2uEXO0FQ8ldAo";
        if (!supabaseAnonKey2) ;
        const systemPrompt = `You are the cooking assistant inside Tipsy Dinner, a personal recipe app. Your job is to help the user figure out what they want to make, then create a recipe once they've landed on something. Think of yourself as a knowledgeable friend who happens to be standing in the kitchen with them — confident, direct, and warm, but never performative or gushing.
Your two modes:
Brainstorm mode — helping the user land on a dish. Stay here until they've chosen something specific and want a recipe built.
Recipe mode — only enter this when the user has chosen a specific dish and indicated they want the recipe. Never jump here early.
Brainstorm mode rules:
If the request is broad or the cuisine direction is still open, ask one focused question before offering suggestions. Broad means anything where cuisine type, protein, occasion, or dietary direction is still unknown. Do not offer suggestions until you have enough to make them meaningful.
Once you have enough to go on, always open with one short natural line before the suggestions — something like 'a few ideas' or 'here's where I'd go' — then offer three to five specific, concrete suggestions. Never lead directly with a bolded dish name. There must always be a line of prose before the list. Not "a pasta dish" but "cacio e pepe with lemon zest." Make them sound genuinely good. Format each suggestion with the dish name in bold, followed by an em dash, then the description on the same line. Example: **Grilled little gem wedges** — halved, charred face-down until edges crisp, hit with olive oil and flaky salt. Never bold full sentences or descriptive copy — only the dish name itself.
If the user says "show me more," offer another round of equally specific suggestions in the same format.
Close each round of suggestions with a short directional question. Vary the phrasing. Never use the same closing line twice in a conversation.
If the user gives you a very short or one-word answer and it's enough to go on, acknowledge it briefly in one short phrase before moving into suggestions — something like 'good call' or 'light bites it is' — then go straight into the list. Only ask a follow-up if the answer genuinely isn't enough to proceed.
When the user lands on a dish, confirm and move to recipe mode. If they pick more than one dish, start with one and sequence them — never build multiple recipes at once.
Recipe mode rules:
Only enter recipe mode when the user has chosen a specific dish and wants it built.
Open with a natural one to two sentence handoff before the ingredient list. This is the moment to sound most like a person. Never lead cold with an ingredient list.
Format: dish title, one-line description, then ingredients and steps. Ingredients as a clean list. Steps in plain prose, not numbered bullets.
When updating a recipe based on user feedback, always confirm it with a short natural line above the updated recipe block — something like 'done, doubled below' or 'updated the recipe below.' Never let an updated recipe block appear with no text above it. No re-explanation of what changed unless the user asks.
Technique and tangent questions:
Answer wine pairing, technique, equipment, and any other cooking questions naturally as part of the conversation. Never preface these with a comment about what kind of question it is. Just answer it like a person would.
Do not trigger a recipe card update for conversational tangents. Only update the card when the user is explicitly iterating on the recipe itself.
General rules:
No markdown formatting except bold for dish names in brainstorm lists. Never use asterisks for anything other than bolding item names in lists. No headers, no bullet points in responses. Plain conversational prose everywhere else.
Never pepper the user with questions. One question maximum before committing to something useful.
Anchor to the user's stated parameters throughout the entire conversation. If they say light and summery, every suggestion stays light and summery until they explicitly change direction.
Never acknowledge what type of question is being asked. Never categorize a request before answering it. Just answer.
Never reference the user's profile explicitly. Let it shape every suggestion invisibly.
User profile:
Palate: ${palate || "Not specified"}
Inspiration: ${inspiration || "Not specified"}
Constraints: ${constraints || "Not specified"}
When you are ready to present a recipe, use this exact format:

<recipe>
<title>Recipe Title Here</title>
<description>One-sentence description</description>
<ingredients>
<item><name>Ingredient name</name><qty>Amount</qty></item>
<item><name>Another ingredient</name><qty>Amount</qty></item>
</ingredients>
<steps>
<step>First step instructions</step>
<step>Second step instructions</step>
</steps>
</recipe>

Use this format every time a recipe is created or updated. Never deviate from it. The text above the recipe block should always be a natural one to two sentence handoff as described above — never let the recipe block appear with no text above it.

In the recipe JSON, the ingredient name field must contain only the ingredient name — never include quantity, amount, or preparation notes in the name field. All quantity information including amount, unit, and preparation notes must go in the quantity field only.`;
        const response = await fetch(
          "https://xzpmmthreeyscidhwriv.supabase.co/functions/v1/ai-chat",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseAnonKey2}`
            },
            body: JSON.stringify({
              messages: updatedHistory,
              systemPrompt
            })
          }
        );
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Edge Function error: ${errorText}`);
        }
        const stream = parseSSEStream(response);
        setTyping(false);
        const aiMessageId = ++idRef.current;
        setMessages((m) => [...m, { id: aiMessageId, role: "ai", text: "" }]);
        let fullText = "";
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            fullText += chunk.delta.text;
            if (!generatingRecipe && fullText.includes("<recipe>")) {
              setGeneratingRecipe(true);
            }
            let displayText2 = fullText;
            displayText2 = displayText2.replace(/<recipe>[\s\S]*?<\/recipe>/g, "");
            const recipeStartIndex = displayText2.indexOf("<recipe>");
            if (recipeStartIndex !== -1) {
              displayText2 = displayText2.substring(0, recipeStartIndex);
            }
            displayText2 = displayText2.trim();
            setMessages((m) => m.map(
              (msg) => msg.id === aiMessageId ? { ...msg, text: displayText2 } : msg
            ));
          }
        }
        if (!fullText) {
          throw new Error("Empty response from API");
        }
        const recipeMatch = fullText.match(/<recipe>([\s\S]*?)<\/recipe>/);
        let parsedRecipe = null;
        if (recipeMatch) {
          const recipeXml = recipeMatch[1];
          const titleMatch = recipeXml.match(/<title>(.*?)<\/title>/);
          const descMatch = recipeXml.match(/<description>(.*?)<\/description>/);
          const ingredientsMatch = recipeXml.match(/<ingredients>([\s\S]*?)<\/ingredients>/);
          const stepsMatch = recipeXml.match(/<steps>([\s\S]*?)<\/steps>/);
          const ingredients = [];
          if (ingredientsMatch) {
            const itemMatches = [
              ...ingredientsMatch[1].matchAll(
                /<item>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<qty>(.*?)<\/qty>[\s\S]*?<\/item>/g
              )
            ];
            for (const match of itemMatches) {
              ingredients.push({ name: match[1].trim(), qty: match[2].trim() });
            }
          }
          const steps = [];
          if (stepsMatch) {
            const stepMatches = [...stepsMatch[1].matchAll(/<step>(.*?)<\/step>/g)];
            for (const match of stepMatches) {
              steps.push(match[1].trim());
            }
          }
          if (titleMatch && descMatch && ingredients.length > 0 && steps.length > 0) {
            parsedRecipe = {
              title: titleMatch[1].trim(),
              description: descMatch[1].trim(),
              ingredients,
              steps
            };
          }
        }
        const displayText = fullText.replace(/<recipe>[\s\S]*?<\/recipe>/g, "").trim();
        setMessages((m) => m.map(
          (msg) => msg.id === aiMessageId ? { ...msg, text: displayText || "..." } : msg
        ));
        setConversationHistory([...updatedHistory, { role: "assistant", content: fullText }]);
        if (parsedRecipe) {
          setCurrentRecipe(parsedRecipe);
          setGeneratingRecipe(false);
          if (!recipeRevealed) {
            setRecipeRevealed(true);
            setTimeout(() => {
              setMiniBarVisible(true);
              setTimeout(() => {
                setMiniTitleVisible(true);
                setRecipePulse(true);
              }, 200);
            }, 300);
          } else {
            setMiniBarVisible(true);
            setMiniTitleVisible(true);
            setRecipePulse(true);
          }
        }
      } catch (error) {
        console.error("Error sending message:", error);
        setTyping(false);
        setGeneratingRecipe(false);
        setMessages((m) => [
          ...m,
          {
            id: ++idRef.current,
            role: "ai",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
          }
        ]);
      }
    })();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", position: "relative", background: "#FAF7F2" }, children: [
    !expanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 0 24px", flexShrink: 0, position: "relative", zIndex: 1 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: "flex", alignItems: "center" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "img",
        {
          src: watermarkCircle,
          alt: "Tipsy Dinner",
          style: {
            height: 36,
            width: "auto",
            display: "block"
          }
        }
      ) }),
      isEmpty && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => push({ name: "addown" }),
          style: {
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(35,60,0,0.6)",
            border: "1px solid rgba(35,60,0,0.2)",
            borderRadius: 20,
            padding: "7px 14px",
            background: "transparent",
            cursor: "pointer",
            fontFamily: "Inter, sans-serif"
          },
          children: "Write a recipe"
        }
      )
    ] }),
    isEmpty ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 32px 20px", position: "relative", zIndex: 1 }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
        fontFamily: "Inter, sans-serif",
        fontStyle: "normal",
        fontSize: 30,
        fontWeight: 300,
        color: "#233C00",
        textTransform: "lowercase",
        lineHeight: 1.1,
        textAlign: "center"
      }, children: [
        "what's on",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "the menu?"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
        flexShrink: 0,
        display: "flex",
        flexDirection: "row",
        overflowX: "auto",
        padding: "0 20px 8px",
        position: "relative",
        zIndex: 1,
        gap: 12,
        WebkitOverflowScrolling: "touch"
      }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => handleChipClick("Brainstorm sides for grilled ribeye"),
            style: {
              minWidth: 200,
              height: 72,
              background: "rgba(35,60,0,0.06)",
              border: "1px solid rgba(35,60,0,0.1)",
              borderRadius: 16,
              padding: "14px 16px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              gap: 4,
              flexShrink: 0
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: "Inter, sans-serif",
                fontWeight: 700,
                fontSize: 15,
                color: "#233C00",
                lineHeight: 1.2
              }, children: "Brainstorm" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: "Fraunces, serif",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: 13,
                color: "rgba(35,60,0,0.55)",
                lineHeight: 1.2
              }, children: "sides for grilled ribeye" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => handleChipClick("Help me decide on dinner"),
            style: {
              minWidth: 200,
              height: 72,
              background: "rgba(35,60,0,0.06)",
              border: "1px solid rgba(35,60,0,0.1)",
              borderRadius: 16,
              padding: "14px 16px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              gap: 4,
              flexShrink: 0
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: "Inter, sans-serif",
                fontWeight: 700,
                fontSize: 15,
                color: "#233C00",
                lineHeight: 1.2
              }, children: "Help" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: "Fraunces, serif",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: 13,
                color: "rgba(35,60,0,0.55)",
                lineHeight: 1.2
              }, children: "me decide on dinner" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => handleChipClick("Elevate my bolognese recipe"),
            style: {
              minWidth: 200,
              height: 72,
              background: "rgba(35,60,0,0.06)",
              border: "1px solid rgba(35,60,0,0.1)",
              borderRadius: 16,
              padding: "14px 16px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              gap: 4,
              flexShrink: 0
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: "Inter, sans-serif",
                fontWeight: 700,
                fontSize: 15,
                color: "#233C00",
                lineHeight: 1.2
              }, children: "Elevate" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: "Fraunces, serif",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: 13,
                color: "rgba(35,60,0,0.55)",
                lineHeight: 1.2
              }, children: "my bolognese recipe" })
            ]
          }
        )
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: scrollRef, style: { flex: 1, overflowY: "auto", padding: "48px 20px 12px", display: "flex", flexDirection: "column", gap: 20, position: "relative", zIndex: 1 }, children: [
      messages.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(ChatBubble, { role: m.role, text: m.text }, m.id)),
      typing && /* @__PURE__ */ jsxRuntimeExports.jsx(TypingBubble, {}),
      generatingRecipe && /* @__PURE__ */ jsxRuntimeExports.jsx(RecipeGeneratingIndicator, {})
    ] }),
    currentRecipe && /* @__PURE__ */ jsxRuntimeExports.jsx(
      ExpandedRecipeOverlay,
      {
        open: expanded,
        bottomOffset: bottomBarHeight,
        onSave: () => setTrayOpen(true),
        recipe: currentRecipe
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: bottomBarRef, style: { flexShrink: 0, position: "relative", zIndex: 60 }, children: [
      recipeRevealed && currentRecipe && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          onClick: () => setExpanded((v) => !v),
          style: {
            background: "#FAF7F2",
            borderTop: "1px solid rgba(35,60,0,0.08)",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            cursor: "pointer",
            opacity: !miniBarVisible ? 0 : generatingRecipe && recipeRevealed ? 0.5 : 1,
            transition: generatingRecipe ? "opacity 300ms ease" : "opacity 600ms ease",
            boxShadow: recipePulse ? "0 0 0 rgba(42, 78, 90, 0)" : "0 0 0 rgba(42, 78, 90, 0)",
            animation: recipePulse ? "tipsyRecipePulse 800ms ease-out" : "none"
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "img",
              {
                src: watermarkSquare,
                alt: "",
                style: {
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  display: "block",
                  border: "none",
                  background: "none"
                }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
              flex: 1,
              overflow: "hidden",
              opacity: miniTitleVisible ? 1 : 0,
              transition: "opacity 150ms ease"
            }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: "Inter, sans-serif",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "rgba(35,60,0,0.35)",
                fontWeight: 500
              }, children: "Recipe ready" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                fontFamily: "Inter, sans-serif",
                fontSize: 15,
                color: "#233C00",
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }, children: currentRecipe.title })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { color: "rgba(35,60,0,0.35)", fontSize: 18, flexShrink: 0, lineHeight: 1 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: expanded ? "6 9 12 15 18 9" : "18 15 12 9 6 15" }) }) })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `
          @keyframes tipsyRecipePulse {
            0% {
              box-shadow: 0 0 0 0 rgba(42, 78, 90, 0.4);
            }
            50% {
              box-shadow: 0 0 20px 8px rgba(42, 78, 90, 0.3);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(42, 78, 90, 0);
            }
          }
        ` }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        CookInputBar,
        {
          value: input,
          onChange: setInput,
          onSend: sendMessage,
          placeholder,
          disabled: typing
        }
      )
    ] }),
    trayOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
      SaveRecipeFlow,
      {
        onClose: () => {
          setTrayOpen(false);
          setNewCategorySelection(null);
        },
        onPick: onPickCategory,
        onNew: onPickNewCategory,
        initialSelectedCategory: newCategorySelection
      }
    )
  ] });
}
function ChatBubble({ role, text }) {
  const isUser = role === "user";
  const renderMarkdown = (text2) => {
    const lines = text2.split("\n");
    const elements = [];
    let key = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        const num = numberedMatch[1];
        const content = numberedMatch[2];
        elements.push(
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8, marginBottom: 8 }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { fontWeight: 500, flexShrink: 0 }, children: [
              num,
              "."
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { dangerouslySetInnerHTML: { __html: content.replace(/\*\*(.+?)\*\*/g, '<span style="font-weight: 700; font-family: Inter, sans-serif; color: #233C00">$1</span>') } })
          ] }, key++)
        );
        continue;
      }
      if (line.trim()) {
        const html = line.replace(/\*\*(.+?)\*\*/g, '<span style="font-weight: 700; font-family: Inter, sans-serif; color: #233C00">$1</span>');
        elements.push(
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { marginBottom: i < lines.length - 1 ? 8 : 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { dangerouslySetInnerHTML: { __html: html } }) }, key++)
        );
      } else if (i < lines.length - 1) {
        elements.push(/* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { height: 8 } }, key++));
      }
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: elements });
  };
  if (isUser) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        style: {
          alignSelf: "flex-end",
          background: "#233C00",
          color: "#FEE7C0",
          fontFamily: "Inter, sans-serif",
          fontSize: 15,
          padding: "11px 16px",
          borderRadius: "18px 18px 4px 18px",
          maxWidth: "72%",
          lineHeight: 1.4,
          animation: "tipsyChatIn 300ms ease"
        },
        children: [
          text,
          /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `@keyframes tipsyChatIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }` })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      style: {
        alignSelf: "flex-start",
        color: "#233C00",
        fontFamily: "Inter, sans-serif",
        fontWeight: 400,
        fontSize: 15,
        maxWidth: "88%",
        lineHeight: 1.55,
        padding: "4px 0",
        animation: "tipsyChatIn 300ms ease"
      },
      children: [
        renderMarkdown(text),
        /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `@keyframes tipsyChatIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }` })
      ]
    }
  );
}
function TypingBubble() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
    alignSelf: "flex-start",
    display: "flex",
    gap: 4,
    alignItems: "center",
    padding: "4px 0"
  }, children: [
    [0, 1, 2].map((i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        style: {
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "rgba(35,60,0,0.5)",
          display: "inline-block",
          animation: `tipsyDot 1.2s ease-in-out ${i * 0.2}s infinite`
        }
      },
      i
    )),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `@keyframes tipsyDot { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }` })
  ] });
}
function RecipeGeneratingIndicator() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
    alignSelf: "flex-start",
    display: "flex",
    gap: 4,
    alignItems: "center",
    padding: "4px 0"
  }, children: [
    [0, 1, 2].map((i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        style: {
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: "rgba(35,60,0,0.5)",
          display: "inline-block",
          animation: `tipsyRecipeDot 1.4s ease-in-out ${i * 0.25}s infinite`
        }
      },
      i
    )),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `@keyframes tipsyRecipeDot { 0%,100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 0.8; transform: scale(1.1); } }` })
  ] });
}
function CookInputBar({ value, onChange, onSend, placeholder, disabled }) {
  const textareaRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 168);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [value]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { padding: "8px 16px 12px", flexShrink: 0, background: "#FAF7F2", borderTop: "1px solid rgba(35,60,0,0.08)", position: "relative", zIndex: 1, margin: 0, boxShadow: "none" }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    background: "rgba(35,60,0,0.05)",
    border: "1px solid rgba(35,60,0,0.1)",
    borderRadius: 26,
    padding: "10px 16px",
    gap: 10
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "textarea",
      {
        ref: textareaRef,
        value,
        onChange: (e) => onChange(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        },
        placeholder,
        rows: 1,
        className: "tipsy-input",
        style: {
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          fontFamily: "Inter, sans-serif",
          fontSize: 15,
          color: "#233C00",
          resize: "none",
          overflowY: "auto",
          maxHeight: 168,
          lineHeight: 1.4,
          padding: 0
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `
          .tipsy-input::placeholder {
            color: rgba(35,60,0,0.3);
          }
        ` }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onSend,
        disabled,
        "aria-label": "Send",
        style: {
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: value.trim() ? "#1E3A42" : "rgba(35,60,0,0.08)",
          border: "none",
          cursor: disabled ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          opacity: disabled ? 0.5 : 1
        },
        children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: value.trim() ? "#FEE7C0" : "rgba(35,60,0,0.3)", stroke: "none", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2 12L22 2L15 22L11 13L2 12Z" }) })
      }
    )
  ] }) });
}
function ExpandedRecipeOverlay({ open, bottomOffset, onSave, recipe }) {
  const [tab, setTab] = reactExports.useState("ingredients");
  const [mounted, setMounted] = reactExports.useState(open);
  const [shown, setShown] = reactExports.useState(false);
  const [contentVisible, setContentVisible] = reactExports.useState(false);
  const scrollRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      const t = setTimeout(() => setContentVisible(true), 350);
      return () => clearTimeout(t);
    } else if (mounted) {
      setContentVisible(false);
      setShown(false);
      const t = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);
  if (!mounted) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      style: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: bottomOffset,
        top: 0,
        pointerEvents: shown ? "auto" : "none",
        zIndex: 50,
        overflow: "hidden"
      },
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          style: {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: shown ? "100%" : 0,
            background: "#FAF7F2",
            transition: "height 350ms cubic-bezier(0.22, 1, 0.36, 1)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
            opacity: contentVisible ? 1 : 0,
            transition: "opacity 200ms ease",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            background: "#FAF7F2"
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { padding: "20px 16px 12px", flexShrink: 0, display: "grid", gridTemplateColumns: "32px 1fr 32px", alignItems: "center", background: "#FAF7F2" }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", {}),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                textAlign: "center",
                fontFamily: "Inter, sans-serif",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "rgba(35,60,0,0.35)",
                fontWeight: 500
              }, children: "RECIPE PREVIEW" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", {})
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: scrollRef, style: { flex: 1, overflowY: "auto" }, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { height: 120, background: "#FAF7F2" } }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { padding: "16px 24px 14px" }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "rgba(35,60,0,0.35)",
                  marginBottom: 6,
                  fontWeight: 500
                }, children: "Recipe" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                  fontFamily: "Inter, sans-serif",
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#233C00",
                  lineHeight: 1.1,
                  marginBottom: 8,
                  textTransform: "uppercase"
                }, children: recipe.title }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                  fontFamily: "Fraunces, serif",
                  fontStyle: "italic",
                  fontWeight: 300,
                  fontSize: 15,
                  color: "rgba(35,60,0,0.55)",
                  lineHeight: 1.5
                }, children: recipe.description })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                position: "sticky",
                top: 0,
                zIndex: 10,
                background: "#FAF7F2",
                borderBottom: "1px solid rgba(35,60,0,0.08)"
              }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                display: "flex",
                gap: 28,
                padding: "20px 24px 0"
              }, children: ["ingredients", "steps"].map((t) => {
                const active = tab === t;
                return /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => setTab(t),
                    style: {
                      background: "transparent",
                      color: active ? "#233C00" : "rgba(35,60,0,0.3)",
                      border: "none",
                      borderBottom: active ? "1.5px solid #233C00" : "1.5px solid transparent",
                      cursor: "pointer",
                      fontFamily: "Inter, sans-serif",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontWeight: 500,
                      padding: "0 0 12px 0"
                    },
                    children: t
                  },
                  t
                );
              }) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: tab === "ingredients" ? "block" : "none" }, children: recipe.ingredients.map((item, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 8,
                padding: "12px 24px",
                borderBottom: "1px dotted rgba(35,60,0,0.1)"
              }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                  fontFamily: "Inter, sans-serif",
                  fontSize: 15,
                  fontWeight: 400,
                  color: "#233C00",
                  textAlign: "left",
                  flex: 1,
                  maxWidth: "58%"
                }, children: item.name }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                  fontFamily: "Inter, sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                  color: "rgba(35,60,0,0.4)",
                  textAlign: "right",
                  flexShrink: 0,
                  maxWidth: "40%"
                }, children: item.qty })
              ] }, i)) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { display: tab === "steps" ? "block" : "none" }, children: recipe.steps.map((s, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                padding: "12px 24px",
                borderBottom: "1px dotted rgba(35,60,0,0.1)"
              }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "rgba(35,60,0,0.06)",
                  border: "1px solid rgba(35,60,0,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "rgba(35,60,0,0.4)"
                }, children: i + 1 }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                  fontFamily: "Inter, sans-serif",
                  fontSize: 14,
                  fontWeight: 400,
                  color: "#233C00",
                  lineHeight: 1.6,
                  flex: 1
                }, children: s })
              ] }, i)) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onSave,
                  style: {
                    display: "block",
                    width: "calc(100% - 32px)",
                    margin: "16px 16px",
                    padding: "12px 0",
                    background: "#233C00",
                    color: "#FAF7F2",
                    border: "none",
                    borderRadius: 100,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    cursor: "pointer",
                    fontWeight: 500
                  },
                  children: "Save"
                }
              )
            ] })
          ] })
        }
      )
    }
  );
}
const SplitComponent = App;
export {
  SplitComponent as component
};
