import { useEffect } from "react";
import ExpandedRecipeOverlay from "./ExpandedRecipeOverlay";
import type { RecipeShareSnapshot } from "./data";
import { logEvent } from "../lib/events";

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
  shareToken: string;
  onSignUp: () => void;
  onSignIn: () => void;
};

export default function SharedRecipeView({ snapshot, shareToken, onSignUp, onSignIn }: Props) {
  // share_view_in_app — logged-out in-app share view rendered
  useEffect(() => {
    logEvent("share_view_in_app", { share_token: shareToken });
  }, [shareToken]);

  return (
    <ExpandedRecipeOverlay
      open={true}
      bottomOffset={0}
      recipe={snapshot}
      sharerName={snapshot.sharerName}
      photoUrl={snapshot.photoUrl}
      saveLabel="Sign up to save"
      onSave={() => {
        // share_view_signup_tap — "Sign up to save" tapped from the logged-out share view
        logEvent("share_view_signup_tap", { share_token: shareToken });
        onSignUp();
      }}
      onSignIn={() => {
        // share_view_signin_tap — "Already have an account? Sign in" tapped from the logged-out share view
        logEvent("share_view_signin_tap", { share_token: shareToken });
        onSignIn();
      }}
    />
  );
}
