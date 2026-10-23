import { supabase } from "./supabase";

// Mirrors the CHECK allowlist on public.user_events / public.log_event
// (migration 20261004000001_create_user_events.sql) exactly — keep both in
// sync. Typing this as a union, not `string`, makes a typo'd event name a
// compile error instead of a silent no-op inside log_event().
export type EventType =
  | "share_link_view"
  | "share_view_in_app"
  | "share_view_signup_tap"
  | "share_view_signin_tap"
  | "share_link_created"
  | "onboarding_started"
  | "onboarding_step_answered"
  | "onboarding_share_token_detected"
  | "onboarding_completed"
  | "discovered_shelf_mount"
  | "discovered_save_tap"
  | "discovered_save_category_picked"
  | "discovered_save_complete"
  | "app_open"
  | "recipe_saved"
  | "recipe_opened"
  | "riff_started"
  | "recipe_sent"
  | "grocery_list_shared"
  | "screen_view"
  | "cook_logged";

// Account-deletion kill switch (Phase 3 Step 7). Flips true the instant the
// user taps "Delete my account" on the confirmation screen — logEvent() and
// every ai-chat call site check this and no-op for the rest of the session,
// including across a failed delete attempt/retry (deletion is a destructive,
// idempotent-retry operation; nothing should be logged while one might still
// be in flight). A successful delete never resets this — there's no session
// left to log anything in. It is reset to false ONLY if the user explicitly
// cancels out of the delete-confirmation screen without the deletion ever
// succeeding, so normal logging/ai-chat resumes for the rest of their visit.
let accountDeletionInFlight = false;

export function beginAccountDeletion(): void {
  accountDeletionInFlight = true;
}

export function cancelAccountDeletion(): void {
  accountDeletionInFlight = false;
}

export function isAccountDeletionInFlight(): boolean {
  return accountDeletionInFlight;
}

const ANON_ID_KEY = "tipsyDinnerAnonId";

// localStorage can throw (Safari private mode, storage disabled, quota) —
// fall back to an in-memory id for the page lifetime rather than letting
// that take down event logging.
let memoryAnonId: string | null = null;

function getOrCreateAnonId(): string {
  try {
    let anonId = localStorage.getItem(ANON_ID_KEY);
    if (!anonId) {
      anonId = crypto.randomUUID();
      localStorage.setItem(ANON_ID_KEY, anonId);
    }
    return anonId;
  } catch {
    if (!memoryAnonId) memoryAnonId = crypto.randomUUID();
    return memoryAnonId;
  }
}

// Fire-and-forget. Never throws, never awaited by callers — a telemetry call
// must never affect the caller's control flow. Handles both the {error}
// result shape and a rejected promise (e.g. a network failure) so neither
// path can surface as an unhandled rejection.
export function logEvent(eventType: EventType, props: Record<string, unknown> = {}): void {
  if (accountDeletionInFlight) return;
  try {
    const anonId = getOrCreateAnonId();
    // .rpc() returns a thenable, not a native Promise — .then().catch() isn't
    // typesafe on it. The two-callback form of .then() still covers both the
    // {error} result shape AND a rejected promise (e.g. a network failure).
    supabase
      .rpc("log_event", { p_event_type: eventType, p_props: props, p_anon_id: anonId })
      .then(
        ({ error }) => {
          if (error) console.error("logEvent failed:", error.message, eventType);
        },
        (err: unknown) => {
          console.error("logEvent rejected:", err, eventType);
        }
      );
  } catch (err) {
    console.error("logEvent threw:", err);
  }
}
