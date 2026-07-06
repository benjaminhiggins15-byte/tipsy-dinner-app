import { useState, useRef, useEffect, useMemo, type CSSProperties } from "react";
import { getAllCategories, getRecipesForCategory, loadCustomCategories, saveRecipe, updateSavedRecipe, migrateRecipesFromLocalStorage, cleanupMenusLocalStorage, deleteSavedRecipe, deleteCustomCategory, shareRecipe, type Recipe, type Occasion, type Menu, type SavedRecipe, loadOccasions, getMenusForOccasion, findMenu, type MenuSection, addRecipeToMenuSection, loadGroceryItems, addGroceryItems, toggleGroceryItemChecked, clearGroceryItems, addManualGroceryItem, enrichGroceryItems, type GroceryItem, parseSSEStream } from "./data";
import AddYourOwn from "./AddYourOwn";
import NewCategory from "./NewCategory";
import Onboarding from "./Onboarding";
import Profile, { ProfileEdit } from "./Profile";
import Occasions from "./Occasions";
import Menus from "./Menus";
import MenuInterior from "./MenuInterior";
import RecipePicker from "./RecipePicker";
import SaveRecipeFlow from "./SaveRecipeFlow";
import AuthFlow from "./AuthFlow";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";
import watermarkSquare from "../Logos/watermark_square.png";
import watermarkCircle from "../Logos/watermark_circle.png";
import {
  IconChefHat,
  IconBook,
  IconLayoutList,
  IconUser,
  IconRefresh,
  IconMessageCircle,
} from "@tabler/icons-react";
import { pickChips } from "./chips";

type RecipeDraft = {
  title: string;
  description: string;
  ingredients: { name: string; qty: string }[];
  steps: string[];
  sourceId?: string; // Optional: tracks the saved recipe this draft originated from (for update-vs-save-as-new)
};

