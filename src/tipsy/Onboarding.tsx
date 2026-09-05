import { useState, useEffect, useRef, type CSSProperties } from "react";
import { generateTasteProfile, generateOnboardingReflection, parseNoGosAnswer, parseComposedConstraints } from "./data";
import { supabase } from "../lib/supabase";
import { ChatBubble, TypingBubble, CookInputBar } from "./ChatUI";

type ProfileType = {
  id: string;
  palate: string;
  inspiration: string;
  constraints: string;
  display_name: string;
  handle: string;
  onboarding_complete: boolean;
  taste_profile: string | null;
};

type Props = {
  onComplete: () => void;
  profile: ProfileType | null;
  onUpdate: (updates: Partial<ProfileType>) => Promise<void>;
};

// Bounded wait for generateTasteProfile to land before releasing to Home
// regardless — the fix for the confirmed handoff race (a brand-new user's
// first compute-slice call could previously run against a still-null
// taste_profile because navigation to Home never waited on this call at
// all). generateTasteProfile writes taste_profile directly via Supabase, with
// no path back into app state, so the only way to know it's actually ready is
// to poll the row itself. Never hangs past this ceiling. Tunable on-phone.
const HANDOFF_MAX_WAIT_MS = 6000;

// Poll interval while waiting on the ceiling above.
const TASTE_PROFILE_POLL_INTERVAL_MS = 400;

// Polls profiles.taste_profile for this user until it's populated or maxWaitMs
// elapses, releasing the instant it's ready rather than waiting the full
// ceiling. Any poll error is swallowed and treated as "not ready yet" — this
// runs during a stranger's first interaction with the app and must never
// throw or hang.
async function waitForTasteProfile(profileId: string, maxWaitMs: number, intervalMs: number): Promise<string | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("taste_profile")
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw error;
      if (data?.taste_profile) return data.taste_profile;
    } catch (err) {
      console.error("Taste profile poll failed, releasing at ceiling:", err);
      const remaining = deadline - Date.now();
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      return null;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
  return null;
}

type ChatMessage = { id: number; role: "user" | "ai"; text: string };
type Stage = "palate" | "inspiration" | "constraints" | "done";

// Build's AI text reveal (App.tsx's fireAICall/sendMessage) is driven by real
// token arrival over the ai-chat SSE stream — there's no timing constant to
// borrow from it, since Build never artificially paces text; it just renders
// whatever has arrived so far on every chunk. Onboarding's lines are
// hard-coded, so this constant drives a synthetic word-by-word reveal tuned
// to feel like that same progressive-arrival pace. Trivially tunable.
const SCRIPTED_REVEAL_MS_PER_WORD = 40;

// Duration of the typing-indicator dots shown before each scripted friend-
// message starts its word-by-word reveal. Deliberately longer than a real
// network-wait pause would be — on-phone testing found a short flash of dots
// register as rushed rather than a message clearly on its way. Tunable
// on-phone; does not affect SCRIPTED_REVEAL_MS_PER_WORD above.
const SCRIPTED_TYPING_INDICATOR_MS = 2000;

// Bounded wait for a reactive reflection line (generateOnboardingReflection)
// before the script falls back to a plain ack instead. Presentation-only
// pacing — never gates the profile write itself; handleSend fires the write
// and the reflection call concurrently, so a slow/failed reflection can
// never delay or block a write. Tunable on-phone.
const REFLECTION_TIMEOUT_MS = 2500;

// Bounded wait for the constraints parser (parseNoGosAnswer) specifically.
// Unlike the reflection above, this one DOES gate what gets written — the
// constraints write waits to know whether a composed, severity-labeled
// string is available — so it gets its own, slightly longer ceiling. On
// timeout or malformed output, the write falls back to the user's raw typed
// answer.
const CONSTRAINTS_PARSE_TIMEOUT_MS = 4000;

// Rotating plain acknowledgments for when a reflection isn't ready in time
// (timeout, network failure, or empty output) — never a hang, never a
// visible error, just a slightly less specific "I heard you" line. Rotated
// rather than always repeating "Got it." now that it's a visible fallback
// path rather than the only path.
const REFLECTION_FALLBACK_ACKS = ["Got it.", "Noted.", "Good to know."];

// Races a promise against a ceiling, resolving null (never rejecting) if the
// ceiling is hit first or the underlying promise rejects. Used to bound the
// reflection/parser calls above for UI pacing — the underlying data.ts
// functions are already fail-quiet on their own, this adds only a UX-facing
// time ceiling on top.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ms);
    promise
      .then((value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      })
      .catch((err) => {
        console.error("withTimeout: underlying promise rejected:", err);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
  });
}

