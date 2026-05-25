import { useState, useEffect, type CSSProperties } from "react";
import SignUp from "./SignUp";
import SignIn from "./SignIn";

type AuthScreen = "signup" | "signin";

type Props = {
  initialScreen?: AuthScreen;
  onSuccess: () => void;
};

const DURATION = 300;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

export default function AuthFlow({ initialScreen = "signup", onSuccess }: Props) {
  const [current, setCurrent] = useState<AuthScreen>(initialScreen);
  const [transition, setTransition] = useState<{
    from: AuthScreen;
    to: AuthScreen;
    direction: "forward" | "backward";
  } | null>(null);

  const transKey = transition
    ? `${transition.from}->${transition.to}:${transition.direction}`
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

  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setTransition(null), DURATION + 20);
    return () => clearTimeout(t);
  }, [transition]);

  const navigateTo = (screen: AuthScreen) => {
    if (screen === current) return;
    // signup -> signin = forward (slide left)
    // signin -> signup = backward (slide right)
    const direction = screen === "signin" ? "forward" : "backward";
    setTransition({ from: current, to: screen, direction });
    setCurrent(screen);
  };

  const layerBase: CSSProperties = {
    position: "absolute",
    inset: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#FAF7F2",
    willChange: "transform",
  };

  const renderAuthScreen = (screen: AuthScreen) => {
    if (screen === "signup") {
      return (
        <SignUp
          onNavigateToSignIn={() => navigateTo("signin")}
          onSuccess={onSuccess}
        />
      );
    }
    return (
      <SignIn
        onNavigateToSignUp={() => navigateTo("signup")}
        onSuccess={onSuccess}
      />
    );
  };

  if (!transition) {
    return (
      <div style={{ ...layerBase, position: "relative" }}>
        {renderAuthScreen(current)}
      </div>
    );
  }

  const { from, to, direction } = transition;

  let fromTransform = "translateX(0)";
  let toTransform = "translateX(0)";

  if (direction === "forward") {
    fromTransform = animPhase === "start" ? "translateX(0)" : "translateX(-25%)";
    toTransform = animPhase === "start" ? "translateX(100%)" : "translateX(0)";
  } else {
    fromTransform = animPhase === "start" ? "translateX(0)" : "translateX(100%)";
    toTransform = animPhase === "start" ? "translateX(-25%)" : "translateX(0)";
  }

  const transitionStyle =
    animPhase === "start" ? "none" : `transform ${DURATION}ms ${EASE}`;

  const fromZ = direction === "forward" ? 1 : 2;
  const toZ = direction === "forward" ? 2 : 1;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#FAF7F2" }}>
      <div
        style={{
          ...layerBase,
          transform: fromTransform,
          transition: transitionStyle,
          zIndex: fromZ,
          pointerEvents: "none",
        }}
      >
        {renderAuthScreen(from)}
      </div>
      <div
        style={{
          ...layerBase,
          transform: toTransform,
          transition: transitionStyle,
          zIndex: toZ,
          pointerEvents: "none",
        }}
      >
        {renderAuthScreen(to)}
      </div>
    </div>
  );
}
