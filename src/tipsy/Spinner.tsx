import type { CSSProperties } from "react";

const spinKeyframes = `
@keyframes tipsySpinnerRotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
`;

export default function Spinner() {
  const containerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "center",
    width: "100%",
  };

  const spinnerStyle: CSSProperties = {
    width: 32,
    height: 32,
    border: "3px solid transparent",
    borderTop: "3px solid #233C00",
    borderRadius: "50%",
    animation: "tipsySpinnerRotate 0.8s linear infinite",
  };

  return (
    <>
      <style>{spinKeyframes}</style>
      <div style={containerStyle}>
        <div style={spinnerStyle} />
      </div>
    </>
  );
}