// Scripted conversational onboarding. Reuses Build's chat presentation
// (ChatBubble, the messages[] list shape, the input bar, typing indicator)
// as a visual shell around a hard-wired script — NOT the Build engine
// (fireAICall/sendMessage/handleChipClick). Writes the same three profile
// fields (palate/inspiration/constraints) via the same onUpdate path the
// rest of the app uses.
function OnboardingChat({
  profile, onUpdate, onNext,
}: { profile: ProfileType | null; onUpdate: (updates: Partial<ProfileType>) => Promise<void>; onNext: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [stage, setStage] = useState<Stage>("palate");
  const idRef = useRef(0);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const answersRef = useRef({ palate: "", inspiration: "" });
  const fallbackAckIndexRef = useRef(0);

  const pushMessage = (role: "user" | "ai", text: string) => {
    idRef.current += 1;
    setMessages((prev) => [...prev, { id: idRef.current, role, text }]);
  };

  // Rotates through REFLECTION_FALLBACK_ACKS rather than always showing the
  // same line, since this is now a visible fallback path (reflection
  // timeout/failure) rather than the only path.
  const nextFallbackAck = (): string => {
    const ack = REFLECTION_FALLBACK_ACKS[fallbackAckIndexRef.current % REFLECTION_FALLBACK_ACKS.length];
    fallbackAckIndexRef.current += 1;
    return ack;
  };

  // Word-by-word reveal, extracted from sayAI so a reflection-driven message
  // (sayReflection below) can share the exact same reveal feel without
  // sayAI's fixed typing-indicator pause. Fail-soft: any reveal error snaps
  // straight to the full line rather than leaving a stuck partial one.
  const revealMessage = (text: string): Promise<void> =>
    new Promise<void>((resolve) => {
      idRef.current += 1;
      const id = idRef.current;
      setMessages((prev) => [...prev, { id, role: "ai", text: "" }]);

      const showFull = () => {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
        resolve();
      };

      try {
        const words = text.split(" ");
        let revealed = 0;
        const revealNext = () => {
          try {
            revealed += 1;
            const partial = words.slice(0, revealed).join(" ");
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: partial } : m)));
            if (revealed < words.length) {
              setTimeout(revealNext, SCRIPTED_REVEAL_MS_PER_WORD);
            } else {
              resolve();
            }
          } catch (err) {
            console.error("Scripted reveal step failed, showing full line:", err);
            showFull();
          }
        };
        revealNext();
      } catch (err) {
        console.error("Scripted reveal setup failed, showing full line:", err);
        showFull();
      }
    });

  // Presentational only — mirrors Build's typing-indicator-then-reveal feel
  // (ChatBubble/TypingBubble from ChatUI.tsx) with a synthetic word-by-word
  // reveal in place of Build's real token stream. Never affects what gets
  // written to `profiles` or when — callers already write via safeUpdate
  // before awaiting this.
  const sayAI = (text: string, pauseMs = SCRIPTED_TYPING_INDICATOR_MS): Promise<void> =>
    new Promise<void>((resolve) => {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        revealMessage(text).then(resolve);
      }, pauseMs);
    });

  // Reflection-driven variant of sayAI: shows the typing indicator for the
  // ACTUAL bounded network wait (awaitReflection is already
  // withTimeout()-bounded by the caller) instead of stacking the fixed
  // SCRIPTED_TYPING_INDICATOR_MS pause on top of it afterward. Stacking both
  // would make a reflection line take up to ~4.5s total (2.5s network wait +
  // 2s cosmetic pause) — clearly slower than a plain scripted line, which
  // defeats the point of a *reactive* reflection. Falls back to `fallback`
  // (a rotating plain ack) on timeout, error, or empty reflection text.
  const sayReflection = async (awaitReflection: Promise<string | null>, fallback: string): Promise<void> => {
    setTyping(true);
    let text: string | null = null;
    try {
      text = await awaitReflection;
    } catch (err) {
      console.error("Reflection wait failed:", err);
    }
    setTyping(false);
    await revealMessage(text || fallback);
  };

  // Fail-soft: a write failure must never block/hang the conversation or
  // surface an error to a brand-new user — the script always proceeds.
  const safeUpdate = async (updates: Partial<ProfileType>) => {
    try {
      await onUpdate(updates);
    } catch (err) {
      console.error("Onboarding write failed:", err);
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const firstName = profile?.display_name?.trim().split(" ")[0] || "";
    (async () => {
      await sayAI(
        firstName
          ? `Hey ${firstName}! Welcome to Tipsy Dinner, excited to cook together. Before we get going, I want to learn your taste a little. Three quick things, then I'll set up your kitchen around them.`
          : "Hey — welcome to Tipsy Dinner, excited to cook together. Before we get going, I want to learn your taste a little. Three quick things, then I'll set up your kitchen around them."
      );
      await sayAI("So: what makes your cooking yours? Cuisines you keep coming back to, flavors you lean on, the way you like to cook.");
      setAwaitingInput(true);
    })();
    // Run-once intro sequence — deliberately not re-keyed off profile/onUpdate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  const handleSend = async () => {
    if (!awaitingInput) return;
    const val = input.trim();
    if (!val) return;
    pushMessage("user", val);
    setInput("");
    setAwaitingInput(false);

    if (stage === "palate") {
      answersRef.current.palate = val;
      // Write and reflection fire concurrently — the reflection never gates
      // the write, and a slow/failed reflection can't delay it either.
      const writePromise = safeUpdate({ palate: val });
      const reflectionPromise = withTimeout(
        generateOnboardingReflection("palate", val).catch((err) => {
          console.error("Onboarding reflection failed:", err);
          return null;
        }),
        REFLECTION_TIMEOUT_MS
      );
      await sayReflection(reflectionPromise, nextFallbackAck());
      await writePromise;
      await sayAI("Who shapes how you cook? A chef, a cookbook, an account you save from, someone who taught you.");
      setStage("inspiration");
      setAwaitingInput(true);
      return;
    }

    if (stage === "inspiration") {
      answersRef.current.inspiration = val;
      const writePromise = safeUpdate({ inspiration: val });
      const reflectionPromise = withTimeout(
        generateOnboardingReflection("inspiration", val).catch((err) => {
          console.error("Onboarding reflection failed:", err);
          return null;
        }),
        REFLECTION_TIMEOUT_MS
      );
      await sayReflection(reflectionPromise, nextFallbackAck());
      await writePromise;
      await sayAI("Last thing, and this one I'll always respect. Any allergies I should know about? And then, separately, anything you'd just rather not see.");
      setStage("constraints");
      setAwaitingInput(true);
      return;
    }

    if (stage === "constraints") {
      // The parser and reflection both fire concurrently, but only the
      // parser is awaited before writing — the write needs to know whether a
      // composed, severity-labeled string is available. On timeout or
      // malformed output, parseComposedConstraints/rawParsed fall back to
      // the user's raw typed answer, which is always safe to store verbatim.
      const reflectionPromise = withTimeout(
        generateOnboardingReflection("constraints", val).catch((err) => {
          console.error("Onboarding reflection failed:", err);
          return null;
        }),
        REFLECTION_TIMEOUT_MS
      );
      const parsePromise = withTimeout(
        parseNoGosAnswer(val).catch((err) => {
          console.error("No-gos parsing failed:", err);
          return null;
        }),
        CONSTRAINTS_PARSE_TIMEOUT_MS
      );

      const rawParsed = await parsePromise;
      const composed = rawParsed ? parseComposedConstraints(rawParsed) : null;
      const constraintsToWrite = composed || val;
      const writePromise = safeUpdate({ constraints: constraintsToWrite });

      // Both the write and the reflection UI settle before the recap lines,
      // so the recap never talks past a still-in-flight write.
      await sayReflection(reflectionPromise, nextFallbackAck());
      await writePromise;

      // Single closing handoff line — no profile re-list, since the
      // per-answer reflections above already covered it. onNext() (which
      // drives the visual slide to the loading screen) fires only after this
      // line's own await resolves, i.e. only once it has fully revealed (or,
      // on a reveal error, snapped straight to full text — see revealMessage's
      // fail-soft showFull() path) — never mid-sentence. The profile-
      // readiness poll itself (waitForTasteProfile/HANDOFF_MAX_WAIT_MS) is
      // untouched: it still only starts once the Loader mounts, exactly as
      // before this line was added.
      await sayAI("Perfect — that's everything I need. Setting up your kitchen around this now.");
      setStage("done");
      onNext();
      return;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "48px 20px 12px", display: "flex", flexDirection: "column", gap: 20 }}>
        {messages.map((m) => (
          <ChatBubble key={m.id} role={m.role} text={m.text} />
        ))}
        {typing && <TypingBubble />}
      </div>
      <CookInputBar
        value={input}
        onChange={setInput}
        onSend={handleSend}
        placeholder="Type here..."
        disabled={!awaitingInput}
      />
    </div>
  );
}

