import { useState, useEffect, type CSSProperties } from "react";
import { supabase } from "../lib/supabase";
import fullLogo from "../Logos/Full_logo.png";

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
  fontSize: 14,
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

      <div style={{ textAlign: "center", marginBottom: 32, marginTop: 24 }}>
        <img
          src={fullLogo}
          alt="Tipsy Dinner"
          style={{ height: 120, display: "block", margin: "0 auto" }}
        />
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

        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12,
            fontWeight: 400,
            color: "rgba(35,60,0,0.35)",
            textAlign: "center",
            marginTop: 12,
          }}
        >
          or sign in with
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={handleGoogleSignIn}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        </div>
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
