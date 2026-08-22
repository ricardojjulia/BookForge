"use client";

import { useState } from "react";

const LENSES = [
  { name: "Structure", score: 78, note: "Act II sags between ch. 11–14. Two scenes carry no turn." },
  { name: "Prose", score: 91, note: "Voice is consistent. Trim 6% adverbs in dialogue tags." },
  { name: "Continuity", score: 64, note: "Mara's scar changes sides in ch. 3 and ch. 19." },
  { name: "Market fit", score: 83, note: "Reads upmarket thriller. Comp titles align at 95k words." },
];

export function CriticLensDemo() {
  const [lens, setLens] = useState(0);
  const active = LENSES[lens];

  return (
    <div style={{ display: "grid", gridTemplateColumns: ".9fr 1.1fr", gap: 56, alignItems: "center" }} className="bf-critic-grid">
      <div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, letterSpacing: ".18em", textTransform: "uppercase", color: "#F0C46A" }}>
          BookForge Critic
        </div>
        <h2
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: 44,
            lineHeight: 1.04,
            letterSpacing: "-.03em",
            margin: "14px 0 18px",
          }}
        >
          The notes your beta readers were too polite to give.
        </h2>
        <p style={{ margin: "0 0 26px", fontSize: 17, lineHeight: 1.65, color: "rgba(242,244,249,.68)" }}>
          Pick a lens. The Critic reads every scene in context and tells you exactly where the book loses a
          reader — with chapter numbers, not vibes.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {LENSES.map((l, i) => (
            <button
              key={l.name}
              onClick={() => setLens(i)}
              className="bf-lens-btn"
              style={{
                cursor: "pointer",
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: 14.5,
                fontWeight: 500,
                padding: "10px 18px",
                borderRadius: 999,
                border: `1px solid ${i === lens ? "#F0C46A" : "rgba(255,255,255,.16)"}`,
                background: "rgba(255,255,255,.04)",
                color: i === lens ? "#F0C46A" : "#F2F4F9",
              }}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>
      <div
        style={{
          background: "rgba(9,13,24,.85)",
          border: "1px solid rgba(255,255,255,.10)",
          borderRadius: 20,
          padding: "30px 32px",
          boxShadow: "0 40px 90px rgba(0,0,0,.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 600 }}>{active.name}</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 46, fontWeight: 700, color: "#F0C46A", letterSpacing: "-.03em" }}>
            {active.score}
          </div>
        </div>
        <p style={{ margin: "16px 0 0", fontSize: 17, lineHeight: 1.6, color: "rgba(242,244,249,.78)" }}>{active.note}</p>
        <div style={{ marginTop: 26, display: "grid", gap: 12, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: "rgba(242,244,249,.5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 12 }}>
            <span>scenes flagged</span>
            <span style={{ color: "#F2F4F9" }}>7 of 62</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 12 }}>
            <span>suggested passes</span>
            <span style={{ color: "#F2F4F9" }}>pacing → tension</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 12 }}>
            <span>est. revision time</span>
            <span style={{ color: "#F2F4F9" }}>2.5 hrs</span>
          </div>
        </div>
      </div>
    </div>
  );
}
