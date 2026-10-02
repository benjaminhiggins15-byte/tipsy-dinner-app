import ExpandedRecipeOverlay from "./ExpandedRecipeOverlay";
import type { RecipeShareSnapshot } from "./data";

// Logged-out in-app view for a stranger who tapped "View in app" on a public
// share page (/r/$token) while they have no session. Reuses Build's actual
// "RECIPE PREVIEW" component (ExpandedRecipeOverlay) rather than
// hand-matching its styles, so the two stay in sync automatically — the
// point is a preview of the Build creation experience, not a repeat of the
// public share page. Read-only: no save action lives here (chunk 3), no AI
// calls, no writes.
//
// photoUrl is passed through for display only (public URL fetch) — no
// storage/SDK access here; the real photo copy happens at save time (chunk 3).

type Props = {
  snapshot: RecipeShareSnapshot;
  onSignUp: () => void;
  onSignIn: () => void;
};

export default function SharedRecipeView({ snapshot, onSignUp, onSignIn }: Props) {
  // FUNNEL HOOK: share_view_in_app — logged-out in-app share view rendered
  return (
    <ExpandedRecipeOverlay
      open={true}
      bottomOffset={0}
      recipe={snapshot}
      sharerName={snapshot.sharerName}
      photoUrl={snapshot.photoUrl}
      saveLabel="Sign up to save"
      onSave={() => {
        // FUNNEL HOOK: share_view_signup_tap — "Sign up to save" tapped from the logged-out share view
        onSignUp();
      }}
      onSignIn={() => {
        // FUNNEL HOOK: share_view_signin_tap — "Already have an account? Sign in" tapped from the logged-out share view
        onSignIn();
      }}
    />
  );
}
