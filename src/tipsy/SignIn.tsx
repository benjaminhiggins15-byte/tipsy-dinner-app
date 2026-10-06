import { useState, useEffect, type CSSProperties } from "react";
import { supabase } from "../lib/supabase";
import fullLogo from "../Logos/Full_logo.png";
import GoogleButton from "./GoogleButton";

type Props = {
  onNavigateToSignUp: () => void;
  onSuccess: () => void;
};

const fieldLabel: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(35,60,0,0.35)",
  marginBottom: 6,
};

const fieldInput: CSSProperties = {
  width: "100%",
  height: 32,
  background: "transparent",
  border: "none",
  borderBottom: "1px solid rgba(35,60,0,0.2)",
  borderRadius: 0,
  fontFamily: "'Inter', sans-serif",
  fontSize: 16,
  color: "#233C00",
  outline: "none",
  padding: "0 2px",
};

const btnStyle: CSSProperties = {
  background: "#233C00",
  color: "#FAF7F2",
  border: "none",
  borderRadius: 14,
  padding: "14px 0",
  fontFamily: "'Inter', sans-serif",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  width: "100%",
  cursor: "pointer",
  flexShrink: 0,
};

const pillBtn: CSSProperties = {
  background: "#233C00",
  color: "#FAF7F2",
  border: "none",
  borderRadius: 20,
  padding: "8px 16px",
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};

const dividerRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  margin: "20px 0",
};

const dividerLine: CSSProperties = {
  flex: 1,
  height: 1,
  background: "rgba(35,60,0,0.15)",
};

const dividerText: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(35,60,0,0.35)",
};

export default function SignIn({ onNavigateToSignUp, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      input::placeholder {
        color: rgba(35,60,0,0.3);
        opacity: 1;
      }
      input:focus {
        border-bottom-color: #233C00 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const handleSignIn = async () => {
    setError("");

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        onSuccess();
      }
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
      });

      if (oauthError) {
        setError(oauthError.message);
      }
    } catch {
      setError("Failed to sign in with Google");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#FAF7F2",
        padding: "56px 28px 28px",
      }}
    >
      <div style={{ position: "absolute", top: 28, right: 28 }}>
        <button style={pillBtn} onClick={onNavigateToSignUp}>
          Sign Up
        </button>
      </div>

      <div style={{ textAlign: "center", marginBottom: 24, marginTop: 24 }}>
        <img
          src={fullLogo}
          alt="Tipsy Dinner"
          style={{ height: 120, display: "block", margin: "0 auto" }}
        />
      </div>

      <GoogleButton onClick={handleGoogleSignIn} />

      <div style={dividerRow}>
        <div style={dividerLine} />
        <span style={dividerText}>or</span>
        <div style={dividerLine} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={fieldLabel}>Email</div>
          <input
            style={fieldInput}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <div style={fieldLabel}>Password</div>
          <input
            style={fieldInput}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              color: "#c03000",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}
      </div>

      <button
        style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }}
        onClick={handleSignIn}
        disabled={loading}
      >
        {loading ? "Signing In..." : "Sign In"}
      </button>
    </div>
  );
}
