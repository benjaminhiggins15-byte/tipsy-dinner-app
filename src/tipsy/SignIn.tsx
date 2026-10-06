import { useState, useEffect, type CSSProperties } from "react";
import { supabase } from "../lib/supabase";
import fullLogo from "../Logos/Full_logo.png";
import GoogleButton from "./GoogleButton";
import VerifyCodeScreen from "./VerifyCodeScreen";

type Props = {
  onNavigateToSignUp: () => void;
  onSuccess: () => void;
  onPasswordRecoveryComplete: () => Promise<void>;
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

const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  fontFamily: "'Inter', sans-serif",
  fontSize: 12,
  fontWeight: 500,
  color: "#233C00",
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0,
};

const screenHeading: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 18,
  fontWeight: 600,
  color: "#233C00",
  textAlign: "center",
  marginBottom: 8,
};

const screenBody: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: "rgba(35,60,0,0.6)",
  textAlign: "center",
  lineHeight: 1.5,
  marginBottom: 32,
};

const errorText: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  color: "#c03000",
  textAlign: "center",
};

export default function SignIn({ onNavigateToSignUp, onSuccess, onPasswordRecoveryComplete }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<
    "form" | "verify" | "forgot-email" | "forgot-code" | "forgot-set-password"
  >("form");
  const [verifyEmail, setVerifyEmail] = useState("");

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState("");

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
        if (signInError.code === "email_not_confirmed") {
          // They signed up but never entered their code. Send a fresh one
          // and drop them straight into the same verify screen instead of
          // stranding them on a bare error message.
          supabase.auth.resend({ type: "signup", email }).catch(() => {});
          setVerifyEmail(email);
          setScreen("verify");
          setLoading(false);
          return;
        }
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

  const handleForgotPasswordTap = () => {
    setForgotEmail(email);
    setForgotError("");
    setNewPassword("");
    setConfirmNewPassword("");
    setSetPasswordError("");
    setScreen("forgot-email");
  };

  const handleSendResetCode = async () => {
    setForgotError("");

    if (!forgotEmail) {
      setForgotError("Enter your email");
      return;
    }

    setForgotLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail);

      // Anti-enumeration: always proceed to the code screen, with the exact
      // same message, whether or not this email has an account. Only a
      // rate-limit error is surfaced and blocks progression — it's symmetric
      // across real/fake emails, so it doesn't leak existence.
      if (
        resetError &&
        (resetError.code === "over_email_send_rate_limit" ||
          resetError.code === "over_request_rate_limit")
      ) {
        setForgotError("Too many attempts. Please wait a moment and try again.");
        setForgotLoading(false);
        return;
      }

      setForgotLoading(false);
      setScreen("forgot-code");
    } catch {
      setForgotLoading(false);
      setScreen("forgot-code");
    }
  };

  const handleSetNewPassword = async () => {
    setSetPasswordError("");

    if (!newPassword || !confirmNewPassword) {
      setSetPasswordError("Both fields are required");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setSetPasswordError("Passwords do not match");
      return;
    }

    setSetPasswordLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      if (updateError) {
        setSetPasswordError(updateError.message);
        setSetPasswordLoading(false);
        return;
      }

      setSetPasswordLoading(false);
      // Runs the recovery session through the same profile-init/routing
      // path a normal sign-in takes, then releases App's "auth" gate — see
      // handlePasswordRecoveryComplete in App.tsx for why this has to
      // happen before onSuccess (a no-op today) is called.
      await onPasswordRecoveryComplete();
      onSuccess();
    } catch {
      setSetPasswordError("An unexpected error occurred");
      setSetPasswordLoading(false);
    }
  };

  if (screen === "forgot-email") {
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
        <div style={{ textAlign: "center", marginBottom: 24, marginTop: 24 }}>
          <img
            src={fullLogo}
            alt="Tipsy Dinner"
            style={{ height: 120, display: "block", margin: "0 auto" }}
          />
        </div>

        <div style={screenHeading}>Reset your password</div>
        <div style={screenBody}>
          Enter your email and we'll send you a 6-digit code.
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={fieldLabel}>Email</div>
            <input
              style={fieldInput}
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />
          </div>

          {forgotError && <div style={errorText}>{forgotError}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <button
            type="button"
            style={linkBtn}
            onClick={() => {
              setScreen("form");
              setForgotError("");
            }}
          >
            Back to sign in
          </button>
        </div>

        <button
          style={{ ...btnStyle, opacity: forgotLoading ? 0.6 : 1 }}
          onClick={handleSendResetCode}
          disabled={forgotLoading}
        >
          {forgotLoading ? "Sending..." : "Send Code"}
        </button>
      </div>
    );
  }

  if (screen === "forgot-code") {
    return (
      <VerifyCodeScreen
        email={forgotEmail}
        type="recovery"
        onVerified={() => setScreen("forgot-set-password")}
        onUseDifferentEmail={() => {
          setScreen("forgot-email");
          setForgotError("");
        }}
        onBackToSignIn={() => {
          setScreen("form");
          setForgotError("");
        }}
      />
    );
  }

  if (screen === "forgot-set-password") {
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
        <div style={{ textAlign: "center", marginBottom: 24, marginTop: 24 }}>
          <img
            src={fullLogo}
            alt="Tipsy Dinner"
            style={{ height: 120, display: "block", margin: "0 auto" }}
          />
        </div>

        <div style={screenHeading}>Set a new password</div>
        <div style={screenBody}>Choose a new password for your account.</div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={fieldLabel}>New Password</div>
            <input
              style={fieldInput}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <div style={fieldLabel}>Confirm New Password</div>
            <input
              style={fieldInput}
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
            />
          </div>

          {setPasswordError && <div style={errorText}>{setPasswordError}</div>}
        </div>

        <button
          style={{ ...btnStyle, opacity: setPasswordLoading ? 0.6 : 1 }}
          onClick={handleSetNewPassword}
          disabled={setPasswordLoading}
        >
          {setPasswordLoading ? "Saving..." : "Save Password"}
        </button>
      </div>
    );
  }

  if (screen === "verify") {
    return (
      <VerifyCodeScreen
        email={verifyEmail}
        onVerified={onSuccess}
        onUseDifferentEmail={() => {
          setScreen("form");
          setError("");
        }}
      />
    );
  }

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

        <div style={{ textAlign: "right", marginTop: -8 }}>
          <button type="button" style={linkBtn} onClick={handleForgotPasswordTap}>
            Forgot password?
          </button>
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