type BuildMessage = {
  id: number;
  role: "user" | "ai";
  text: string;
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type ProfileType = {
  id: string;
  palate: string;
  inspiration: string;
  constraints: string;
  display_name: string;
  onboarding_complete: boolean;
};

// Helper: Convert recipe to XML format for AI context (used in App and Cook components)
const recipeToXML = (recipe: { title: string; description: string; ingredients: { name: string; qty: string }[]; steps: string[] }): string => {
  const ingredientsXML = recipe.ingredients.map(ing =>
    `<item><name>${ing.name}</name><qty>${ing.qty}</qty></item>`
  ).join('\n');
  const stepsXML = recipe.steps.map(step => `<step>${step}</step>`).join('\n');

  return `<recipe>
<title>${recipe.title}</title>
<description>${recipe.description}</description>
<ingredients>
${ingredientsXML}
</ingredients>
<steps>
${stepsXML}
</steps>
</recipe>`;
};

type Screen =
  | { name: "cook"; newCategory?: { key: string; label: string }; draft?: RecipeDraft; resetKey?: number }
  | { name: "addown"; editRecipe?: Recipe; editCategoryLabel?: string; draft?: RecipeDraft & { trayOpen?: boolean; newCategory?: { key: string; label: string } } }
  | { name: "newcategory" }
  | { name: "newcategoryforrecipe"; draft: RecipeDraft; returnTo: "cook" | "addown" }
  | { name: "editcategory"; categoryKey: string }
  | { name: "categories" }
  | { name: "recipes"; categoryKey: string; categoryLabel: string }
  | { name: "recipe"; recipe: Recipe; categoryLabel: string; categoryKey: string }
  | { name: "grocerylist" }
  | { name: "occasions" }
  | { name: "menus"; occasionId: string; occasionName: string }
  | { name: "menuinterior"; menuId: string }
  | { name: "recipepicker"; menuId: string; section: MenuSection }
  | { name: "profile" }
  | { name: "profileedit"; fieldKey: "name" | "email" | "palate" | "inspiration" | "table" | "constraints" }
  | { name: "placeholder"; title: string };

type TabId = "build" | "recipes" | "menus" | "profile";

const S: Record<string, CSSProperties> = {
  page: {
    background: "#FAF7F2",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  phone: {
    width: "100%",
    maxWidth: 480,
    background: "#FAF7F2",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: "env(safe-area-inset-bottom)",
  },
};

const DURATION = 300;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

function screenKey(s: Screen): string {
  switch (s.name) {
    case "cook": return s.resetKey ? `cook:${s.resetKey}` : "cook";
    case "addown": return s.editRecipe?.savedId ? `addown:edit:${s.editRecipe.savedId}` : "addown";
    case "newcategory": return "newcategory";
    case "newcategoryforrecipe": return "newcategoryforrecipe";
    case "editcategory": return `editcategory:${s.categoryKey}`;
    case "categories": return "categories";
    case "recipes": return `recipes:${s.categoryKey}`;
    case "recipe": return `recipe:${s.categoryLabel}:${s.recipe.title}`;
    case "grocerylist": return "grocerylist";
    case "occasions": return "occasions";
    case "menus": return `menus:${s.occasionId}`;
    case "menuinterior": return `menuinterior:${s.menuId}`;
    case "recipepicker": return `recipepicker:${s.menuId}:${s.section}`;
    case "profile": return "profile";
    case "profileedit": return `profileedit:${s.fieldKey}`;
    case "placeholder": return `placeholder:${s.title}`;
  }
}

function renderScreen(
  s: Screen,
  push: (s: Screen) => void,
  back: () => void,
  isTabRoot: boolean,
  replaceRecipe?: (r: Recipe, label: string) => void,
  finishEditCategory?: (newLabel: string) => void,
  finishDeleteCategory?: () => void,
  finishDeleteRecipe?: () => void,
  finishCreateCategoryForRecipe?: (catKey: string, catLabel: string, draft: RecipeDraft, returnTo: "cook" | "addown") => void,
  finishSaveRecipe?: (recipe: Recipe, categoryKey: string, categoryLabel: string) => void,
  onSignOut?: () => void,
  profile?: ProfileType | null,
  onUpdate?: (updates: Partial<ProfileType>) => Promise<void>,
  recipesByCategory?: Record<string, Recipe[]>,
  ensureRecipesLoaded?: (categoryKey: string, categoryLabel: string) => Promise<void>,
  clearRecipeCache?: (categoryKey: string) => void,
  buildMessages?: BuildMessage[],
  setBuildMessages?: (messages: BuildMessage[] | ((prev: BuildMessage[]) => BuildMessage[])) => void,
  buildConversationHistory?: ConversationMessage[],
  setBuildConversationHistory?: (history: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[])) => void,
  buildCurrentRecipe?: RecipeDraft | null,
  setBuildCurrentRecipe?: (recipe: RecipeDraft | null) => void,
  clearBuildConversation?: () => void,
  buildMessageIdRef?: React.MutableRefObject<number>,
  transferToRecipeChat?: (recipe: SavedRecipe, question: string, onCollisionCancel: () => void) => void,
) {
  switch (s.name) {
    case "cook": return (
      <Cook
        key={s.resetKey}
        back={back}
        push={push}
        finishSaveRecipe={(r, k, l) => finishSaveRecipe?.(r, k, l)}
        screen={s}
        isTabRoot={isTabRoot}
        profile={profile}
        onUpdate={onUpdate}
        messages={buildMessages || []}
        setMessages={setBuildMessages || (() => {})}
        conversationHistory={buildConversationHistory || []}
        setConversationHistory={setBuildConversationHistory || (() => {})}
        currentRecipe={buildCurrentRecipe || null}
        setCurrentRecipe={setBuildCurrentRecipe || (() => {})}
        onClearConversation={clearBuildConversation || (() => {})}
        messageIdRef={buildMessageIdRef || { current: 0 }}
      />
    );
    case "addown": return (
      <AddYourOwn
        back={back}
        goCategories={() => push({ name: "categories" })}
        goRecipe={(recipe, categoryKey, categoryLabel) => finishSaveRecipe?.(recipe, categoryKey, categoryLabel)}
        editRecipe={s.editRecipe}
        editCategoryLabel={s.editCategoryLabel}
        onSaveEdit={(updated, label) => replaceRecipe?.(updated, label)}
        onDeleted={() => finishDeleteRecipe?.()}
        clearRecipeCache={clearRecipeCache}
        initialDraft={s.draft ? { ...s.draft, step: 4, trayOpen: s.draft.trayOpen } : undefined}
        onCreateCategoryForRecipe={(payload) => push({ name: "newcategoryforrecipe", draft: payload, returnTo: "addown" })}
      />
    );
    case "newcategory": return <NewCategory back={back} onSaved={back} />;
    case "newcategoryforrecipe": return (
      <NewCategory
        back={back}
        onSaved={(cat) => {
          if (cat) finishCreateCategoryForRecipe?.(cat.key, cat.label, s.draft, s.returnTo);
        }}
      />
    );
    case "editcategory": return (
      <NewCategory
        back={back}
        onSaved={back}
        editKey={s.categoryKey}
        onEditSaved={(newLabel) => finishEditCategory?.(newLabel)}
        onDeleted={() => finishDeleteCategory?.()}
      />
    );
    case "categories": return <Categories push={push} back={back} isTabRoot={isTabRoot} ensureRecipesLoaded={ensureRecipesLoaded} />;
    case "recipes": return (
      <Recipes
        categoryKey={s.categoryKey}
        categoryLabel={s.categoryLabel}
        push={push}
        back={back}
        recipesByCategory={recipesByCategory ?? {}}
        clearRecipeCache={clearRecipeCache}
        ensureRecipesLoaded={ensureRecipesLoaded}
      />
    );
    case "recipe": return (
      <RecipeCard
        recipe={s.recipe}
        categoryLabel={s.categoryLabel}
        categoryKey={s.categoryKey}
        back={back}
        push={push}
        clearRecipeCache={clearRecipeCache}
        transferToRecipeChat={transferToRecipeChat}
      />
    );
    case "grocerylist": return <GroceryList push={push} back={back} />;
    case "occasions": return (
      <Occasions
        back={back}
        push={(occasion) => push({ name: "menus", occasionId: occasion.id, occasionName: occasion.name })}
        isTabRoot={isTabRoot}
      />
    );
    case "menus": return (
      <Menus
        occasionId={s.occasionId}
        occasionName={s.occasionName}
        back={back}
        push={(menu) => push({ name: "menuinterior", menuId: menu.id })}
      />
    );
    case "menuinterior": return (
      <MenuInterior
        menuId={s.menuId}
        back={back}
        push={push}
      />
    );
    case "recipepicker": return (
      <RecipePicker
        menuId={s.menuId}
        section={s.section}
        onClose={back}
      />
    );
    case "profile": return <Profile back={back} openEdit={(k) => push({ name: "profileedit", fieldKey: k })} isTabRoot={isTabRoot} onSignOut={onSignOut!} profile={profile || null} onUpdate={onUpdate || (async () => {})} />;
    case "profileedit": return <ProfileEdit fieldKey={s.fieldKey} back={back} profile={profile || null} onUpdate={onUpdate || (async () => {})} />;
    case "placeholder": return <Placeholder title={s.title} back={back} />;
  }
}

const TAB_ORDER: TabId[] = ["build", "recipes", "menus", "profile"];

function getTabIndex(tab: TabId): number {
  return TAB_ORDER.indexOf(tab);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("build");
  const [tabStacks, setTabStacks] = useState<Record<TabId, Screen[]>>({
    build: [{ name: "cook" }],
    recipes: [{ name: "categories" }],
    menus: [{ name: "occasions" }],
    profile: [{ name: "profile" }],
  });

  const currentStack = tabStacks[activeTab];
  const current = currentStack[currentStack.length - 1];
  const isTabRoot = currentStack.length === 1;

  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [authScreen, setAuthScreen] = useState<"signup" | "signin">("signup");
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [recipesByCategory, setRecipesByCategory] = useState<Record<string, Recipe[]>>({});

  // Build conversation state - lifted to survive tab switches
  const [buildMessages, setBuildMessages] = useState<BuildMessage[]>([]);
  const [buildConversationHistory, setBuildConversationHistory] = useState<ConversationMessage[]>([]);
  const [buildCurrentRecipe, setBuildCurrentRecipe] = useState<RecipeDraft | null>(null);
  const buildMessageIdRef = useRef(0);
  const buildAutoFireAI = useRef(false); // Flag to auto-fire AI on Build mount

  const profileInitialized = useRef(false);

  // Profile helpers
  const loadProfile = async (userId: string): Promise<ProfileType> => {
    if (!userId) {
      throw new Error('No userId provided - cannot load profile');
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // If profile doesn't exist, create one
        if (error.code === 'PGRST116') {
          const newProfile: Partial<ProfileType> = {
            id: userId,
            palate: '',
            inspiration: '',
            constraints: '',
            display_name: '',
            onboarding_complete: false,
          };
          const { data: created, error: upsertError } = await supabase
            .from('profiles')
            .upsert(newProfile, { onConflict: 'id' })
            .select()
            .single();

          if (upsertError) throw upsertError;
          const profileData = created as ProfileType;
          setProfile(profileData);
          return profileData;
        }
        throw error;
      }

      const profileData = data as ProfileType;
      setProfile(profileData);
      return profileData;
    } catch (err) {
      console.error('Error loading profile:', err);
      throw err;
    }
  };

  const updateProfile = async (updates: Partial<ProfileType>, userId?: string): Promise<void> => {
    try {
      const effectiveUserId = userId || session?.user?.id;
      if (!effectiveUserId) {
        throw new Error('No active session - cannot update profile');
      }

      const { error } = await supabase
        .from('profiles')
        .upsert(
          { id: effectiveUserId, ...updates },
          { onConflict: 'id' }
        );

      if (error) throw error;

      // Update local state
      setProfile((prev) => (prev ? { ...prev, ...updates } : null));
    } catch (err) {
      console.error('Error updating profile:', err);
      throw err;
    }
  };

  const ensureRecipesLoaded = async (categoryKey: string, categoryLabel: string) => {
    if (recipesByCategory[categoryKey]) return;
    const recipes = await getRecipesForCategory(categoryKey, categoryLabel);
    setRecipesByCategory(prev => ({ ...prev, [categoryKey]: recipes }));
  };

  const clearRecipeCache = (categoryKey: string) => {
    setRecipesByCategory(prev => {
      const next = { ...prev };
      delete next[categoryKey];
      return next;
    });
  };

  const migrateFromLocalStorage = async (userId: string): Promise<void> => {
    // Guard: skip migration if no userId provided
    if (!userId) {
      return;
    }

    try {
      const palate = localStorage.getItem("tipsyDinnerPalate");
      const inspiration = localStorage.getItem("tipsyDinnerInspiration");
      const constraints = localStorage.getItem("tipsyDinnerConstraints");
      const onboardingComplete = localStorage.getItem("tipsyDinnerOnboardingComplete") === "true";

      // Only migrate if at least one key exists
      if (palate || inspiration || constraints || onboardingComplete) {
        const updates: Partial<ProfileType> = {};
        if (palate) updates.palate = palate;
        if (inspiration) updates.inspiration = inspiration;
        if (constraints) updates.constraints = constraints;
        if (onboardingComplete) updates.onboarding_complete = true;

        // Upsert to Supabase
        await updateProfile(updates, userId);

        // Delete localStorage keys
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Get initial session (no profile logic here)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);

      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        if (profileInitialized.current) {
          // Already initialized — this is a tab refocus, not a real sign-in
          return;
        }
        profileInitialized.current = true;
        // Load profile, run migration, reload profile, check onboarding
        try {
          await loadProfile(session.user.id);
          await migrateFromLocalStorage(session.user.id);
          const finalProfile = await loadProfile(session.user.id);
          setShowOnboarding(!finalProfile.onboarding_complete);
        } catch (err) {
          console.error('Error initializing profile on sign in:', err);
          setShowOnboarding(false);
        }
      } else if (!session) {
        profileInitialized.current = false; // Reset on logout
        // Reset to signin screen when logged out
        setAuthScreen("signin");
        setShowOnboarding(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Migrate recipes from localStorage and cleanup old category data when session is available
  useEffect(() => {
    if (session) {
      migrateRecipesFromLocalStorage().catch((err) => {
        console.error('Migration error:', err);
      });

      // Remove old localStorage keys (categories, occasions, menus now in Supabase)
      try {
        localStorage.removeItem('tipsyDinnerCategories');
        cleanupMenusLocalStorage();
      } catch (err) {
        console.error('Error removing old localStorage keys:', err);
      }
    }
  }, [session]);

  const [transition, setTransition] = useState<{
    from: Screen;
    to: Screen;
    direction: "forward" | "back";
    fromIsTabRoot?: boolean;
    toIsTabRoot?: boolean;
  } | null>(null);

  const [topLevelTransition, setTopLevelTransition] = useState<{
    from: "auth" | "onboarding" | "app";
    to: "auth" | "onboarding" | "app";
    direction: "forward" | "back";
  } | null>(null);

  const updateCurrentTabStack = (updater: (stack: Screen[]) => Screen[]) => {
    setTabStacks((stacks) => ({
      ...stacks,
      [activeTab]: updater(stacks[activeTab]),
    }));
  };

  const switchToTab = (tab: TabId, screen?: Screen) => {
    if (tab === activeTab) {
      // Tapping active tab resets to root
      // Use functional update to ensure atomic state changes
      setTabStacks((prevStacks) => {
        const stack = prevStacks[tab];
        const currentScreen = stack[stack.length - 1];
        const currentIsTabRoot = stack.length === 1;

        if (tab === "build") {
          // For Build tab, always create fresh cook screen to reset all internal state
          const freshCook: Screen = { name: "cook", resetKey: Date.now() };
          setTransition({
            from: currentScreen,
            to: freshCook,
            direction: "back",
            fromIsTabRoot: currentIsTabRoot,
            toIsTabRoot: true
          });
          return {
            ...prevStacks,
            build: [freshCook],
          };
        } else if (stack.length > 1) {
          // For other tabs, pop to root if not already there
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
            [tab]: [root],
          };
        }

        // Already at root, no change
        return prevStacks;
      });
      return;
    }

    // Calculate direction based on tab order
    const fromIndex = getTabIndex(activeTab);
    const toIndex = getTabIndex(tab);
    const direction = toIndex > fromIndex ? "forward" : "back";

    const targetStack = tabStacks[tab];
    const targetScreen = screen || targetStack[targetStack.length - 1];

    // Calculate isTabRoot for both screens
    const fromIsTabRoot = currentStack.length === 1;
    const toIsTabRoot = screen ? false : targetStack.length === 1;

    setTransition({
      from: current,
      to: targetScreen,
      direction,
      fromIsTabRoot,
      toIsTabRoot,
    });

    setActiveTab(tab);

    // If a specific screen is provided, navigate to it in the new tab
    if (screen) {
      setTabStacks((stacks) => ({
        ...stacks,
        [tab]: [...stacks[tab], screen],
      }));
    }
  };

  const push = (s: Screen) => {
    if (transition) return;

    // Special-case: when leaving addown to create a new category for the
    // in-progress recipe, persist the draft + tray state on the addown screen
    // beneath so back navigation restores it.
    if (s.name === "newcategoryforrecipe" && current.name === "addown") {
      const updatedAddown: Screen = { ...current, draft: { ...s.draft, trayOpen: true } };
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
    const prevIsTabRoot = currentStack.length === 2; // After popping, will be at root
    setTransition({ from: current, to: prev, direction: "back", fromIsTabRoot: isTabRoot, toIsTabRoot: prevIsTabRoot });
    updateCurrentTabStack((st) => st.slice(0, -1));
  };

  // Pop the current addown screen AND replace the recipe screen below
  // with the updated recipe data, then animate back to it.
  const replaceRecipeAndBack = (updated: Recipe, categoryLabel: string) => {
    if (transition) return;
    if (currentStack.length < 2) return;
    const prevIdx = currentStack.length - 2;
    const prev = currentStack[prevIdx];
    if (prev.name !== "recipe") {
      back();
      return;
    }
    // Clear recipe cache for this category
    if (updated.categoryKey) {
      setRecipesByCategory(prev => {
        const next = { ...prev };
        delete next[updated.categoryKey!];
        return next;
      });
    }
    const newPrev: Screen = { name: "recipe", recipe: updated, categoryLabel };
    const prevIsTabRoot = currentStack.length === 2;
    setTransition({ from: current, to: newPrev, direction: "back", fromIsTabRoot: isTabRoot, toIsTabRoot: prevIsTabRoot });
    updateCurrentTabStack((st) => {
      const next = st.slice(0, -1);
      next[next.length - 1] = newPrev;
      return next;
    });
  };

  // Pop the editcategory screen and replace the recipes screen below with the
  // new label, animating back to it.
  const finishEditCategory = (newLabel: string) => {
    if (transition) return;
    if (currentStack.length < 2) return;
    const prev = currentStack[currentStack.length - 2];
    if (prev.name !== "recipes") {
      back();
      return;
    }
    const newPrev: Screen = { name: "recipes", categoryKey: prev.categoryKey, categoryLabel: newLabel };
    const prevIsTabRoot = currentStack.length === 2;
    setTransition({ from: current, to: newPrev, direction: "back", fromIsTabRoot: isTabRoot, toIsTabRoot: prevIsTabRoot });
    updateCurrentTabStack((st) => {
      const next = st.slice(0, -1);
      next[next.length - 1] = newPrev;
      return next;
    });
  };

  // Pop both the editcategory and the recipes screens, animating back to
  // categories (which sits below recipes in the stack).
  const finishDeleteCategory = () => {
    if (transition) return;
    // Find the nearest "categories" screen below current; fall back to back().
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

  // Pop the addown (edit) screen and the recipe screen, animating back to
  // the recipes list (which sits below the recipe screen in the stack).
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
    // Clear recipe cache for this category
    if (target.name === "recipes") {
      setRecipesByCategory(prev => {
        const next = { ...prev };
        delete next[target.categoryKey];
        return next;
      });
    }
    const targetIsTabRoot = idx === 0;
    setTransition({ from: current, to: target, direction: "back", fromIsTabRoot: isTabRoot, toIsTabRoot: targetIsTabRoot });
    updateCurrentTabStack((st) => st.slice(0, idx + 1));
  };

  // Save the in-progress recipe under the freshly created category and
  // Return to the parent screen with the newly created category selected in the save flow
  const finishCreateCategoryForRecipe = (catKey: string, catLabel: string, draft: RecipeDraft, returnTo: "cook" | "addown") => {
    if (transition) return;

    // Don't save the recipe yet - just return to the parent screen with the category selected
    if (returnTo === "cook") {
      // Return to cook screen with the new category and recipe draft
      updateCurrentTabStack((prev) => {
        const newStack = prev.slice(0, -1); // Remove newcategoryforrecipe screen
        return [...newStack, { name: "cook", newCategory: { key: catKey, label: catLabel }, draft }];
      });
    } else {
      // Return to addown screen with the new category
      updateCurrentTabStack((prev) => {
        const newStack = prev.slice(0, -1); // Remove newcategoryforrecipe screen
        return [...newStack, {
          name: "addown",
          draft: { ...draft, trayOpen: true, newCategory: { key: catKey, label: catLabel } }
        }];
      });
    }
  };

  // Transfer to Build with a recipe and question
  const transferToRecipeChat = (recipe: SavedRecipe, question: string, onCollisionCancel: () => void) => {
    if (transition) return;

    // Atomically seed new conversation (silently replaces any existing conversation)
    // Reset message ID counter for fresh conversation
    buildMessageIdRef.current = 0;

    // Transform SavedRecipe to RecipeDraft for mini player
    const recipeDraft: RecipeDraft = {
      title: recipe.title,
      description: recipe.description,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      sourceId: String(recipe.id), // Preserve origin for update-vs-save-as-new choice
    };

    // Set the recipe as the in-progress recipe (shows in mini player)
    setBuildCurrentRecipe(recipeDraft);

    // Create user message (visible in chat)
    const userMessage: BuildMessage = {
      id: ++buildMessageIdRef.current,
      role: "user",
      text: question.trim(),
    };
    setBuildMessages([userMessage]);

    // Build conversation history with just the user question
    // Recipe context will be injected into system prompt instead of as a fake assistant turn
    setBuildConversationHistory([
      { role: "user", content: question.trim() },
    ]);

    // Set flag to auto-fire AI call when Cook mounts
    buildAutoFireAI.current = true;

    // Navigate to Build tab
    switchToTab("build");
  };

  // Clear Build state only (no transition, no navigation) — for atomic clear+seed
  const clearBuildStateOnly = () => {
    setBuildMessages([]);
    setBuildConversationHistory([]);
    setBuildCurrentRecipe(null);
    buildMessageIdRef.current = 0;
  };

  // Clear Build conversation and start fresh (with animated transition)
  const clearBuildConversation = () => {
    if (transition) return; // Guard against concurrent transitions

    // Clear lifted state
    clearBuildStateOnly();

    // Trigger transition to fresh Build screen (same pattern as double-tap Build reset)
    const currentBuildScreen = tabStacks.build[tabStacks.build.length - 1];
    const freshCook: Screen = { name: "cook", resetKey: Date.now() };

    setTransition({
      from: currentBuildScreen,
      to: freshCook,
      direction: "back",
      fromIsTabRoot: true,
      toIsTabRoot: true
    });

    setTabStacks(prev => ({
      ...prev,
      build: [freshCook]
    }));
  };

  // After a recipe is saved, switch to Recipes tab and navigate to the saved recipe
  const finishSaveRecipe = (recipe: Recipe, categoryKey: string, categoryLabel: string) => {
    if (transition) return;
    // Clear recipe cache for this category
    setRecipesByCategory(prev => {
      const next = { ...prev };
      delete next[categoryKey];
      return next;
    });
    const target: Screen = { name: "recipe", recipe, categoryLabel };

    // Build the Recipes tab stack: categories → recipes → recipe
    setTabStacks((stacks) => ({
      ...stacks,
      build: [{ name: "cook" }], // Reset Build tab to root
      recipes: [
        { name: "categories" },
        { name: "recipes", categoryKey, categoryLabel },
        target,
      ],
    }));

    // Switch to Recipes tab
    setActiveTab("recipes");
  };

  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setTransition(null), DURATION);
    return () => clearTimeout(t);
  }, [transition]);

  const topLevelTransKey = topLevelTransition
    ? `${topLevelTransition.from}->${topLevelTransition.to}:${topLevelTransition.direction}`
    : null;
  const [topLevelArmedKey, setTopLevelArmedKey] = useState<string | null>(null);
  const topLevelAnimPhase: "start" | "end" =
    topLevelTransKey && topLevelArmedKey !== topLevelTransKey ? "start" : "end";

  useEffect(() => {
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

  useEffect(() => {
    if (!topLevelTransition) return;
    const t = setTimeout(() => {
      setTopLevelTransition(null);
      // After transition completes, update session state
      if (topLevelTransition.to === "auth") {
        setSession(null);
        setShowOnboarding(null);
      }
    }, DURATION + 20);
    return () => clearTimeout(t);
  }, [topLevelTransition]);

  const handleSignOut = () => {
    // Trigger transition from app to auth
    setTopLevelTransition({
      from: "app",
      to: "auth",
      direction: "back",
    });
    setAuthScreen("signin");
  };

  const handleAuthSuccess = () => {
    // Session will be updated by onAuthStateChange listener
    // Onboarding check will happen automatically
  };

  const renderTopLevelView = (view: "auth" | "onboarding" | "app") => {
    if (view === "auth") {
      return (
        <AuthFlow
          initialScreen={authScreen}
          onSuccess={handleAuthSuccess}
        />
      );
    }
    if (view === "onboarding") {
      return <Onboarding onComplete={() => setShowOnboarding(false)} profile={profile} onUpdate={updateProfile} />;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", background: "#FAF7F2" }}>
        <ScreenStage
          current={current}
          transition={transition}
          push={push}
          back={back}
          isTabRoot={isTabRoot}
          replaceRecipe={replaceRecipeAndBack}
          finishEditCategory={finishEditCategory}
          finishDeleteCategory={finishDeleteCategory}
          finishDeleteRecipe={finishDeleteRecipe}
          finishCreateCategoryForRecipe={finishCreateCategoryForRecipe}
          finishSaveRecipe={finishSaveRecipe}
          onSignOut={handleSignOut}
          profile={profile}
          updateProfile={async (updates) => updateProfile(updates, session?.user?.id)}
          recipesByCategory={recipesByCategory}
          ensureRecipesLoaded={ensureRecipesLoaded}
          clearRecipeCache={clearRecipeCache}
          buildMessages={buildMessages}
          setBuildMessages={setBuildMessages}
          buildConversationHistory={buildConversationHistory}
          setBuildConversationHistory={setBuildConversationHistory}
          buildCurrentRecipe={buildCurrentRecipe}
          setBuildCurrentRecipe={setBuildCurrentRecipe}
          clearBuildConversation={clearBuildConversation}
          buildMessageIdRef={buildMessageIdRef}
          transferToRecipeChat={transferToRecipeChat}
        />
        <BottomTabBar activeTab={activeTab} onTabClick={switchToTab} />
      </div>
    );
  };

  const getCurrentView = (): "auth" | "onboarding" | "app" | null => {
    if (session === undefined) return null;
    if (session === null) return "auth";
    if (showOnboarding === null) return null;
    if (showOnboarding) return "onboarding";
    return "app";
  };

  const currentView = getCurrentView();

  const layerBase: CSSProperties = {
    position: "absolute",
    inset: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#FAF7F2",
    willChange: "transform",
  };

  // Unified top-level tree structure
  const isTopLevelTransitioning = !!topLevelTransition;
  const topLevelFrom = topLevelTransition?.from;
  const topLevelDirection = topLevelTransition?.direction;

  // Calculate transforms and z-index for top-level transition
  let currentViewTransform = "translateX(0)";
  let topLevelFromTransform = "translateX(0)";
  let currentViewZ = 1;
  let topLevelFromZ = 1;

  if (isTopLevelTransitioning && topLevelDirection) {
    if (topLevelDirection === "forward") {
      currentViewTransform = topLevelAnimPhase === "start" ? "translateX(100%)" : "translateX(0)";
      topLevelFromTransform = topLevelAnimPhase === "start" ? "translateX(0)" : "translateX(-25%)";
      currentViewZ = 2;
      topLevelFromZ = 1;
    } else {
      currentViewTransform = topLevelAnimPhase === "start" ? "translateX(-25%)" : "translateX(0)";
      topLevelFromTransform = topLevelAnimPhase === "start" ? "translateX(0)" : "translateX(100%)";
      currentViewZ = 1;
      topLevelFromZ = 2;
    }
  }

  const topLevelTransitionStyle = isTopLevelTransitioning && topLevelAnimPhase !== "start"
    ? `transform ${DURATION}ms ${EASE}`
    : "none";

  return (
    <div style={S.page} className="td-fullscreen-height">
      <div style={S.phone} className="td-fullscreen-height">
        {currentView === null ? null : (
          <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#FAF7F2" }}>
            {/* Base layer - always renders currentView (stable tree position) */}
            <div
              style={{
                ...layerBase,
                position: isTopLevelTransitioning ? "absolute" : "relative",
                transform: currentViewTransform,
                transition: topLevelTransitionStyle,
                zIndex: currentViewZ,
                pointerEvents: isTopLevelTransitioning ? "none" : "auto",
              }}
            >
              {renderTopLevelView(currentView)}
            </div>

            {/* Overlay layer - only during transitions, renders from view */}
            {isTopLevelTransitioning && topLevelFrom && (
              <div
                style={{
                  ...layerBase,
                  position: "absolute",
                  inset: 0,
                  transform: topLevelFromTransform,
                  transition: topLevelTransitionStyle,
                  zIndex: topLevelFromZ,
                  pointerEvents: "none",
                }}
              >
                {renderTopLevelView(topLevelFrom)}
              </div>
            )}
          </div>
        )}
      </div>
      {import.meta.env.DEV && (
        <button
          onClick={async () => {
            await updateProfile({ onboarding_complete: false });
            setTabStacks({
              build: [{ name: "cook" }],
              recipes: [{ name: "categories" }],
              menus: [{ name: "occasions" }],
              profile: [{ name: "profile" }],
            });
            setActiveTab("build");
            setShowOnboarding(true);
          }}
          style={{
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
            opacity: 0.7,
          }}
        >
          Reset onboarding
        </button>
      )}
    </div>
  );
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
  updateProfile,
  recipesByCategory,
  ensureRecipesLoaded,
  clearRecipeCache,
  buildMessages,
  setBuildMessages,
  buildConversationHistory,
  setBuildConversationHistory,
  buildCurrentRecipe,
  setBuildCurrentRecipe,
  clearBuildConversation,
  buildMessageIdRef,
  transferToRecipeChat,
}: {
  current: Screen;
  transition: { from: Screen; to: Screen; direction: "forward" | "back"; fromIsTabRoot?: boolean; toIsTabRoot?: boolean } | null;
  push: (s: Screen) => void;
  back: () => void;
  isTabRoot: boolean;
  replaceRecipe: (r: Recipe, label: string) => void;
  finishEditCategory: (newLabel: string) => void;
  finishDeleteCategory: () => void;
  finishDeleteRecipe: () => void;
  finishCreateCategoryForRecipe: (catKey: string, catLabel: string, draft: RecipeDraft, returnTo: "cook" | "addown") => void;
  finishSaveRecipe: (recipe: Recipe, categoryKey: string, categoryLabel: string) => void;
  onSignOut: () => void;
  profile: ProfileType | null;
  updateProfile: (updates: Partial<ProfileType>) => Promise<void>;
  recipesByCategory: Record<string, Recipe[]>;
  ensureRecipesLoaded: (categoryKey: string, categoryLabel: string) => Promise<void>;
  clearRecipeCache: (categoryKey: string) => void;
  buildMessages: BuildMessage[];
  setBuildMessages: (messages: BuildMessage[] | ((prev: BuildMessage[]) => BuildMessage[])) => void;
  buildConversationHistory: ConversationMessage[];
  setBuildConversationHistory: (history: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[])) => void;
  buildCurrentRecipe: RecipeDraft | null;
  setBuildCurrentRecipe: (recipe: RecipeDraft | null) => void;
  clearBuildConversation: () => void;
  buildMessageIdRef: React.MutableRefObject<number>;
  transferToRecipeChat: (recipe: SavedRecipe, question: string, onCollisionCancel: () => void) => void;
}) {
  // Trigger animation on mount of incoming layer.
  // Phase is derived from state: when a new transition starts, phase begins as
  // "start" (renders incoming offscreen with NO css transition). After the
  // browser paints that frame, we flip to "end" so the CSS transition runs.
  const transKey = transition
    ? `${screenKey(transition.from)}->${screenKey(transition.to)}:${transition.direction}`
    : null;
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const animPhase: "start" | "end" =
    transKey && armedKey !== transKey ? "start" : "end";

  useEffect(() => {
    if (!transKey) {
      if (armedKey !== null) setArmedKey(null);
      return;
    }
    if (armedKey === transKey) return;
    let r2 = 0;
    let cancelled = false;
    // Two RAFs to guarantee the browser paints the "start" frame first.
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

  const layerBase: CSSProperties = {
    position: "absolute",
    inset: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#FAF7F2",
    willChange: "transform",
  };

  // Unified tree structure - always render current in same position
  const isTransitioning = !!transition;
  const from = transition?.from;
  const direction = transition?.direction;
  const fromIsTabRoot = transition?.fromIsTabRoot ?? isTabRoot;

  // Calculate transforms and z-index for both layers
  let currentTransform = "translateX(0)";
  let fromTransform = "translateX(0)";
  let currentZ = 1;
  let fromZ = 1;

  if (isTransitioning && direction) {
    if (direction === "forward") {
      // current (= to) slides in from right, from slides left underneath
      currentTransform = animPhase === "start" ? "translateX(100%)" : "translateX(0)";
      fromTransform = animPhase === "start" ? "translateX(0)" : "translateX(-25%)";
      currentZ = 2;  // incoming on top
      fromZ = 1;
    } else {  // "back"
      // current (= to) sits underneath, from slides right on top
      currentTransform = animPhase === "start" ? "translateX(-25%)" : "translateX(0)";
      fromTransform = animPhase === "start" ? "translateX(0)" : "translateX(100%)";
      currentZ = 1;
      fromZ = 2;  // outgoing on top
    }
  }

  const transitionStyle = isTransitioning && animPhase !== "start"
    ? `transform ${DURATION}ms ${EASE}`
    : "none";

  return (
    <div style={{ position: "relative", height: "100%", background: "#FAF7F2" }}>
      {/* Base layer - always renders current screen (stable tree position) */}
      <div style={{
        ...layerBase,
        position: isTransitioning ? "absolute" : "relative",
        transform: currentTransform,
        transition: transitionStyle,
        zIndex: currentZ,
        pointerEvents: isTransitioning ? "none" : "auto",
        paddingBottom: 64 // nav-bar clearance — may need tuning after device testing
      }}>
        {renderScreen(current, push, back, isTabRoot, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe, finishSaveRecipe, onSignOut, profile, updateProfile, recipesByCategory, ensureRecipesLoaded, clearRecipeCache, buildMessages, setBuildMessages, buildConversationHistory, setBuildConversationHistory, buildCurrentRecipe, setBuildCurrentRecipe, clearBuildConversation, buildMessageIdRef, transferToRecipeChat)}
      </div>

      {/* Overlay layer - only during transitions, renders from screen */}
      {isTransitioning && from && (
        <div style={{
          ...layerBase,
          transform: fromTransform,
          transition: transitionStyle,
          zIndex: fromZ,
          pointerEvents: "none",
          paddingBottom: 64 // nav-bar clearance — may need tuning after device testing
        }}>
          {renderScreen(from, push, back, fromIsTabRoot, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe, finishSaveRecipe, onSignOut, profile, updateProfile, recipesByCategory, ensureRecipesLoaded, clearRecipeCache, buildMessages, setBuildMessages, buildConversationHistory, setBuildConversationHistory, buildCurrentRecipe, setBuildCurrentRecipe, clearBuildConversation, buildMessageIdRef, transferToRecipeChat)}
        </div>
      )}
    </div>
  );
}

/* ---------------- Bottom Tab Bar ---------------- */
function BottomTabBar({ activeTab, onTabClick }: { activeTab: TabId; onTabClick: (tab: TabId) => void }) {
  const tabs: { id: TabId; icon: React.ReactNode; label: string }[] = [
    { id: "build", icon: <IconChefHat size={22} stroke={1.5} />, label: "Build" },
    { id: "recipes", icon: <IconBook size={22} stroke={1.5} />, label: "Recipes" },
    { id: "menus", icon: <IconLayoutList size={22} stroke={1.5} />, label: "Menus" },
    { id: "profile", icon: <IconUser size={22} stroke={1.5} />, label: "Profile" },
  ];

  return (
    <div
      style={{
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
        zIndex: 100,
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabClick(tab.id)}
            style={{
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
              position: "relative",
            }}
          >
            {tab.icon}
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {tab.label}
            </span>
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  bottom: 2,
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "#233C00",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Categories ---------------- */
function Categories({ push, back, isTabRoot, ensureRecipesLoaded }: { push: (s: Screen) => void; back: () => void; isTabRoot: boolean; ensureRecipesLoaded?: (categoryKey: string, categoryLabel: string) => Promise<void> }) {
  const [cats, setCats] = useState<{ key: string; label: string; gradient: string }[]>([]);
  const [recipeCounts, setRecipeCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let ignore = false;
    async function loadCategories() {
      const categories = await getAllCategories();
      if (ignore) return;

      // Fetch all recipe counts in parallel
      const counts: Record<string, number> = {};
      await Promise.all(
        categories.map(async (cat) => {
          const recipes = await getRecipesForCategory(cat.key, cat.label);
          counts[cat.key] = recipes.length;
        })
      );

      if (ignore) return;
      // Single batched update — both categories and counts set together
      setCats(categories);
      setRecipeCounts(counts);
    }
    loadCategories();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#233C00" }}>
          Recipes
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={() => push({ name: "grocerylist" })}
            aria-label="Grocery list"
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "1px solid rgba(35,60,0,0.25)",
              background: "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
            </svg>
          </button>
          <button
            onClick={() => push({ name: "newcategory" })}
            aria-label="New category"
            style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "1px solid rgba(35,60,0,0.25)",
              background: "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gridAutoRows: "160px", gap: 12 }}>
          {cats.map((c) => {
            const count = recipeCounts[c.key] ?? 0;
            return (
              <div
                key={c.key}
                onClick={async () => {
                  await ensureRecipesLoaded?.(c.key, c.label);
                  push({ name: "recipes", categoryKey: c.key, categoryLabel: c.label });
                }}
                style={{
                  background: "rgba(35,60,0,0.06)",
                  border: "1px solid rgba(35,60,0,0.1)",
                  borderRadius: 16,
                  display: "flex", flexDirection: "column",
                  justifyContent: "space-between",
                  padding: 16,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 28, lineHeight: 1 }}>
                  <IconBook size={28} stroke={1.5} color="rgba(35,60,0,0.2)" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 400, color: "rgba(35,60,0,0.4)" }}>
                    {count} {count === 1 ? "recipe" : "recipes"}
                  </div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#233C00", lineHeight: 1.15 }}>
                    {c.label}
                  </div>
                </div>
              </div>
            );
          })}
          {/* New category card */}
          <div
            onClick={() => push({ name: "newcategory" })}
            style={{
              background: "rgba(35,60,0,0.04)",
              border: "1px dashed rgba(35,60,0,0.2)",
              borderRadius: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Recipes List ---------------- */
function Recipes({
  categoryKey,
  categoryLabel,
  push,
  back,
  recipesByCategory,
  clearRecipeCache,
  ensureRecipesLoaded,
}: {
  categoryKey: string;
  categoryLabel: string;
  push: (s: Screen) => void;
  back: () => void;
  recipesByCategory: Record<string, Recipe[]>;
  clearRecipeCache?: (categoryKey: string) => void;
  ensureRecipesLoaded?: (categoryKey: string, categoryLabel: string) => Promise<void>;
}) {
  const recipes = recipesByCategory[categoryKey] ?? [];
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!recipesByCategory[categoryKey]) {
      ensureRecipesLoaded?.(categoryKey, categoryLabel);
    }
  }, [categoryKey, recipesByCategory[categoryKey], categoryLabel, ensureRecipesLoaded]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={back}
            aria-label="Back"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#233C00" }}>
              {categoryLabel}
            </div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 400, color: "rgba(35,60,0,0.35)" }}>
              {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
            </div>
          </div>
        </div>
        <button
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete category"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>

      {/* Recipe List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {recipes.map((r, i) => (
          <div
            key={i}
            onClick={() => push({ name: "recipe", recipe: r, categoryLabel, categoryKey })}
            style={{
              height: 80,
              background: "rgba(35,60,0,0.06)",
              border: "1px solid rgba(35,60,0,0.1)",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              padding: "0 18px",
              gap: 14,
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            {/* Icon placeholder */}
            <div style={{
              width: 40, height: 40, minWidth: 40,
              borderRadius: 10,
              background: "rgba(35,60,0,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <IconBook size={22} stroke={1.5} color="rgba(35,60,0,0.2)" />
            </div>

            {/* Recipe info */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <div style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "capitalize",
                color: "#233C00",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {r.title}
              </div>
              <div style={{
                fontFamily: "Fraunces, serif",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: 12,
                color: "rgba(35,60,0,0.45)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {r.description}
              </div>
              {r.yield && (
                <div style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "rgba(35,60,0,0.25)",
                }}>
                  {r.yield}
                </div>
              )}
            </div>

            {/* Chevron */}
            <div style={{ flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(false)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(35,60,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FAF7F2",
              borderRadius: 16,
              padding: "24px 20px",
              width: "100%",
              maxWidth: 280,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              border: "0.5px solid rgba(35,60,0,0.1)",
            }}
          >
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#233C00",
              textAlign: "center",
            }}>
              Delete this category?
            </div>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: "#233C00",
              textAlign: "center",
              marginBottom: 12,
            }}>
              Your recipes will remain in your library.
            </div>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                background: "transparent",
                border: "0.5px solid rgba(35,60,0,0.1)",
                color: "#233C00",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await deleteCustomCategory(categoryKey);
                clearRecipeCache?.(categoryKey);
                setConfirmDelete(false);
                back();
              }}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                background: "#B85C5C",
                border: "none",
                color: "#FAF7F2",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Recipe Card ---------------- */
function RecipeCard({
  recipe,
  categoryLabel,
  categoryKey,
  back,
  push,
  clearRecipeCache,
  transferToRecipeChat,
}: {
  recipe: Recipe;
  categoryLabel: string;
  categoryKey: string;
  back: () => void;
  push: (s: Screen) => void;
  clearRecipeCache?: (categoryKey: string) => void;
  transferToRecipeChat?: (recipe: SavedRecipe, question: string, onCollisionCancel: () => void) => void;
}) {
  const [tab, setTab] = useState<"ingredients" | "steps">("ingredients");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareConfirm, setShareConfirm] = useState(false);
  const [groceryAddedConfirm, setGroceryAddedConfirm] = useState(false);
  const [showChatInput, setShowChatInput] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];
  const editable = recipe.savedId != null;

  async function handleShare() {
    if (!recipe.savedId) return;
    const url = await shareRecipe(recipe.savedId.toString());
    if (!url) return;

    // Try native share sheet first
    if (navigator.share) {
      try {
        await navigator.share({ url: url });
      } catch (err) {
        // User cancelled — silent fail
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(url);
        setShareConfirm(true);
        setTimeout(() => setShareConfirm(false), 2000);
      } catch (err) {
        console.error('Clipboard write failed:', err);
      }
    }
  }

  async function handleAddToGroceryList() {
    if (!ingredients.length) return;
    try {
      const insertedItems = await addGroceryItems(
        ingredients.map((i) => ({
          display_name: i.name,
          quantity: i.qty,
          source_recipe_id: recipe.savedId != null ? recipe.savedId.toString() : null,
        }))
      );
      enrichGroceryItems(
        insertedItems.map((i) => ({ id: i.id, display_name: i.displayName, quantity: i.quantity }))
      ).catch((err) => console.error('Grocery enrichment failed:', err));
      setGroceryAddedConfirm(true);
      setTimeout(() => setGroceryAddedConfirm(false), 2000);
    } catch (err) {
      console.error('Failed to add to grocery list:', err);
    }
  }

  const handleChatIconClick = () => {
    setShowChatInput(true);
  };

  const handleChatSend = () => {
    if (!chatQuestion.trim() || !transferToRecipeChat || !recipe.savedId) return;

    // Build SavedRecipe object from card data
    const savedRecipe: SavedRecipe = {
      id: recipe.savedId!,
      title: recipe.title,
      description: recipe.description,
      category: categoryKey,
      ingredients: recipe.ingredients ?? [],
      steps: recipe.steps ?? [],
      createdAt: new Date().toISOString(),
    };

    // Transfer to Build with question (App-level function handles seeding + navigation)
    transferToRecipeChat(savedRecipe, chatQuestion, () => {
      setShowChatInput(false);
    });

    // Clean up local state
    setShowChatInput(false);
    setChatQuestion("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Hero */}
        <div style={{ padding: "4px 24px 20px", flexShrink: 0 }}>
          {/* Top row - back and actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <button
              onClick={back}
              aria-label="Back"
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {editable && (
                <button
                  onClick={handleShare}
                  aria-label="Share"
                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
              )}
              {editable && (
                <button
                  onClick={() => push({ name: "addown", editRecipe: recipe, editCategoryLabel: categoryLabel })}
                  aria-label="Edit"
                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
              {editable && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete"
                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              )}
              {editable && ingredients.length > 0 && (
                <button
                  onClick={handleAddToGroceryList}
                  aria-label="Add to grocery list"
                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Category label */}
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(35,60,0,0.35)",
            marginBottom: 6,
          }}>
            {recipe.category}
          </div>

          {/* Title */}
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontStyle: "normal",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "capitalize",
            color: "#233C00",
            lineHeight: 1.1,
            marginBottom: 8,
          }}>
            {recipe.title}
          </div>

          {/* Description */}
          <div style={{
            fontFamily: "Fraunces, serif",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 15,
            color: "rgba(35,60,0,0.55)",
            lineHeight: 1.5,
            marginBottom: 18,
          }}>
            {recipe.description}
          </div>

          {/* Meta row */}
          {recipe.yield && (
            <div style={{ display: "flex", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "rgba(35,60,0,0.3)",
                }}>
                  Yield
                </div>
                <div style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#233C00",
                }}>
                  {recipe.yield}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs - left-aligned with underlines */}
        <div style={{
          display: "flex",
          padding: "20px 24px 0",
          flexShrink: 0,
          gap: 28,
          borderBottom: "1px solid rgba(35,60,0,0.08)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#FAF7F2",
        }}>
          <button
            onClick={() => setTab("ingredients")}
            style={{
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
              border: "none",
            }}
          >
            Ingredients
            {tab === "ingredients" && (
              <div style={{
                position: "absolute",
                bottom: -1,
                left: 0,
                right: 0,
                height: 1.5,
                background: "#233C00",
                borderRadius: 2,
              }} />
            )}
          </button>
          <button
            onClick={() => setTab("steps")}
            style={{
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
              border: "none",
            }}
          >
            Steps
            {tab === "steps" && (
              <div style={{
                position: "absolute",
                bottom: -1,
                left: 0,
                right: 0,
                height: 1.5,
                background: "#233C00",
                borderRadius: 2,
              }} />
            )}
          </button>
        </div>

        {/* Tab content */}
        <div style={{ paddingTop: 4 }}>
          <div style={{ display: tab === "ingredients" ? "block" : "none" }}>
            {ingredients.map((i, idx) => (
              <div key={idx} style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
                padding: "12px 24px",
                borderBottom: idx === ingredients.length - 1 ? "none" : "1px dotted rgba(35,60,0,0.1)",
              }}>
                <span style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 15,
                  fontWeight: 400,
                  color: "#233C00",
                  textAlign: "left",
                  flex: 1,
                  maxWidth: "58%",
                }}>{i.name}</span>
                <span style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                  color: "rgba(35,60,0,0.4)",
                  textAlign: "right",
                  flexShrink: 0,
                  maxWidth: "40%",
                }}>{i.qty}</span>
              </div>
            ))}
            {ingredients.length === 0 && (
              <p style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: "rgba(35,60,0,0.4)",
                padding: "20px 24px",
              }}>No ingredients yet.</p>
            )}
          </div>
          <div style={{ display: tab === "steps" ? "block" : "none", padding: "20px 24px" }}>
            {steps.map((s, idx) => (
              <div key={idx} style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                marginBottom: idx === steps.length - 1 ? 0 : 20,
              }}>
                <span style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 18,
                  fontWeight: 500,
                  color: "rgba(35,60,0,0.3)",
                  flexShrink: 0,
                  lineHeight: 1.4,
                }}>
                  {idx + 1}
                </span>
                <p style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 14,
                  color: "#233C00",
                  lineHeight: 1.6,
                  margin: 0,
                }}>{s}</p>
              </div>
            ))}
            {steps.length === 0 && (
              <p style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                color: "rgba(35,60,0,0.4)",
              }}>No steps yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(false)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(35,60,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FAF7F2",
              borderRadius: 16,
              padding: "24px 20px",
              width: "100%",
              maxWidth: 280,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              border: "0.5px solid rgba(35,60,0,0.1)",
            }}
          >
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#233C00",
              textAlign: "center",
            }}>
              Delete this recipe?
            </div>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: "#233C00",
              textAlign: "center",
              marginBottom: 12,
            }}>
              This can't be undone.
            </div>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                background: "transparent",
                border: "0.5px solid rgba(35,60,0,0.1)",
                color: "#233C00",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (recipe.savedId) {
                  await deleteSavedRecipe(recipe.savedId);
                  clearRecipeCache?.(categoryKey);
                  setConfirmDelete(false);
                  back();
                }
              }}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                background: "#B85C5C",
                border: "none",
                color: "#FAF7F2",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Floating chat icon */}
      {editable && transferToRecipeChat && (
        <button
          onClick={handleChatIconClick}
          style={{
            position: "fixed",
            bottom: "80px", // Above nav bar
            right: "20px",
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "#1E3A42",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            boxShadow: "0 4px 12px rgba(35,60,0,0.2)",
          }}
          aria-label="Chat about this recipe"
        >
          <IconMessageCircle size={24} stroke={1.5} color="#FEE7C0" />
        </button>
      )}

      {/* Slide-up chat input */}
      {showChatInput && (
        <>
          {/* Backdrop to dismiss (covers content area only, not nav bar) */}
          <div
            onClick={() => {
              setShowChatInput(false);
              setChatQuestion("");
            }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 64,
              background: "rgba(35,60,0,0.15)",
              zIndex: 49,
            }}
          />
          {/* Input bar (flush above nav bar) */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              bottom: 64,
              left: 0,
              right: 0,
              maxWidth: "480px",
              margin: "0 auto",
              zIndex: 50,
              animation: "slideUpFromNav 300ms ease-out",
            }}
          >
            <style>{`
              @keyframes slideUpFromNav {
                from {
                  transform: translateY(calc(100% + 64px));
                }
                to {
                  transform: translateY(0);
                }
              }
            `}</style>
            <CookInputBar
              value={chatQuestion}
              onChange={setChatQuestion}
              onSend={handleChatSend}
              placeholder="ask anything"
              disabled={false}
            />
          </div>
        </>
      )}

      {/* Share confirmation toast */}
      {shareConfirm && (
        <div
          style={{
            position: "fixed",
            bottom: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#233C00",
            color: "#FEE7C0",
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "12px",
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            zIndex: 1000,
          }}
        >
          Link copied
        </div>
      )}

      {/* Grocery list confirmation toast */}
      {groceryAddedConfirm && (
        <div
          style={{
            position: "fixed",
            bottom: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#233C00",
            color: "#FEE7C0",
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "12px",
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            zIndex: 1000,
          }}
        >
          Added to grocery list
        </div>
      )}
    </div>
  );
}