function Loader({ onUpdate, onDone, profile }: { onUpdate: (updates: Partial<ProfileType>) => Promise<void>; onDone: () => void; profile: ProfileType | null }) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        await onUpdate({ onboarding_complete: true });
      } catch (err) {
        console.error("Onboarding completion write failed:", err);
      }

      if (!profile) {
        if (!cancelled) onDone();
        return;
      }

      // Fire-and-forget — generateTasteProfile writes taste_profile directly
      // via Supabase and is itself fail-quiet. We don't await it here; the
      // poll below is the actual readiness signal.
      generateTasteProfile(profile.id, {
        palate: profile.palate,
        inspiration: profile.inspiration,
        constraints: profile.constraints,
      }).catch((err) => {
        console.error("Taste profile generation failed:", err);
      });

      const tasteProfile = await waitForTasteProfile(profile.id, HANDOFF_MAX_WAIT_MS, TASTE_PROFILE_POLL_INTERVAL_MS);
      if (tasteProfile) {
        try {
          await onUpdate({ taste_profile: tasteProfile });
        } catch (err) {
          console.error("Taste profile state sync failed:", err);
        }
      }

      if (!cancelled) onDone();
    })();

    return () => {
      cancelled = true;
    };
    // Run-once handoff sequence — deliberately not re-keyed off profile/
    // onUpdate/onDone, which all change identity mid-sequence as writes land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center", gap: 28, padding: 32 }}>
      <style>{`@keyframes tipsyPulse {0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.08);opacity:1}}`}</style>
      <div style={{
        width: 96, height: 96, background: "rgba(35,60,0,0.1)", borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "tipsyPulse 2.4s ease-in-out infinite",
      }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#233C00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 13.5c-1.66 0-3-1.34-3-3 0-1.5 1.1-2.74 2.55-2.96A3.5 3.5 0 0 1 12 6a3.5 3.5 0 0 1 6.45 1.54A3 3 0 0 1 21 10.5c0 1.66-1.34 3-3 3" />
          <path d="M6 13.5h12V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5.5z" />
          <path d="M9 17h.01M12 17h.01M15 17h.01" />
        </svg>
      </div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(35,60,0,0.45)", letterSpacing: "0.06em", textAlign: "center" }}>
        Setting up your kitchen...
      </div>
    </div>
  );
}

