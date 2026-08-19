// THROWAWAY verification script for Stage G. Not wired into the app, not committed.
// Mints a real user-scoped session for Ben Higgins via the admin API (generateLink +
// verifyOtp with the token hash), then drives the deployed compute-slice function
// twice (cold + warm) exactly as a real client would, using the real access_token.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error("Missing required env vars");
}

const BEN_ID = "0e81fa42-9261-4869-9d53-6336ddd0f8ee";
const BEN_EMAIL = "benjamin.higgins15@gmail.com";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anon = createClient(SUPABASE_URL, ANON_KEY);

console.log("=== Minting real session for Ben Higgins ===");

const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: BEN_EMAIL,
});

if (linkError) {
  console.error("generateLink FAILED:", linkError);
  process.exit(1);
}

const tokenHash = linkData.properties?.hashed_token;
if (!tokenHash) {
  console.error("No hashed_token in generateLink response:", linkData.properties);
  process.exit(1);
}

const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({
  type: "magiclink",
  token_hash: tokenHash,
});

if (verifyError || !verifyData.session) {
  console.error("verifyOtp FAILED:", verifyError);
  process.exit(1);
}

const session = verifyData.session;
console.log("Session minted. user.id =", session.user.id, "(expect match to", BEN_ID, ")");
console.log("user.id matches Ben:", session.user.id === BEN_ID);
console.log("access_token (first 20 chars):", session.access_token.slice(0, 20) + "...");

const accessToken = session.access_token;

function todayLocalDate() {
  // America/New_York local date, matching the client's localDateString() intent.
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

const localDate = todayLocalDate();
console.log("\nUsing local_date:", localDate);

async function callComputeSlice(label) {
  console.log(`\n=== ${label}: POST compute-slice ===`);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/compute-slice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ local_date: localDate }),
  });
  const text = await res.text();
  console.log("HTTP status:", res.status);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.log("Raw (non-JSON) body:", text);
    return null;
  }
  console.log(JSON.stringify(json, null, 2));
  return json;
}

const call1 = await callComputeSlice("CALL 1 (cold)");
const call2 = await callComputeSlice("CALL 2 (warm, immediate repeat)");

console.log("\n=== Comparison ===");
console.log("Call 1 computed:", call1?.computed);
console.log("Call 2 computed:", call2?.computed);
console.log("Call 1 recipe_ids:", call1?.slice?.recipe_ids);
console.log("Call 2 recipe_ids:", call2?.slice?.recipe_ids);
console.log(
  "recipe_ids identical:",
  JSON.stringify(call1?.slice?.recipe_ids) === JSON.stringify(call2?.slice?.recipe_ids)
);
