import { useRef, useEffect } from "react";
import { IconPhoto, IconX } from "@tabler/icons-react";

// Presentational chat shell shared by Build's live AI conversation (Cook, in
// App.tsx) and the scripted conversational onboarding flow (Onboarding.tsx).
// These components only ever see a plain {role, text} shape or primitive
// props — they have no knowledge of how a message array is populated, so a
// hard-wired script and a live AI engine can both render through them
// unchanged.

export function ChatBubble({ role, text }: { role: "user" | "ai"; text: string }) {
  const isUser = role === "user";

  // Simple markdown renderer for AI messages
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let key = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if it's a numbered list item (e.g., "1. ", "2. ", etc.)
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        const num = numberedMatch[1];
        const content = numberedMatch[2];
        elements.push(
          <div key={key++} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span style={{ fontWeight: 500, flexShrink: 0 }}>{num}.</span>
            <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.+?)\*\*/g, '<span style="font-weight: 700; font-family: Inter, sans-serif; color: #233C00">$1</span>') }} />
          </div>
        );
        continue;
      }

      // Regular line with potential bold formatting
      if (line.trim()) {
        const html = line.replace(/\*\*(.+?)\*\*/g, '<span style="font-weight: 700; font-family: Inter, sans-serif; color: #233C00">$1</span>');
        elements.push(
          <div key={key++} style={{ marginBottom: i < lines.length - 1 ? 8 : 0 }}>
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        );
      } else if (i < lines.length - 1) {
        // Empty line - add spacing
        elements.push(<div key={key++} style={{ height: 8 }} />);
      }
    }

    return <>{elements}</>;
  };

  if (isUser) {
    // User messages - green bubble with cream text
    return (
      <div
        style={{
          alignSelf: "flex-end",
          background: "#233C00",
          color: "#FEE7C0",
          fontFamily: "Inter, sans-serif",
          fontSize: 15,
          padding: "11px 16px",
          borderRadius: "18px 18px 4px 18px",
          maxWidth: "72%",
          lineHeight: 1.4,
          animation: "tipsyChatIn 300ms ease",
        }}
      >
        {text}
        <style>{`@keyframes tipsyChatIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }`}</style>
      </div>
    );
  }

  // AI messages - no bubble, Inter text on cream
  return (
    <div
      style={{
        alignSelf: "flex-start",
        color: "#233C00",
        fontFamily: "Inter, sans-serif",
        fontWeight: 400,
        fontSize: 15,
        maxWidth: "88%",
        lineHeight: 1.55,
        padding: "4px 0",
        animation: "tipsyChatIn 300ms ease",
      }}
    >
      {renderMarkdown(text)}
      <style>{`@keyframes tipsyChatIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }`}</style>
    </div>
  );
}

export function TypingBubble() {
  return (
    <div style={{
      alignSelf: "flex-start",
      display: "flex",
      gap: 4,
      alignItems: "center",
      padding: "4px 0",
    }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "rgba(35,60,0,0.5)",
            display: "inline-block",
            animation: `tipsyDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes tipsyDot { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }`}</style>
    </div>
  );
}

export function CookInputBar({ value, onChange, onSend, placeholder, disabled, attachedImagePreviewUrl, onAttachClick, onRemoveAttachedImage }: {
  value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; disabled?: boolean;
  attachedImagePreviewUrl?: string | null; onAttachClick?: () => void; onRemoveAttachedImage?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasContent = !!value.trim() || !!attachedImagePreviewUrl;

  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = "auto";
      // Set height based on scrollHeight, capped at 8 lines (168px)
      const newHeight = Math.min(textareaRef.current.scrollHeight, 168);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [value]);

  return (
    <div style={{ padding: "8px 16px 12px", flexShrink: 0, background: "#FAF7F2", borderTop: "1px solid rgba(35,60,0,0.08)", position: "relative", zIndex: 1, margin: 0, boxShadow: "none" }}>
      {attachedImagePreviewUrl && (
        <div style={{ display: "flex", marginBottom: 8 }}>
          <div style={{ position: "relative", width: 48, height: 48, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(35,60,0,0.15)", flexShrink: 0 }}>
            <img src={attachedImagePreviewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <button
              onClick={onRemoveAttachedImage}
              aria-label="Remove attached photo"
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#233C00",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconX size={12} stroke={2.5} color="#FEE7C0" />
            </button>
          </div>
        </div>
      )}
      <div style={{
        display: "flex",
        alignItems: "center",
        background: "rgba(35,60,0,0.05)",
        border: "1px solid rgba(35,60,0,0.1)",
        borderRadius: 26,
        padding: "10px 16px",
        gap: 10,
      }}>
        {onAttachClick && (
          <button
            onClick={onAttachClick}
            aria-label="Attach a photo"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            <IconPhoto size={20} stroke={1.5} color="rgba(35,60,0,0.5)" />
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          rows={1}
          className="tipsy-input"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: "Inter, sans-serif",
            fontSize: 16,
            color: "#233C00",
            resize: "none",
            overflowY: "auto",
            maxHeight: 168,
            lineHeight: 1.4,
            padding: 0,
          }}
        />
        <style>{`
          .tipsy-input::placeholder {
            color: rgba(35,60,0,0.3);
          }
        `}</style>
        <button
          onClick={onSend}
          disabled={disabled}
          aria-label="Send"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: hasContent ? "#1E3A42" : "rgba(35,60,0,0.08)",
            border: "none",
            cursor: disabled ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={hasContent ? "#FEE7C0" : "rgba(35,60,0,0.3)"} stroke="none">
            <path d="M2 12L22 2L15 22L11 13L2 12Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
