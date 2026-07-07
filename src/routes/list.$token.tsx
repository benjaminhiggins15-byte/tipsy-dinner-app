import { createFileRoute } from "@tanstack/react-router";
import { getPublicGroceryListByToken, groupGroceryItems, GROCERY_AISLE_LABELS } from "../tipsy/data";
import watermarkCircle from "../Logos/watermark_circle.png";

export const Route = createFileRoute("/list/$token")({
  loader: async ({ params }) => {
    const items = await getPublicGroceryListByToken(params.token);
    return { items };
  },
  component: PublicGroceryListPage,
});

function PublicGroceryListPage() {
  const { items } = Route.useLoaderData();

  if (!items) {
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
            List not found
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
            This grocery list may have been removed or the link is incorrect.
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

  const sections = groupGroceryItems(items);

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
            marginBottom: "40px",
          }}
        >
          Grocery List
        </h1>

        {sections.length === 0 && (
          <p
            style={{
              fontFamily: "Fraunces, serif",
              fontStyle: "italic",
              fontSize: "15px",
              color: "rgba(35,60,0,0.55)",
              lineHeight: 1.5,
              marginBottom: "48px",
            }}
          >
            Nothing here yet.
          </p>
        )}

        {/* Aisle sections */}
        {sections.map((section, sectionIdx) => (
          <div
            key={section.aisle}
            style={{ marginBottom: sectionIdx === sections.length - 1 ? "48px" : "32px" }}
          >
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
              {GROCERY_AISLE_LABELS[section.aisle] ?? section.aisle}
            </h2>
            <div>
              {section.groups.map((group) => (
                <div
                  key={group.label}
                  style={{
                    padding: "14px 0",
                    borderBottom: "1px dotted rgba(35,60,0,0.1)",
                  }}
                >
                  {group.rows.length === 1 ? (
                    <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                      <span
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: "15px",
                          fontWeight: 400,
                          color: group.rows[0].checked ? "rgba(35,60,0,0.35)" : "#233C00",
                          textDecoration: group.rows[0].checked ? "line-through" : "none",
                          textAlign: "left",
                          flex: 1,
                          maxWidth: "58%",
                        }}
                      >
                        {group.label}
                      </span>
                      <span
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: "14px",
                          fontWeight: 500,
                          fontVariantNumeric: "tabular-nums",
                          color: group.rows[0].checked ? "rgba(35,60,0,0.25)" : "rgba(35,60,0,0.55)",
                          textDecoration: group.rows[0].checked ? "line-through" : "none",
                          textAlign: "right",
                          flexShrink: 0,
                          maxWidth: "40%",
                        }}
                      >
                        {group.rows[0].quantityText}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: "15px", fontWeight: 400, color: "#233C00", marginBottom: "8px" }}>
                        {group.label}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "4px" }}>
                        {group.rows.map((row) => (
                          <div key={row.key} style={{ display: "flex", justifyContent: "flex-end" }}>
                            <span
                              style={{
                                fontFamily: "Inter, sans-serif",
                                fontSize: "14px",
                                fontWeight: 500,
                                fontVariantNumeric: "tabular-nums",
                                color: row.checked ? "rgba(35,60,0,0.25)" : "rgba(35,60,0,0.55)",
                                textDecoration: row.checked ? "line-through" : "none",
                              }}
                            >
                              {row.quantityText}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

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
