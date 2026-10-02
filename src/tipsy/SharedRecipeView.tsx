import type { RecipeShareSnapshot } from "./data";

// Logged-out in-app view for a stranger who tapped "View in app" on a public
// share page (/r/$token) while they have no session. Hand-matches the
// recipe-display presentation already established by ReceivedRecipeView
// (Home.tsx) and the public share page (routes/r.$token.tsx) rather than
// importing either — same convention CLAUDE.md documents for RecipeCard:
// a sibling view, not a fused/shared component. Read-only: no save action
// lives here (chunk 3), no AI calls, no writes.

const C = {
  bg: "#FAF7F2",
  text: "#233C00",
};

type Props = {
  snapshot: RecipeShareSnapshot;
  onSignUp: () => void;
  onSignIn: () => void;
};

export default function SharedRecipeView({ snapshot, onSignUp, onSignIn }: Props) {
  // FUNNEL HOOK: share_view_in_app — logged-out in-app share view rendered
  const ingredients = snapshot.ingredients ?? [];
  const steps = snapshot.steps ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "56px 24px 24px" }}>
          {snapshot.photoUrl && (
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "4 / 3",
                  borderRadius: 30,
                  overflow: "hidden",
                  background: "rgba(35,60,0,0.06)",
                }}
              >
                <img
                  src={snapshot.photoUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 700,
                fontSize: 28,
                letterSpacing: "0.04em",
                textTransform: "capitalize",
                color: C.text,
                lineHeight: 1.1,
              }}
            >
              {snapshot.title}
            </div>
          </div>

          {snapshot.sharerName && (
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 12,
                fontWeight: 500,
                color: "rgba(35,60,0,0.5)",
                marginBottom: 12,
              }}
            >
              inspired by {snapshot.sharerName}
            </div>
          )}

          {snapshot.description && (
            <div
              style={{
                fontFamily: "Fraunces, serif",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: 15,
                color: "rgba(35,60,0,0.55)",
                lineHeight: 1.5,
                marginBottom: 24,
              }}
            >
              {snapshot.description}
            </div>
          )}

          {ingredients.length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <h2
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 500,
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: C.text,
                  marginBottom: 16,
                }}
              >
                Ingredients
              </h2>
              <div>
                {ingredients.map((ingredient, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "12px 0",
                      borderBottom: idx === ingredients.length - 1 ? "none" : "1px dotted rgba(35,60,0,0.1)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 15,
                        fontWeight: 400,
                        color: C.text,
                        textAlign: "left",
                        flex: 1,
                        maxWidth: "58%",
                      }}
                    >
                      {ingredient.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 14,
                        fontWeight: 500,
                        fontVariantNumeric: "tabular-nums",
                        color: "rgba(35,60,0,0.4)",
                        textAlign: "right",
                        flexShrink: 0,
                        maxWidth: "40%",
                      }}
                    >
                      {ingredient.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {steps.length > 0 && (
            <div>
              <h2
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 500,
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: C.text,
                  marginBottom: 16,
                }}
              >
                Steps
              </h2>
              <div>
                {steps.map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "flex-start",
                      marginBottom: idx === steps.length - 1 ? 0 : 20,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 18,
                        fontWeight: 500,
                        color: "rgba(35,60,0,0.3)",
                        flexShrink: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <p
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 14,
                        fontWeight: 400,
                        color: C.text,
                        lineHeight: 1.6,
                        margin: 0,
                      }}
                    >
                      {step.title && <span style={{ fontWeight: 600 }}>{step.title}{" — "}</span>}
                      {step.instruction}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          padding: "16px 24px 28px",
          borderTop: "1px solid rgba(35,60,0,0.08)",
        }}
      >
        <button
          onClick={() => {
            // FUNNEL HOOK: share_view_signup_tap — "Sign up to save" tapped from the logged-out share view
            onSignUp();
          }}
          style={{
            width: "100%",
            background: "#233C00",
            color: "#FAF7F2",
            border: "none",
            borderRadius: 14,
            padding: "14px 0",
            fontFamily: "Inter, sans-serif",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Sign up to save
        </button>
        <button
          onClick={() => {
            // FUNNEL HOOK: share_view_signin_tap — "Already have an account? Sign in" tapped from the logged-out share view
            onSignIn();
          }}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: "rgba(35,60,0,0.5)",
            cursor: "pointer",
          }}
        >
          Already have an account? Sign in
        </button>
      </div>
    </div>
  );
}
