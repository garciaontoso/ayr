import { useState, useEffect } from 'react';

export default function Toast({ message, type = "info", duration = 3000, onClose }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(onClose, 300); }, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  const colors = {
    success: { bg: "rgba(48,209,88,.12)", border: "rgba(48,209,88,.3)", text: "#30d158" },
    error: { bg: "rgba(255,69,58,.12)", border: "rgba(255,69,58,.3)", text: "#ff453a" },
    info: { bg: "rgba(100,210,255,.12)", border: "rgba(100,210,255,.3)", text: "#64d2ff" },
    warning: { bg: "rgba(255,214,10,.12)", border: "rgba(255,214,10,.3)", text: "#ffd60a" },
  };
  const c = colors[type] || colors.info;

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      padding: "10px 18px", borderRadius: 10,
      background: c.bg, border: `1px solid ${c.border}`,
      color: c.text, fontSize: 12, fontFamily: "var(--fm)", fontWeight: 600,
      backdropFilter: "blur(12px)",
      opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(10px)",
      transition: "all .3s ease",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {message}
      <button onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
        style={{ background: "none", border: "none", color: c.text, cursor: "pointer", fontSize: 14, opacity: .6 }}>×</button>
    </div>
  );
}
