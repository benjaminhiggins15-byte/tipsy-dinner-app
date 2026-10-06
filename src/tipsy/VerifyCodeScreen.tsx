import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "../lib/supabase";
import fullLogo from "../Logos/Full_logo.png";

type Props = {
  email: string;
  onVerified: () => void;
  onUseDifferentEmail: () => void;
  type?: "signup" | "recovery";
  onBackToSignIn?: () => void;
};

const RESEND_COOLDOWN_SECONDS = 30;

const heading: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 18,
  fontWeight: 600,
  color: "#233C00",
  textAlign: "center",
  marginBottom: 8,
};

const body: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 13,
  color: "rgba(35,60,0,0.6)",
  textAlign: "center",
  lineHeight: 1.5,
  marginBottom: 32,
};

const emailText: CSSProperties = {
  fontWeight: 600,
  color: "#233C00",
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

const codeInput: CSSProperties = {
  width: "100%",
  height: 48,
  background: "transparent",
  border: "none",
  borderBottom: "1px solid rgba(35,60,0,0.2)",
  borderRadius: 0,
  fontFamily: "'Inter', sans-serif",
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: "0.4em",
  color: "#233C00",
  outline: "none",
  padding: "0 2px",
  textAlign: "center",
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

function friendlyError(err: { code?: string; message: string }): string {
  switch (err.code) {
    case "otp_expired":
      // Supabase uses this same code for both a wrong code and an expired
      // one (it never distinguishes the two, to avoid leaking which).
      return "That code is incorrect or has expired. Request a new one below.";
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
      return "Too many attempts. Please wait a moment before trying again.";
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return err.message || "Something went wrong. Please try again.";
  }
}

export default function VerifyCodeScreen({ email, onVerified, onUseDifferentEmail, type = "signup", onBackToSignIn }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = async () => {
    setError("");

    if (code.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }

    setLoading(true);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type,
      });

      if (verifyError) {
        setError(friendlyError(verifyError));
        setLoading(false);
        return;
      }

      setLoading(false);
      onVerified();
    } catch {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;

    setError("");
    setResendStatus("");

    try {
      // resend() only supports type "signup"/"email_change" — recovery codes
      // are resent by calling resetPasswordForEmail() again.
      const { error: resendError } =
        type === "recovery"
          ? await supabase.auth.resetPasswordForEmail(email)
          : await supabase.auth.resend({ type: "signup", email });

      if (resendError) {
        setError(friendlyError(resendError));
        return;
      }

      setResendStatus("A new code is on its way.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError("Couldn't resend the code. Please try again in a moment.");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#FAF7F2",
        padding: "32px 28px 28px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 24, marginTop: 8 }}>
        <img
          src={fullLogo}
          alt="Tipsy Dinner"
          style={{ height: 120, display: "block", margin: "0 auto" }}
        />
      </div>

      <div style={heading}>Check your email</div>
      <div style={body}>
        We sent a 6-digit code to <span style={emailText}>{email}</span>.
        {type === "recovery"
          ? " Enter it below to reset your password."
          : " Enter it below to finish setting up your account."}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={fieldLabel}>Verification Code</div>
          <input
            style={codeInput}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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

        {!error && resendStatus && (
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              color: "rgba(35,60,0,0.5)",
              textAlign: "center",
            }}
          >
            {resendStatus}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 4 }}>
          <button type="button" style={linkBtn} onClick={handleResend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
          </button>
          <button type="button" style={linkBtn} onClick={onUseDifferentEmail}>
            Use a different email
          </button>
          {onBackToSignIn && (
            <button type="button" style={linkBtn} onClick={onBackToSignIn}>
              Back to sign in
            </button>
          )}
        </div>
      </div>

      <button
        style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }}
        onClick={handleVerify}
        disabled={loading}
      >
        {loading ? "Verifying..." : "Verify"}
      </button>
    </div>
  );
}