/* ---------------- Grocery List ---------------- */
type GroceryRow = {
  key: string;
  quantityText: string;
  ids: string[];
  checked: boolean;
  pending: boolean;
  sortOrder: number;
};
type GroceryGroup = { label: string; rows: GroceryRow[]; sortOrder: number };
type GroceryAisleSection = { aisle: string; groups: GroceryGroup[]; sortOrder: number };

const GROCERY_AISLE_ORDER = ["produce", "dairy", "meat", "pantry", "frozen", "other"] as const;
const GROCERY_AISLE_LABELS: Record<string, string> = {
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
const GROCERY_ENRICHMENT_HOLD_MS = 18000;

// Groups items by aisle, then by normalized/display name within each aisle.
// Within a name group, rows combine additively only when both come from
// enriched items sharing the same unit (including unitless numeric counts).
// Anything not yet enriched (pending/raw/failed) falls back to Phase 1's dumb
// exact-string quantity match, and always displays its raw text — never
// invented, never lost. Callers are expected to hold freshly-added still-
// pending items out of this function entirely (see GroceryList's held-item
// logic) — any "pending" item that does reach here is one whose hold has
// timed out, and is treated identically to a raw/failed item.
function groupGroceryItems(items: GroceryItem[]): GroceryAisleSection[] {
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

function GroceryList({ push, back }: { push: (s: Screen) => void; back: () => void }) {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualName, setManualName] = useState("");
  const [manualQty, setManualQty] = useState("");
  const [manualNameErr, setManualNameErr] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const loaded = await loadGroceryItems();
      if (!ignore) {
        setItems(loaded);
        setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  async function handleToggle(ids: string[], nextChecked: boolean) {
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, checked: nextChecked } : it)));
    await Promise.all(ids.map((id) => toggleGroceryItemChecked(id, nextChecked)));
  }

  async function handleManualAdd() {
    const name = manualName.trim();
    if (!name) {
      setManualNameErr(true);
      return;
    }
    const quantity = manualQty.trim();
    setManualName("");
    setManualQty("");
    setManualNameErr(false);
    const insertedItems = await addManualGroceryItem(name, quantity);
    enrichGroceryItems(
      insertedItems.map((i) => ({ id: i.id, display_name: i.displayName, quantity: i.quantity }))
    ).catch((err) => console.error('Grocery enrichment failed:', err));
    setItems(await loadGroceryItems());
  }

  async function handleClear(mode: "all" | "checked") {
    await clearGroceryItems(mode);
    setShowClearConfirm(false);
    setItems(await loadGroceryItems());
  }

  const pollCountRef = useRef(0);
  useEffect(() => {
    const hasPending = items.some((it) => it.enrichmentStatus === "pending");
    if (!hasPending) {
      pollCountRef.current = 0;
      return;
    }
    if (pollCountRef.current >= 12) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      pollCountRef.current += 1;
      const fresh = await loadGroceryItems();
      if (!cancelled) setItems(fresh);
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [items]);

  // Freshly-added items sit in a hold — shown only via the generic "Updating…"
  // indicator, never as raw rows that later reshuffle — until enrichment
  // resolves or GROCERY_ENRICHMENT_HOLD_MS elapses, whichever comes first.
  // Already-settled items (enriched, or pending items whose hold already
  // expired) are never gated behind this and render instantly.
  const [timedOutIds, setTimedOutIds] = useState<Set<string>>(new Set());
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const pendingIds = new Set(items.filter((it) => it.enrichmentStatus === "pending").map((it) => it.id));

    for (const id of pendingIds) {
      if (!pendingTimersRef.current.has(id)) {
        const timer = setTimeout(() => {
          setTimedOutIds((prev) => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }, GROCERY_ENRICHMENT_HOLD_MS);
        pendingTimersRef.current.set(id, timer);
      }
    }

    for (const [id, timer] of pendingTimersRef.current) {
      if (!pendingIds.has(id)) {
        clearTimeout(timer);
        pendingTimersRef.current.delete(id);
        setTimedOutIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  }, [items]);

  useEffect(() => {
    return () => {
      for (const timer of pendingTimersRef.current.values()) clearTimeout(timer);
      pendingTimersRef.current.clear();
    };
  }, []);

  const heldItems = items.filter((it) => it.enrichmentStatus === "pending" && !timedOutIds.has(it.id));
  const heldIds = new Set(heldItems.map((it) => it.id));
  const visibleItems = items.filter((it) => !heldIds.has(it.id));

  const sections = groupGroceryItems(visibleItems);

  const renderRow = (row: GroceryRow, label: string | null) => (
    <div
      key={row.key}
      onClick={() => handleToggle(row.ids, !row.checked)}
      style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "4px 0" }}
    >
      <div
        style={{
          width: 20, height: 20, minWidth: 20,
          borderRadius: "50%",
          border: "1.5px solid rgba(35,60,0,0.3)",
          background: row.checked ? "#233C00" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {row.checked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FEE7C0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        {label && (
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 15,
              fontWeight: 400,
              color: row.checked ? "rgba(35,60,0,0.35)" : row.pending ? "rgba(35,60,0,0.55)" : "#233C00",
              textDecoration: row.checked ? "line-through" : "none",
            }}
          >
            {label}
          </span>
        )}
        {row.quantityText && (
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
              color: row.checked ? "rgba(35,60,0,0.25)" : "rgba(35,60,0,0.4)",
              textDecoration: row.checked ? "line-through" : "none",
              marginLeft: label ? "auto" : 0,
            }}
          >
            {row.quantityText}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={back}
            aria-label="Back"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#233C00" }}>
            Grocery List
          </div>
        </div>
        <button
          onClick={() => setShowClearConfirm(true)}
          aria-label="Clear list"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 24px 16px" }}>
        {!loading && sections.length === 0 && heldItems.length === 0 && (
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontStyle: "italic",
              fontSize: 14,
              color: "rgba(35,60,0,0.4)",
              textAlign: "center",
              padding: "40px 0",
            }}
          >
            nothing here yet — pour something open.
          </div>
        )}
        {heldItems.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "20px 0",
              borderBottom: sections.length > 0 ? "1px dotted rgba(35,60,0,0.1)" : "none",
              marginBottom: sections.length > 0 ? 4 : 0,
            }}
          >
            <div
              style={{
                width: 14, height: 14,
                border: "1.5px solid rgba(35,60,0,0.25)",
                borderTopColor: "rgba(35,60,0,0.6)",
                borderRadius: "50%",
                animation: "grocerySpin 0.8s linear infinite",
              }}
            />
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.04em",
                color: "rgba(35,60,0,0.6)",
              }}
            >
              Updating…
            </span>
            <style>{`@keyframes grocerySpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
        {sections.map((section, sectionIdx) => (
          <div
            key={section.aisle}
            style={{ padding: "12px 0", borderBottom: sectionIdx === sections.length - 1 ? "none" : "1px dotted rgba(35,60,0,0.1)" }}
          >
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(35,60,0,0.35)",
                marginBottom: 8,
              }}
            >
              {GROCERY_AISLE_LABELS[section.aisle] ?? section.aisle}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {section.groups.map((group) => (
                <div key={group.label} style={{ padding: "8px 0" }}>
                  {group.rows.length === 1 ? (
                    renderRow(group.rows[0], group.label)
                  ) : (
                    <>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 400, color: "#233C00", marginBottom: 8 }}>
                        {group.label}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 4 }}>
                        {group.rows.map((row) => renderRow(row, null))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Manual add */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 24px", borderTop: "1px solid rgba(35,60,0,0.08)", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={manualQty}
            onChange={(e) => setManualQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualAdd();
            }}
            placeholder="qty"
            style={{
              width: 80,
              minWidth: 80,
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
              background: "rgba(35,60,0,0.06)",
              border: "1px solid rgba(35,60,0,0.12)",
              borderRadius: 10,
              padding: "12px 8px",
              fontSize: 16,
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              color: "#233C00",
              outline: "none",
            }}
          />
          <input
            value={manualName}
            onChange={(e) => {
              setManualName(e.target.value);
              if (manualNameErr) setManualNameErr(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualAdd();
            }}
            placeholder="add an item"
            style={{
              flex: 1,
              background: "rgba(35,60,0,0.06)",
              border: manualNameErr ? "1px solid #B85C5C" : "1px solid rgba(35,60,0,0.12)",
              borderRadius: 10,
              padding: "12px 14px",
              fontSize: 16,
              fontFamily: "Inter, sans-serif",
              color: "#233C00",
              outline: "none",
            }}
          />
          <button
            onClick={handleManualAdd}
            aria-label="Add item"
            style={{
              width: 44, height: 44, minWidth: 44,
              borderRadius: 10,
              background: "#1E3A42",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FEE7C0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        {manualNameErr && (
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#B85C5C", paddingLeft: 2 }}>
            Please enter an item name.
          </div>
        )}
      </div>

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div
          onClick={() => setShowClearConfirm(false)}
          style={{ position: "absolute", inset: 0, background: "rgba(35,60,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20, padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#FAF7F2", borderRadius: 16, padding: "24px 20px", width: "100%", maxWidth: 280, display: "flex", flexDirection: "column", gap: 8, border: "0.5px solid rgba(35,60,0,0.1)" }}
          >
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#233C00", textAlign: "center" }}>
              Clear grocery list?
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#233C00", textAlign: "center", marginBottom: 12 }}>
              Choose what to remove.
            </div>
            <button
              onClick={() => setShowClearConfirm(false)}
              style={{ width: "100%", padding: "12px", borderRadius: 10, background: "transparent", border: "0.5px solid rgba(35,60,0,0.1)", color: "#233C00", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={() => handleClear("checked")}
              style={{ width: "100%", padding: "12px", borderRadius: 10, background: "#FEE7C0", border: "none", color: "#233C00", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer" }}
            >
              Clear checked items only
            </button>
            <button
              onClick={() => handleClear("all")}
              style={{ width: "100%", padding: "12px", borderRadius: 10, background: "#B85C5C", border: "none", color: "#FAF7F2", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
            >
              Clear everything
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Placeholder ---------------- */
function Placeholder({ title, back }: { title: string; back: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "32px 24px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button onClick={back} aria-label="Back" style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#185FA5", display: "flex", alignItems: "center" }}>
            <BackArrow />
          </button>
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 700, textTransform: "uppercase", color: "#042C53" }}>
          {title}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, flexDirection: "column", gap: 16 }}>
        <div style={{ width: 32, height: 1, background: "#85B7EB" }} />
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: "#042C53", textAlign: "center" }}>
          coming soon
        </div>
        <div style={{ fontSize: 12, color: "#185FA5", letterSpacing: "0.04em" }}>
          we're still simmering this one.
        </div>
      </div>
    </div>
  );
}

function BackArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

/* ---------------- Cook ---------------- */
function Cook({ back, push, finishSaveRecipe, screen, isTabRoot, profile, onUpdate, messages, setMessages, conversationHistory, setConversationHistory, currentRecipe, setCurrentRecipe, onClearConversation, messageIdRef }: {
  back: () => void;
  push: (s: Screen) => void;
  finishSaveRecipe: (recipe: Recipe, categoryKey: string, categoryLabel: string) => void;
  screen: Extract<Screen, { name: "cook" }>;
  isTabRoot: boolean;
  profile?: ProfileType | null;
  onUpdate?: (updates: Partial<ProfileType>) => Promise<void>;
  messages: BuildMessage[];
  setMessages: (messages: BuildMessage[] | ((prev: BuildMessage[]) => BuildMessage[])) => void;
  conversationHistory: ConversationMessage[];
  setConversationHistory: (history: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[])) => void;
  currentRecipe: RecipeDraft | null;
  setCurrentRecipe: (recipe: RecipeDraft | null) => void;
  onClearConversation: () => void;
  messageIdRef: React.MutableRefObject<number>;
}) {

  const [trayOpen, setTrayOpen] = useState(!!screen.newCategory);
  const [newCategorySelection, setNewCategorySelection] = useState<{ key: string; label: string } | null>(screen.newCategory || null);
  const [showUpdateChoice, setShowUpdateChoice] = useState(false); // Two-button choice for update vs save-as-new
  const [showNameInput, setShowNameInput] = useState(false); // Name input for save-as-new
  const [saveAsNewName, setSaveAsNewName] = useState(""); // Temporary name for save-as-new
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [recipeRevealed, setRecipeRevealed] = useState(!!currentRecipe);
  const [miniBarVisible, setMiniBarVisible] = useState(!!currentRecipe);
  const [miniTitleVisible, setMiniTitleVisible] = useState(!!currentRecipe);
  const [expanded, setExpanded] = useState(false);
  const [generatingRecipe, setGeneratingRecipe] = useState(false);
  const [recipePulse, setRecipePulse] = useState(false);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomBarRef = useRef<HTMLDivElement | null>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Pick 3 chips once per mount (stable within session, varied across sessions)
  const displayChips = useMemo(() => pickChips(new Date()), []);

  useEffect(() => {
    const measure = () => {
      if (bottomBarRef.current) setBottomBarHeight(bottomBarRef.current.offsetHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [recipeRevealed]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing, miniBarVisible]);

  useEffect(() => {
    if (recipePulse) {
      const timer = setTimeout(() => setRecipePulse(false), 800);
      return () => clearTimeout(timer);
    }
  }, [recipePulse]);

  // Auto-fire AI call when transferring from recipe chat
  const autoFireRef = useRef(false);
  useEffect(() => {
    // Check if this is a transferred conversation that needs auto-fire
    // Condition: conversationHistory has just the user question, currentRecipe exists (recipe-loaded chat)
    const needsAutoFire =
      !autoFireRef.current &&
      !typing &&
      messages.length === 1 &&
      messages[0].role === "user" &&
      conversationHistory.length === 1 &&
      conversationHistory[0].role === "user" &&
      currentRecipe !== null;

    if (needsAutoFire) {
      autoFireRef.current = true; // Mark as fired to prevent re-firing
      // Fire AI call with the existing conversation history
      fireAICall(conversationHistory);
    }
  }, [messages, conversationHistory, typing, currentRecipe]);

  const fireAICall = async (history: ConversationMessage[]) => {
    setTyping(true);
    setGeneratingRecipe(false);

    // Load user profile from state
    const palate = profile?.palate || "";
    const inspiration = profile?.inspiration || "";
    const constraints = profile?.constraints || "";

    try {
      console.log("Calling AI chat API (auto-fire)...");

      // Get Supabase anon key for authorization
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseAnonKey) {
        throw new Error("Supabase key not found");
      }

      // Build system prompt (same as sendMessage)
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
Format every answer for easy readability — the way you'd naturally organize a thought when helping someone in the kitchen. Match the structure to the shape of the content. When the answer is a set of specific named dishes or items the user is choosing among, present them the same way as brainstorm suggestions: the name in bold, an em dash, a short description, one per line. When the answer is a broader set of options that fall into natural groupings — spreads, techniques, approaches — open with a short framing line, then organize the options under brief bold theme labels with the specifics in regular prose. Only group where the grouping is genuinely natural; never invent forced groupings just to add structure. When the answer is a single thought, a judgment call, or a yes/no with reasoning, keep it as flowing conversational prose. Separate distinct options or thoughts so they're easy to scan; never force everything into a list, and never collapse genuinely separate options into one dense paragraph. No headers, no bullet points. Never use asterisks for anything other than bolding names or theme labels.
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

      // If there's a recipe in scope, append it to system prompt as reference context
      let finalSystemPrompt = systemPrompt;
      if (currentRecipe) {
        const recipeXML = recipeToXML(currentRecipe);
        finalSystemPrompt = systemPrompt + `\n\nThe user is asking about this saved recipe; use it as reference:\n\n${recipeXML}`;
      }

      // Call Supabase Edge Function
      const response = await fetch(
        "https://xzpmmthreeyscidhwriv.supabase.co/functions/v1/ai-chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            messages: history,
            systemPrompt: finalSystemPrompt,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edge Function error: ${errorText}`);
      }

      const stream = parseSSEStream(response);

      // Create AI message immediately
      setTyping(false);
      const aiMessageId = ++messageIdRef.current;
      setMessages((m) => [...m, { id: aiMessageId, role: "ai", text: "" }]);

      let fullText = "";

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          fullText += chunk.delta.text;

          // Detect if recipe generation has started
          if (!generatingRecipe && fullText.includes("<recipe>")) {
            setGeneratingRecipe(true);
          }

          // Strip recipe XML from display text
          let displayText = fullText;
          displayText = displayText.replace(/<recipe>[\s\S]*?<\/recipe>/g, "");
          const recipeStartIndex = displayText.indexOf("<recipe>");
          if (recipeStartIndex !== -1) {
            displayText = displayText.substring(0, recipeStartIndex);
          }
          displayText = displayText.trim();

          setMessages((m) => m.map(msg =>
            msg.id === aiMessageId ? { ...msg, text: displayText } : msg
          ));
        }
      }

      console.log("Anthropic response received");

      if (!fullText) {
        throw new Error("Empty response from API");
      }

      // Parse for recipe XML
      const recipeMatch = fullText.match(/<recipe>([\s\S]*?)<\/recipe>/);
      let parsedRecipe = null;

      if (recipeMatch) {
        const recipeXml = recipeMatch[1];

        const titleMatch = recipeXml.match(/<title>(.*?)<\/title>/);
        const descMatch = recipeXml.match(/<description>(.*?)<\/description>/);
        const ingredientsMatch = recipeXml.match(/<ingredients>([\s\S]*?)<\/ingredients>/);
        const stepsMatch = recipeXml.match(/<steps>([\s\S]*?)<\/steps>/);

        const ingredients: { name: string; qty: string }[] = [];
        if (ingredientsMatch) {
          const itemMatches = [
            ...ingredientsMatch[1].matchAll(
              /<item>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<qty>(.*?)<\/qty>[\s\S]*?<\/item>/g
            ),
          ];
          for (const match of itemMatches) {
            ingredients.push({ name: match[1].trim(), qty: match[2].trim() });
          }
        }

        const steps: string[] = [];
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
            steps,
            sourceId: currentRecipe?.sourceId, // Preserve origin across AI edits (undefined for from-scratch builds)
          };
          console.log("Recipe parsed:", parsedRecipe.title);
        }
      }

      // Final update to ensure clean text without recipe XML
      const displayText = fullText.replace(/<recipe>[\s\S]*?<\/recipe>/g, "").trim();
      setMessages((m) => m.map(msg =>
        msg.id === aiMessageId ? { ...msg, text: displayText || "..." } : msg
      ));

      // Update conversation history
      setConversationHistory([...history, { role: "assistant", content: fullText }]);

      // Handle recipe if present (update the existing recipe)
      if (parsedRecipe) {
        setCurrentRecipe(parsedRecipe);
        setGeneratingRecipe(false);

        // Trigger mini player animation
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
      console.error("Error in auto-fire AI call:", error);
      setTyping(false);
      setGeneratingRecipe(false);
      setMessages((m) => [
        ...m,
        {
          id: ++messageIdRef.current,
          role: "ai",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ]);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || typing) return;

    // Collapse expanded recipe card if open
    if (expanded) {
      setExpanded(false);
    }

    const userText = input.trim();
    const userMsg: BuildMessage = { id: ++messageIdRef.current, role: "user", text: userText };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    setGeneratingRecipe(false);

    // Add user message to conversation history
    const updatedHistory = [...conversationHistory, { role: "user" as const, content: userText }];
    setConversationHistory(updatedHistory);

    // Load user profile from state
    const palate = profile?.palate || "";
    const inspiration = profile?.inspiration || "";
    const constraints = profile?.constraints || "";

    try {
      console.log("Calling AI chat API...");

      // Get Supabase anon key for authorization
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseAnonKey) {
        throw new Error("Supabase key not found");
      }

      // Build system prompt
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
Format every answer for easy readability — the way you'd naturally organize a thought when helping someone in the kitchen. Match the structure to the shape of the content. When the answer is a set of specific named dishes or items the user is choosing among, present them the same way as brainstorm suggestions: the name in bold, an em dash, a short description, one per line. When the answer is a broader set of options that fall into natural groupings — spreads, techniques, approaches — open with a short framing line, then organize the options under brief bold theme labels with the specifics in regular prose. Only group where the grouping is genuinely natural; never invent forced groupings just to add structure. When the answer is a single thought, a judgment call, or a yes/no with reasoning, keep it as flowing conversational prose. Separate distinct options or thoughts so they're easy to scan; never force everything into a list, and never collapse genuinely separate options into one dense paragraph. No headers, no bullet points. Never use asterisks for anything other than bolding names or theme labels.
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

      // If there's a recipe in scope, append it to system prompt as reference context
      let finalSystemPrompt = systemPrompt;
      if (currentRecipe) {
        const recipeXML = recipeToXML(currentRecipe);
        finalSystemPrompt = systemPrompt + `\n\nThe user is asking about this saved recipe; use it as reference:\n\n${recipeXML}`;
      }

      // Call Supabase Edge Function
      const response = await fetch(
        "https://xzpmmthreeyscidhwriv.supabase.co/functions/v1/ai-chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            messages: updatedHistory,
            systemPrompt: finalSystemPrompt,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edge Function error: ${errorText}`);
      }

      const stream = parseSSEStream(response);

      // Create AI message immediately
      setTyping(false);
      const aiMessageId = ++messageIdRef.current;
      setMessages((m) => [...m, { id: aiMessageId, role: "ai", text: "" }]);

      let fullText = "";

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          fullText += chunk.delta.text;

          // Detect if recipe generation has started
          if (!generatingRecipe && fullText.includes("<recipe>")) {
            setGeneratingRecipe(true);
          }

          // Strip recipe XML from display text
          let displayText = fullText;
          // First, remove any complete recipe blocks
          displayText = displayText.replace(/<recipe>[\s\S]*?<\/recipe>/g, "");
          // Then, if there's an opening <recipe> tag without closing tag (incomplete block),
          // strip everything from <recipe> onwards to prevent partial XML from showing
          const recipeStartIndex = displayText.indexOf("<recipe>");
          if (recipeStartIndex !== -1) {
            displayText = displayText.substring(0, recipeStartIndex);
          }
          displayText = displayText.trim();

          setMessages((m) => m.map(msg =>
            msg.id === aiMessageId ? { ...msg, text: displayText } : msg
          ));
        }
      }

      console.log("Anthropic response received");

      if (!fullText) {
        throw new Error("Empty response from API");
      }

      // Parse for recipe XML
      const recipeMatch = fullText.match(/<recipe>([\s\S]*?)<\/recipe>/);
      let parsedRecipe = null;

      if (recipeMatch) {
        const recipeXml = recipeMatch[1];

        const titleMatch = recipeXml.match(/<title>(.*?)<\/title>/);
        const descMatch = recipeXml.match(/<description>(.*?)<\/description>/);
        const ingredientsMatch = recipeXml.match(/<ingredients>([\s\S]*?)<\/ingredients>/);
        const stepsMatch = recipeXml.match(/<steps>([\s\S]*?)<\/steps>/);

        const ingredients: { name: string; qty: string }[] = [];
        if (ingredientsMatch) {
          const itemMatches = [
            ...ingredientsMatch[1].matchAll(
              /<item>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<qty>(.*?)<\/qty>[\s\S]*?<\/item>/g
            ),
          ];
          for (const match of itemMatches) {
            ingredients.push({ name: match[1].trim(), qty: match[2].trim() });
          }
        }

        const steps: string[] = [];
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
            steps,
            sourceId: currentRecipe?.sourceId, // Preserve origin across AI edits (undefined for from-scratch builds)
          };
          console.log("Recipe parsed:", parsedRecipe.title);
        }
      }

      // Final update to ensure clean text without recipe XML
      const displayText = fullText.replace(/<recipe>[\s\S]*?<\/recipe>/g, "").trim();
      setMessages((m) => m.map(msg =>
        msg.id === aiMessageId ? { ...msg, text: displayText || "..." } : msg
      ));

      // Update conversation history
      setConversationHistory([...updatedHistory, { role: "assistant", content: fullText }]);

      // Handle recipe if present
      if (parsedRecipe) {
        setCurrentRecipe(parsedRecipe);
        setGeneratingRecipe(false);

        // Trigger mini player animation
        if (!recipeRevealed) {
          setRecipeRevealed(true);
          setTimeout(() => {
            setMiniBarVisible(true);
            setTimeout(() => {
              setMiniTitleVisible(true);
              // Trigger pulse on first load after title is visible
              setRecipePulse(true);
            }, 200);
          }, 300);
        } else {
          // Recipe updated - already revealed, just update data and trigger pulse
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
          id: ++messageIdRef.current,
          role: "ai",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ]);
    }
  };

  const onUpdateRecipe = async () => {
    if (!currentRecipe || !currentRecipe.sourceId) return;

    try {
      // Step 5: Edge case handling - if updateSavedRecipe returns null, the recipe was deleted
      const updatedRecipe = await updateSavedRecipe(currentRecipe.sourceId, {
        title: currentRecipe.title,
        description: currentRecipe.description,
        ingredients: currentRecipe.ingredients,
        steps: currentRecipe.steps,
      });

      if (!updatedRecipe) {
        // Recipe was deleted - fall back to save-as-new path
        setTrayOpen(true);
        return;
      }

      // Re-anchor: keep sourceId pointing at the updated recipe (same ID)
      setCurrentRecipe({
        ...currentRecipe,
        sourceId: String(updatedRecipe.id), // Explicitly re-anchor for next save
      });

      // Query the first category this recipe is in (for navigation)
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (userId) {
        const { data: categoryData } = await supabase
          .from('recipe_categories')
          .select('category_id, categories!inner(name)')
          .eq('recipe_id', updatedRecipe.id)
          .eq('user_id', userId)
          .limit(1)
          .single();

        if (categoryData) {
          const catKey = categoryData.category_id;
          const catLabel = (categoryData.categories as any).name;

          // Build Recipe object for navigation
          // (finishSaveRecipe handles cache clearing — no need to duplicate it here)
          const recipe: Recipe = {
            title: updatedRecipe.title,
            description: updatedRecipe.description,
            color: "linear-gradient(135deg, #C5DCF4 0%, #85B7EB 100%)",
            category: catLabel.toLowerCase(),
            ingredients: updatedRecipe.ingredients,
            steps: updatedRecipe.steps,
            savedId: updatedRecipe.id,
            categoryKey: catKey,
          };

          finishSaveRecipe(recipe, catKey, catLabel);
          return;
        }
      }

      // Fallback: if no category found, update succeeded but can't navigate
      // Rare edge case (recipe has no categories or query failed) — return to previous screen
      back();
    } catch (error) {
      console.error('Error in onUpdateRecipe:', error);
      // On error, fall back to save-as-new
      setTrayOpen(true);
    }
  };

  const onPickCategory = async (catKey: string, catLabel: string, menuInfo?: { menuId: string; section: MenuSection }) => {
    if (!currentRecipe) return;

    const recipeId = await saveRecipe({
      id: Date.now(),
      title: currentRecipe.title,
      description: currentRecipe.description,
      category: catKey,
      ingredients: currentRecipe.ingredients,
      steps: currentRecipe.steps,
      createdAt: new Date().toISOString(),
    }, 'ai', catKey); // AI-generated recipe with category association

    // F&F-BET (swappable): For save-as-new, base stays anchored to original sourceId.
    // This allows spinning off multiple siblings from one base in a single chat session.
    // currentRecipe.sourceId is intentionally NOT updated here (would re-anchor to new recipe).
    // To reverse behavior: add `setCurrentRecipe({ ...currentRecipe, sourceId: recipeId })` here.

    // If menu info provided, add recipe to menu section
    if (menuInfo) {
      await addRecipeToMenuSection(menuInfo.menuId, menuInfo.section, recipeId);
    }

    const recipe: Recipe = {
      title: currentRecipe.title,
      description: currentRecipe.description,
      color: "linear-gradient(135deg, #C5DCF4 0%, #85B7EB 100%)",
      category: catLabel.toLowerCase(),
      ingredients: currentRecipe.ingredients,
      steps: currentRecipe.steps,
      savedId: recipeId,
      categoryKey: catKey,
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
        steps: currentRecipe.steps,
      },
      returnTo: "cook",
    });
  };

  const isEmpty = messages.length === 0;
  const placeholder = "ask anything";

  const handleChipClick = (text: string) => {
    if (typing) return;
    // Directly send the chip text as a message
    const userText = text.trim();
    const userMsg: BuildMessage = { id: ++messageIdRef.current, role: "user", text: userText };
    setMessages((m) => [...m, userMsg]);
    setTyping(true);
    setGeneratingRecipe(false);

    const updatedHistory = [...conversationHistory, { role: "user" as const, content: userText }];
    setConversationHistory(updatedHistory);

    const palate = profile?.palate || "";
    const inspiration = profile?.inspiration || "";
    const constraints = profile?.constraints || "";

    (async () => {
      try {
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!supabaseAnonKey) throw new Error("Supabase key not found");

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
Format every answer for easy readability — the way you'd naturally organize a thought when helping someone in the kitchen. Match the structure to the shape of the content. When the answer is a set of specific named dishes or items the user is choosing among, present them the same way as brainstorm suggestions: the name in bold, an em dash, a short description, one per line. When the answer is a broader set of options that fall into natural groupings — spreads, techniques, approaches — open with a short framing line, then organize the options under brief bold theme labels with the specifics in regular prose. Only group where the grouping is genuinely natural; never invent forced groupings just to add structure. When the answer is a single thought, a judgment call, or a yes/no with reasoning, keep it as flowing conversational prose. Separate distinct options or thoughts so they're easy to scan; never force everything into a list, and never collapse genuinely separate options into one dense paragraph. No headers, no bullet points. Never use asterisks for anything other than bolding names or theme labels.
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

        // If there's a recipe in scope, append it to system prompt as reference context
        let finalSystemPrompt = systemPrompt;
        if (currentRecipe) {
          const recipeXML = recipeToXML(currentRecipe);
          finalSystemPrompt = systemPrompt + `\n\nThe user is asking about this saved recipe; use it as reference:\n\n${recipeXML}`;
        }

        const response = await fetch(
          "https://xzpmmthreeyscidhwriv.supabase.co/functions/v1/ai-chat",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
              messages: updatedHistory,
              systemPrompt: finalSystemPrompt,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Edge Function error: ${errorText}`);
        }

        const stream = parseSSEStream(response);

        setTyping(false);
        const aiMessageId = ++messageIdRef.current;
        setMessages((m) => [...m, { id: aiMessageId, role: "ai", text: "" }]);

        let fullText = "";

        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            fullText += chunk.delta.text;

            if (!generatingRecipe && fullText.includes("<recipe>")) {
              setGeneratingRecipe(true);
            }

            let displayText = fullText;
            displayText = displayText.replace(/<recipe>[\s\S]*?<\/recipe>/g, "");
            const recipeStartIndex = displayText.indexOf("<recipe>");
            if (recipeStartIndex !== -1) {
              displayText = displayText.substring(0, recipeStartIndex);
            }
            displayText = displayText.trim();

            setMessages((m) => m.map(msg =>
              msg.id === aiMessageId ? { ...msg, text: displayText } : msg
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

          const ingredients: { name: string; qty: string }[] = [];
          if (ingredientsMatch) {
            const itemMatches = [
              ...ingredientsMatch[1].matchAll(
                /<item>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<qty>(.*?)<\/qty>[\s\S]*?<\/item>/g
              ),
            ];
            for (const match of itemMatches) {
              ingredients.push({ name: match[1].trim(), qty: match[2].trim() });
            }
          }

          const steps: string[] = [];
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
              steps,
              sourceId: currentRecipe?.sourceId, // Preserve origin across AI edits (undefined for from-scratch builds)
            };
          }
        }

        const displayText = fullText.replace(/<recipe>[\s\S]*?<\/recipe>/g, "").trim();
        setMessages((m) => m.map(msg =>
          msg.id === aiMessageId ? { ...msg, text: displayText || "..." } : msg
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
            id: ++messageIdRef.current,
            role: "ai",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ]);
      }
    })();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", background: "#FAF7F2" }}>
      {/* Header - Logo (and Write your own button when empty) */}
      {!expanded && (
        <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 0 24px", flexShrink: 0, position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <img
              src={watermarkCircle}
              alt="Tipsy Dinner"
              style={{
                height: 36,
                width: "auto",
                display: "block",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isEmpty && (
              <button
                onClick={() => push({ name: "addown" })}
                style={{
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
                  fontFamily: "Inter, sans-serif",
                }}
              >
                Write a recipe
              </button>
            )}
            {!isEmpty && (
              <button
                onClick={() => setShowRefreshConfirm(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "rgba(35,60,0,0.5)",
                  padding: 0,
                }}
                aria-label="Refresh chat"
              >
                <IconRefresh size={20} stroke={1.5} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      {isEmpty ? (
        <>
          {/* Hero text */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 32px 20px", position: "relative", zIndex: 1 }}>
            <div style={{
              fontFamily: "Inter, sans-serif",
              fontStyle: "normal",
              fontSize: 30,
              fontWeight: 300,
              color: "#233C00",
              textTransform: "lowercase",
              lineHeight: 1.1,
              textAlign: "center",
            }}>
              what's on<br />the menu?
            </div>
          </div>

          {/* Prompt chips - horizontal scrolling row */}
          <div style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "row",
            overflowX: "auto",
            padding: "0 20px 8px",
            position: "relative",
            zIndex: 1,
            gap: 12,
            WebkitOverflowScrolling: "touch",
          }}>
            {displayChips.map((chip, index) => (
              <button
                key={index}
                onClick={() => handleChipClick(chip.prompt)}
                style={{
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
                  flexShrink: 0,
                }}
              >
                <div style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 700,
                  fontSize: 15,
                  color: "#233C00",
                  lineHeight: 1.2,
                }}>
                  {chip.header}
                </div>
                <div style={{
                  fontFamily: "Fraunces, serif",
                  fontStyle: "italic",
                  fontWeight: 300,
                  fontSize: 13,
                  color: "rgba(35,60,0,0.55)",
                  lineHeight: 1.2,
                }}>
                  {chip.body}
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "48px 20px 12px", display: "flex", flexDirection: "column", gap: 20, position: "relative", zIndex: 1 }}>
          {messages.map((m) => (
            <ChatBubble key={m.id} role={m.role} text={m.text} />
          ))}
          {typing && <TypingBubble />}
          {generatingRecipe && <RecipeGeneratingIndicator />}
        </div>
      )}

      {/* Expanded recipe overlay — grows upward out of the mini player */}
      {currentRecipe && (
        <ExpandedRecipeOverlay
          open={expanded}
          bottomOffset={bottomBarHeight}
          onSave={() => {
            // If recipe has a sourceId, show update-vs-save-as-new choice
            // Otherwise, go straight to normal save flow
            if (currentRecipe.sourceId) {
              setShowUpdateChoice(true);
            } else {
              setTrayOpen(true);
            }
          }}
          recipe={currentRecipe}
        />
      )}

      {/* Bottom bars (mini player + input) — never move, never hide */}
      <div ref={bottomBarRef} style={{ flexShrink: 0, position: "relative", zIndex: 60 }}>
        {recipeRevealed && currentRecipe && (
          <div
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "#FAF7F2",
              borderTop: "1px solid rgba(35,60,0,0.08)",
              padding: "12px 20px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: "pointer",
              opacity: !miniBarVisible ? 0 : (generatingRecipe && recipeRevealed ? 0.5 : 1),
              transition: generatingRecipe ? "opacity 300ms ease" : "opacity 600ms ease",
              boxShadow: recipePulse ? "0 0 0 rgba(42, 78, 90, 0)" : "0 0 0 rgba(42, 78, 90, 0)",
              animation: recipePulse ? "tipsyRecipePulse 800ms ease-out" : "none",
            }}
          >
            <img
              src={watermarkSquare}
              alt=""
              style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                display: "block",
                border: "none",
                background: "none",
              }}
            />
            <div style={{
              flex: 1, overflow: "hidden",
              opacity: miniTitleVisible ? 1 : 0,
              transition: "opacity 150ms ease",
            }}>
              <div style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "rgba(35,60,0,0.35)",
                fontWeight: 500,
              }}>
                Recipe ready
              </div>
              <div style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 15,
                color: "#233C00",
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {currentRecipe.title}
              </div>
            </div>
            <div style={{ color: "rgba(35,60,0,0.35)", fontSize: 18, flexShrink: 0, lineHeight: 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={expanded ? "6 9 12 15 18 9" : "18 15 12 9 6 15"} />
              </svg>
            </div>
          </div>
        )}
        <style>{`
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
        `}</style>

        <CookInputBar
          value={input}
          onChange={setInput}
          onSend={sendMessage}
          placeholder={placeholder}
          disabled={typing}
        />
      </div>

      {/* Update-vs-Save-as-New choice sheet */}
      {showUpdateChoice && currentRecipe && (
        <div
          onClick={() => setShowUpdateChoice(false)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(35, 60, 0, 0.08)",
            zIndex: 80,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            animation: "tipsy-fade 0.22s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FAF7F2",
              borderRadius: "24px 24px 0 0",
              padding: "16px 20px 24px",
              width: "100%",
              animation: "tipsy-slideup 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(35,60,0,0.15)", margin: "0 auto 20px" }} />

            {/* Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Primary: Update */}
              <button
                onClick={async () => {
                  setShowUpdateChoice(false);
                  // Update path (Step 4)
                  await onUpdateRecipe();
                }}
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  background: "#233C00",
                  color: "#FAF7F2",
                  border: "none",
                  borderRadius: 14,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 15,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                }}
              >
                Update {currentRecipe.title}
              </button>

              {/* Secondary: Save as new */}
              <button
                onClick={() => {
                  setShowUpdateChoice(false);
                  setSaveAsNewName(currentRecipe.title); // Prefill with base recipe's title
                  setShowNameInput(true);
                }}
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  background: "rgba(35,60,0,0.06)",
                  color: "#233C00",
                  border: "1px solid rgba(35,60,0,0.12)",
                  borderRadius: 14,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 15,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                }}
              >
                Save as new
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Name input sheet for save-as-new */}
      {showNameInput && currentRecipe && (
        <div
          onClick={() => setShowNameInput(false)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(35, 60, 0, 0.08)",
            zIndex: 80,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            animation: "tipsy-fade 0.22s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FAF7F2",
              borderRadius: "24px 24px 0 0",
              padding: "16px 20px 24px",
              width: "100%",
              animation: "tipsy-slideup 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(35,60,0,0.15)", margin: "0 auto 20px" }} />

            {/* Label */}
            <div style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "rgba(35,60,0,0.35)",
              marginBottom: 10,
            }}>
              Recipe name
            </div>

            {/* Name input */}
            <input
              type="text"
              value={saveAsNewName}
              onChange={(e) => setSaveAsNewName(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                padding: "14px 16px",
                background: "rgba(35,60,0,0.05)",
                border: "1px solid rgba(35,60,0,0.12)",
                borderRadius: 10,
                fontFamily: "Inter, sans-serif",
                fontSize: 16,
                color: "#233C00",
                outline: "none",
                marginBottom: 16,
              }}
            />

            {/* Continue button */}
            <button
              onClick={() => {
                if (!saveAsNewName.trim()) return;
                setShowNameInput(false);
                // Update the currentRecipe title with the new name, then open save flow
                setCurrentRecipe({
                  ...currentRecipe,
                  title: saveAsNewName.trim(),
                });
                setTrayOpen(true);
              }}
              disabled={!saveAsNewName.trim()}
              style={{
                width: "100%",
                padding: "16px 20px",
                background: saveAsNewName.trim() ? "#233C00" : "rgba(35,60,0,0.2)",
                color: "#FAF7F2",
                border: "none",
                borderRadius: 14,
                fontFamily: "Inter, sans-serif",
                fontSize: 15,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                cursor: saveAsNewName.trim() ? "pointer" : "not-allowed",
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Bottom sheet: pick a category to save the AI recipe */}
      {trayOpen && (
        <SaveRecipeFlow
          onClose={() => {
            setTrayOpen(false);
            setNewCategorySelection(null);
          }}
          onPick={onPickCategory}
          onNew={onPickNewCategory}
          initialSelectedCategory={newCategorySelection}
        />
      )}

      {/* Refresh confirmation modal */}
      {showRefreshConfirm && (
        <div
          onClick={() => setShowRefreshConfirm(false)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(35,60,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FAF7F2",
              borderRadius: 16,
              padding: "24px 20px",
              width: "100%",
              maxWidth: 280,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              border: "0.5px solid rgba(35,60,0,0.1)",
            }}
          >
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#233C00",
              textAlign: "center",
            }}>
              Refresh this chat?
            </div>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              color: "#233C00",
              textAlign: "center",
              marginBottom: 12,
            }}>
              This will clear the conversation and start fresh.
            </div>
            <button
              onClick={() => setShowRefreshConfirm(false)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                background: "transparent",
                border: "0.5px solid rgba(35,60,0,0.1)",
                color: "#233C00",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onClearConversation();
                setShowRefreshConfirm(false);
              }}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                background: "#FEE7C0",
                border: "none",
                color: "#233C00",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function ChatBubble({ role, text }: { role: "user" | "ai"; text: string }) {
  const isUser = role === "user";

  // Simple markdown renderer for AI messages
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let key = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if it's a numbered list item (e.g., "1. ", "2. ", etc.)
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        const num = numberedMatch[1];
        const content = numberedMatch[2];
        elements.push(
          <div key={key++} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span style={{ fontWeight: 500, flexShrink: 0 }}>{num}.</span>
            <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.+?)\*\*/g, '<span style="font-weight: 700; font-family: Inter, sans-serif; color: #233C00">$1</span>') }} />
          </div>
        );
        continue;
      }

      // Regular line with potential bold formatting
      if (line.trim()) {
        const html = line.replace(/\*\*(.+?)\*\*/g, '<span style="font-weight: 700; font-family: Inter, sans-serif; color: #233C00">$1</span>');
        elements.push(
          <div key={key++} style={{ marginBottom: i < lines.length - 1 ? 8 : 0 }}>
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        );
      } else if (i < lines.length - 1) {
        // Empty line - add spacing
        elements.push(<div key={key++} style={{ height: 8 }} />);
      }
    }

    return <>{elements}</>;
  };

  if (isUser) {
    // User messages - green bubble with cream text
    return (
      <div
        style={{
          alignSelf: "flex-end",
          background: "#233C00",
          color: "#FEE7C0",
          fontFamily: "Inter, sans-serif",
          fontSize: 15,
          padding: "11px 16px",
          borderRadius: "18px 18px 4px 18px",
          maxWidth: "72%",
          lineHeight: 1.4,
          animation: "tipsyChatIn 300ms ease",
        }}
      >
        {text}
        <style>{`@keyframes tipsyChatIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }`}</style>
      </div>
    );
  }

  // AI messages - no bubble, Inter text on cream
  return (
    <div
      style={{
        alignSelf: "flex-start",
        color: "#233C00",
        fontFamily: "Inter, sans-serif",
        fontWeight: 400,
        fontSize: 15,
        maxWidth: "88%",
        lineHeight: 1.55,
        padding: "4px 0",
        animation: "tipsyChatIn 300ms ease",
      }}
    >
      {renderMarkdown(text)}
      <style>{`@keyframes tipsyChatIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }`}</style>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{
      alignSelf: "flex-start",
      display: "flex",
      gap: 4,
      alignItems: "center",
      padding: "4px 0",
    }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "rgba(35,60,0,0.5)",
            display: "inline-block",
            animation: `tipsyDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes tipsyDot { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }`}</style>
    </div>
  );
}

