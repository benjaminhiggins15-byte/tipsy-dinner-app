import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getPublicRecipeByToken, getRecipeSnapshotByToken, normalizeStep } from "../tipsy/data";
import watermarkCircle from "../Logos/watermark_circle.png";

export const Route = createFileRoute("/r/$token")({
  loader: async ({ params }) => {
    // Frozen snapshots (recipe_shares) are checked first — this is the path
    // every new share writes to. Falls back to the live-recipe lookup for
    // tokens minted before this change, so old links keep resolving.
    const snapshot = await getRecipeSnapshotByToken(params.token);
    if (snapshot) {
      return { recipe: snapshot };
    }
    const recipe = await getPublicRecipeByToken(params.token);
    return { recipe };
  },
  component: PublicRecipePage,
});

function PublicRecipePage() {
  const { recipe } = Route.useLoaderData();
  const [photoFailed, setPhotoFailed] = useState(false);

  if (!recipe) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#FAF7F2",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "640px",
            width: "100%",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 700,
              fontSize: "32px",
              letterSpacing: "0.04em",
              textTransform: "capitalize",
              color: "#233C00",
              lineHeight: 1.1,
              marginBottom: "12px",
            }}
          >
            Recipe not found
          </h1>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontStyle: "italic",
              fontSize: "15px",
              color: "rgba(35,60,0,0.55)",
              lineHeight: 1.5,
            }}
          >
            This recipe may have been removed or the link is incorrect.
          </p>

          {/* Footer */}
          <div
            style={{
              marginTop: "80px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <img
              src={watermarkCircle}
              alt="Tipsy Dinner"
              style={{ width: "36px", height: "36px" }}
            />
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                fontSize: "12px",
                color: "rgba(35,60,0,0.55)",
              }}
            >
              Made with Tipsy Dinner
            </div>
            <a
              href="https://tipsy-dinner-app.vercel.app"
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                fontSize: "12px",
                color: "#233C00",
                textDecoration: "none",
              }}
            >
              View in app
            </a>
          </div>
        </div>
      </div>
    );
  }

  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];
  // Legacy live-shared recipes (getPublicRecipeByToken) have no photoUrl
  // field at all — 'in' narrows the union so this stays a no-op for them,
  // deliberately leaving that path untouched.
  const photoUrl = "photoUrl" in recipe ? recipe.photoUrl : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAF7F2",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "640px",
          width: "100%",
          paddingTop: "56px",
        }}
      >
        {/* Hero photo — renders only when the share has a photo that hasn't
            failed to load; on failure, collapses with no broken-image icon,
            matching a share that never had one. */}
        {photoUrl && !photoFailed && (
          <div
            style={{
              width: "100%",
              aspectRatio: "4 / 3",
              borderRadius: 30,
              overflow: "hidden",
              background: "rgba(35,60,0,0.06)",
              marginBottom: 18,
            }}
          >
            <img
              src={photoUrl}
              alt=""
              onError={() => setPhotoFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        )}

        {/* Title */}
        <h1
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 700,
            fontSize: "32px",
            letterSpacing: "0.04em",
            textTransform: "capitalize",
            color: "#233C00",
            lineHeight: 1.1,
            marginBottom: "8px",
          }}
        >
          {recipe.title}
        </h1>

        {/* Description */}
        {recipe.description && (
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontStyle: "italic",
              fontSize: "15px",
              color: "rgba(35,60,0,0.55)",
              lineHeight: 1.5,
              marginBottom: "24px",
            }}
          >
            {recipe.description}
          </p>
        )}

        {/* Meta row (cook time · serves) */}
        {(recipe.cookTime || recipe.serves) && (
          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 500,
              color: "rgba(35,60,0,0.5)",
              marginBottom: "40px",
              marginTop: "16px",
            }}
          >
            {recipe.cookTime}
            {recipe.cookTime && recipe.serves && " · "}
            {recipe.serves && `Serves ${recipe.serves}`}
          </div>
        )}

        {/* Ingredients section */}
        {ingredients.length > 0 && (
          <div style={{ marginBottom: "48px" }}>
            <h2
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                fontSize: "11px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#233C00",
                marginBottom: "16px",
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
                    gap: "8px",
                    padding: "14px 0",
                    borderBottom:
                      idx === ingredients.length - 1
                        ? "none"
                        : "1px dotted rgba(35,60,0,0.1)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "15px",
                      fontWeight: 400,
                      color: "#233C00",
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
                      fontSize: "14px",
                      fontWeight: 500,
                      fontVariantNumeric: "tabular-nums",
                      color: "rgba(35,60,0,0.55)",
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

        {/* Steps section */}
        {steps.length > 0 && (
          <div style={{ marginBottom: "80px" }}>
            <h2
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                fontSize: "11px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#233C00",
                marginBottom: "16px",
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
                    gap: "14px",
                    alignItems: "flex-start",
                    marginBottom: idx === steps.length - 1 ? 0 : "24px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "18px",
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
                      fontSize: "14px",
                      fontWeight: 400,
                      color: "#233C00",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {normalizeStep(step).title && (
                      <span style={{ fontWeight: 600 }}>
                        {normalizeStep(step).title}
                        {" — "}
                      </span>
                    )}
                    {normalizeStep(step).instruction}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            paddingTop: "40px",
            borderTop: "1px solid rgba(35,60,0,0.08)",
          }}
        >
          <img
            src={watermarkCircle}
            alt="Tipsy Dinner"
            style={{ width: "36px", height: "36px" }}
          />
          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              fontSize: "12px",
              color: "rgba(35,60,0,0.55)",
            }}
          >
            Made with Tipsy Dinner
          </div>
          <a
            href="https://tipsy-dinner-app.vercel.app"
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              fontSize: "12px",
              color: "#233C00",
              textDecoration: "none",
            }}
          >
            View in app
          </a>
        </div>
      </div>
    </div>
  );
}