export default function Onboarding({ onComplete, profile, onUpdate }: Props) {
  const [step, setStep] = useState(1);
  const [transition, setTransition] = useState<{ from: number; to: number } | null>(null);

  const next = () => {
    setStep((s) => {
      const to = s + 1;
      setTransition({ from: s, to });
      return to;
    });
  };

  const renderStep = (s: number) => {
    if (s === 1) return <OnboardingChat key="chat" profile={profile} onUpdate={onUpdate} onNext={next} />;
    return <Loader key="loader" onUpdate={onUpdate} onDone={onComplete} profile={profile} />;
  };

  const DURATION = 280;
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  const transKey = transition ? `${transition.from}->${transition.to}` : null;
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const phase: "start" | "end" = transKey && armedKey !== transKey ? "start" : "end";

  useEffect(() => {
    if (!transKey) return;
    if (armedKey === transKey) return;
    let r2 = 0;
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      r2 = requestAnimationFrame(() => { if (!cancelled) setArmedKey(transKey); });
    });
    return () => { cancelled = true; cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2); };
  }, [transKey, armedKey]);

  useEffect(() => {
    if (!transition) return;
    if (phase !== "end") return;
    const t = setTimeout(() => { setTransition(null); setArmedKey(null); }, DURATION + 20);
    return () => clearTimeout(t);
  }, [phase, transition]);

  const layerBase: CSSProperties = {
    position: "absolute", inset: 0, height: "100%",
    display: "flex", flexDirection: "column", background: "#FAF7F2",
    willChange: "transform",
  };

  if (!transition) {
    return <div style={{ ...layerBase, position: "relative" }}>{renderStep(step)}</div>;
  }

  const fromTransform = phase === "start" ? "translateX(0)" : "translateX(-25%)";
  const toTransform = phase === "start" ? "translateX(100%)" : "translateX(0)";
  const transitionStyle = phase === "start" ? "none" : `transform ${DURATION}ms ${EASE}`;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#FAF7F2" }}>
      <div style={{ ...layerBase, transform: fromTransform, transition: transitionStyle, zIndex: 1, pointerEvents: "none" }}>
        {renderStep(transition.from)}
      </div>
      <div style={{ ...layerBase, transform: toTransform, transition: transitionStyle, zIndex: 2, pointerEvents: "none" }}>
        {renderStep(transition.to)}
      </div>
    </div>
  );
}