function RecipeGeneratingIndicator() {
  return (
    <div style={{
      alignSelf: "flex-start",
      display: "flex",
      gap: 4,
      alignItems: "center",
      padding: "4px 0",
    }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "rgba(35,60,0,0.5)",
            display: "inline-block",
            animation: `tipsyRecipeDot 1.4s ease-in-out ${i * 0.25}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes tipsyRecipeDot { 0%,100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 0.8; transform: scale(1.1); } }`}</style>
    </div>
  );
}

function CookInputBar({ value, onChange, onSend, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = "auto";
      // Set height based on scrollHeight, capped at 8 lines (168px)
      const newHeight = Math.min(textareaRef.current.scrollHeight, 168);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [value]);

  return (
    <div style={{ padding: "8px 16px 12px", flexShrink: 0, background: "#FAF7F2", borderTop: "1px solid rgba(35,60,0,0.08)", position: "relative", zIndex: 1, margin: 0, boxShadow: "none" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        background: "rgba(35,60,0,0.05)",
        border: "1px solid rgba(35,60,0,0.1)",
        borderRadius: 26,
        padding: "10px 16px",
        gap: 10,
      }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          rows={1}
          className="tipsy-input"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: "Inter, sans-serif",
            fontSize: 16,
            color: "#233C00",
            resize: "none",
            overflowY: "auto",
            maxHeight: 168,
            lineHeight: 1.4,
            padding: 0,
          }}
        />
        <style>{`
          .tipsy-input::placeholder {
            color: rgba(35,60,0,0.3);
          }
        `}</style>
        <button
          onClick={onSend}
          disabled={disabled}
          aria-label="Send"
          style={{
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
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={value.trim() ? "#FEE7C0" : "rgba(35,60,0,0.3)"} stroke="none">
            <path d="M2 12L22 2L15 22L11 13L2 12Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ExpandedRecipeOverlay({ open, bottomOffset, onSave, recipe }: {
  open: boolean;
  bottomOffset: number;
  onSave: () => void;
  recipe: {
    title: string;
    description: string;
    ingredients: { name: string; qty: string }[];
    steps: string[];
  };
}) {
  const [tab, setTab] = useState<"ingredients" | "steps">("ingredients");
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: bottomOffset,
        top: 0,
        pointerEvents: shown ? "auto" : "none",
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: shown ? "100%" : 0,
          background: "#FAF7F2",
          transition: "height 350ms cubic-bezier(0.22, 1, 0.36, 1)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
      <div style={{
        opacity: contentVisible ? 1 : 0,
        transition: "opacity 200ms ease",
        display: "flex", flexDirection: "column", height: "100%",
        background: "#FAF7F2",
      }}>
      {/* Sheet header */}
      <div style={{ padding: "20px 16px 12px", flexShrink: 0, display: "grid", gridTemplateColumns: "32px 1fr 32px", alignItems: "center", background: "#FAF7F2" }}>
        <span />
        <div style={{
          textAlign: "center",
          fontFamily: "Inter, sans-serif",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "rgba(35,60,0,0.35)",
          fontWeight: 500,
        }}>
          RECIPE PREVIEW
        </div>
        <span />
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {/* Hero section - scrolls normally */}
        <div style={{ height: 120, background: "#FAF7F2" }} />
        <div style={{ padding: "16px 24px 14px" }}>
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "rgba(35,60,0,0.35)",
            marginBottom: 6,
            fontWeight: 500,
          }}>
            Recipe
          </div>
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 28,
            fontWeight: 700,
            color: "#233C00",
            lineHeight: 1.1,
            marginBottom: 8,
            textTransform: "uppercase",
          }}>
            {recipe.title}
          </div>
          <div style={{
            fontFamily: "Fraunces, serif",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 15,
            color: "rgba(35,60,0,0.55)",
            lineHeight: 1.5,
          }}>
            {recipe.description}
          </div>
        </div>

        {/* Sticky Tabs - stick to top when scrolled */}
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#FAF7F2",
          borderBottom: "1px solid rgba(35,60,0,0.08)",
        }}>
          <div style={{
            display: "flex",
            gap: 28,
            padding: "20px 24px 0",
          }}>
            {(["ingredients", "steps"] as const).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
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
                    padding: "0 0 12px 0",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Both tabs rendered, only one visible */}
        <div style={{ display: tab === "ingredients" ? "block" : "none" }}>
          {recipe.ingredients.map((item, i) => (
            <div key={i} style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
              padding: "12px 24px",
              borderBottom: "1px dotted rgba(35,60,0,0.1)",
            }}>
              <span style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 15,
                fontWeight: 400,
                color: "#233C00",
                textAlign: "left",
                flex: 1,
                maxWidth: "58%",
              }}>{item.name}</span>
              <span style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
                color: "rgba(35,60,0,0.4)",
                textAlign: "right",
                flexShrink: 0,
                maxWidth: "40%",
              }}>{item.qty}</span>
            </div>
          ))}
        </div>
        <div style={{ display: tab === "steps" ? "block" : "none" }}>
          {recipe.steps.map((s, i) => (
            <div key={i} style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              padding: "12px 24px",
              borderBottom: "1px dotted rgba(35,60,0,0.1)",
            }}>
              <div style={{
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
                color: "rgba(35,60,0,0.4)",
              }}>{i + 1}</div>
              <span style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                fontWeight: 400,
                color: "#233C00",
                lineHeight: 1.6,
                flex: 1,
              }}>{s}</span>
            </div>
          ))}
        </div>
        {/* Save button */}
        <button
          onClick={onSave}
          style={{
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
            fontWeight: 500,
          }}
        >
          Save
        </button>
      </div>
      </div>
      </div>
    </div>
  );
}
