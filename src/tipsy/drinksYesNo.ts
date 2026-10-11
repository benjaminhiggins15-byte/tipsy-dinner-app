// Deterministic (no AI) classifier for the onboarding drinks question's
// yes/no branch (Onboarding.tsx's "drinks" stage). A clean "no" or a bare
// "yes" short-circuits past the AI-backed drink-preference parser
// (parseDrinkPreference/saveDrinkPreference in data.ts) entirely; only
// "other" (a free-text answer naming an actual drink, or any other
// phrasing) goes on to that AI call. Whole-answer match only, never a
// prefix/substring match — "no beer, but i love wine" must NOT match the NO
// bucket just because it starts with "no".

export type DrinksAnswerClassification = "no" | "yes" | "other";

const CLEAR_NO_ANSWERS = new Set([
  "no",
  "nope",
  "nah",
  "no thanks",
  "no thank you",
  "no, thanks",
  "not really",
  "not for me",
  "pass",
  "skip",
  "i'm good",
  "im good",
  "nah i'm good",
  "i don't drink",
  "i dont drink",
  "no i don't drink",
  "no, i don't drink",
  "i don't drink alcohol",
]);

const BARE_YES_ANSWERS = new Set([
  "yes",
  "yeah",
  "yep",
  "yup",
  "sure",
  "ok",
  "okay",
  "absolutely",
  "definitely",
  "of course",
  "please",
  "yes please",
  "sure thing",
  "why not",
]);

export function normalizeDrinksAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/[.,!?;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyDrinksAnswer(text: string): DrinksAnswerClassification {
  const normalized = normalizeDrinksAnswer(text);
  if (CLEAR_NO_ANSWERS.has(normalized)) return "no";
  if (BARE_YES_ANSWERS.has(normalized)) return "yes";
  return "other";
}
