import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { CriticLensDemo } from "@/components/landing/critic-lens-demo";

export const dynamic = "force-dynamic";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-space-grotesk" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--font-plex-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

const STEPS = [
  { n: "01", title: "Import", text: "Drop a DOCX. It lands as chapters, scenes and paragraphs — structure intact, nothing flattened.", tint: false },
  { n: "02", title: "Critique", text: "Four evaluator lenses read the whole book and rank what to fix first.", tint: false },
  { n: "03", title: "Revise", text: "Run humanize, dialogue polish, pacing or ending passes — scene by scene, side by side.", tint: false },
  { n: "04", title: "Ship", text: "Export clean, with a full revision history you can hand to an agent or editor.", tint: true },
];

const MARQUEE_ITEMS = [
  "Structured manuscript import",
  "8 Critic evaluator lenses",
  "Local AI via LM Studio",
  "Full revision history",
  "Self-hosted or managed",
  "AGPL-3.0 open source",
];

export default async function Home() {
  let loggedIn = false;
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    loggedIn = Boolean(user);
  }
  const importHref = loggedIn ? "/books/new" : "/auth";
  const ctaLabel = loggedIn ? "Import Manuscript" : "Start forging free";

  return (
    <div className={`${spaceGrotesk.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <style>{`
        #bf-landing { background: #070A13; color: #F2F4F9; font-family: var(--font-plex-sans), system-ui, sans-serif; overflow: hidden; position: relative; }
        #bf-landing a { color: #7FC0FF; text-decoration: none; }
        #bf-landing a:hover { color: #F0C46A; }
        #bf-landing ::selection { background: #F0C46A; color: #070A13; }
        @keyframes bfPulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        @keyframes bfMarquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .bf-outline-btn { transition: border-color 150ms ease, color 150ms ease; }
        .bf-outline-btn:hover { border-color: rgba(255,255,255,.45) !important; color: #F0C46A !important; }
        .bf-lens-btn { transition: border-color 150ms ease, color 150ms ease; }
        .bf-lens-btn:hover { border-color: #F0C46A !important; color: #F0C46A !important; }
        .bf-nav-link:hover { color: #F0C46A !important; }
        @media (max-width: 900px) {
          .bf-hero-grid { grid-template-columns: 1fr !important; }
          .bf-critic-grid { grid-template-columns: 1fr !important; }
          .bf-steps-grid { grid-template-columns: 1fr 1fr !important; }
          .bf-trust-grid { grid-template-columns: 1fr !important; }
          .bf-trust-grid > div:first-child { grid-column: span 1 !important; }
          h1 { font-size: 44px !important; }
        }
      `}</style>

      <div id="bf-landing">
        <div
          style={{
            position: "absolute",
            top: -280,
            left: "50%",
            transform: "translateX(-50%)",
            width: 1400,
            height: 900,
            background: "radial-gradient(closest-side, rgba(77,141,255,.22), rgba(7,10,19,0))",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 120,
            left: "8%",
            width: 700,
            height: 700,
            background: "radial-gradient(closest-side, rgba(240,196,106,.10), rgba(7,10,19,0))",
            pointerEvents: "none",
          }}
        />

        <header
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            maxWidth: 1200,
            margin: "0 auto",
            padding: "26px 40px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 11,
                backgroundImage: "url('/bookforge-icon.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
                boxShadow: "0 0 0 1px rgba(255,255,255,.12), 0 8px 30px rgba(77,141,255,.35)",
              }}
            />
            <span style={{ fontFamily: "var(--font-space-grotesk)", fontWeight: 700, fontSize: 19, letterSpacing: "-.01em" }}>
              BookForge <span style={{ color: "#7FC0FF" }}>AI</span>
            </span>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 32, fontSize: 15, color: "rgba(242,244,249,.72)", flexWrap: "wrap" }}>
            <a href="#how" className="bf-nav-link" style={{ color: "inherit" }}>How it works</a>
            <a href="#critic" className="bf-nav-link" style={{ color: "inherit" }}>The Critic</a>
            <a href="#trust" className="bf-nav-link" style={{ color: "inherit" }}>Your data</a>
            <a href="/auth" className="bf-nav-link" style={{ color: "inherit" }}>Login</a>
            <a
              href={loggedIn ? importHref : "#start"}
              style={{
                color: "#070A13",
                background: "linear-gradient(180deg, #FFD888, #E7A93F)",
                padding: "11px 20px",
                borderRadius: 999,
                fontWeight: 600,
                boxShadow: "0 10px 30px rgba(231,169,63,.28)",
              }}
            >
              Get started
            </a>
          </nav>
        </header>

        <section
          className="bf-hero-grid"
          style={{
            position: "relative",
            maxWidth: 1200,
            margin: "0 auto",
            padding: "48px 40px 96px",
            display: "grid",
            gridTemplateColumns: "1.05fr .95fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 14px 7px 10px",
                borderRadius: 999,
                border: "1px solid rgba(240,196,106,.28)",
                background: "rgba(240,196,106,.07)",
                fontFamily: "var(--font-plex-mono)",
                fontSize: 11.5,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                color: "#F0C46A",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#F0C46A",
                  boxShadow: "0 0 12px #F0C46A",
                  animation: "bfPulse 2.4s ease-in-out infinite",
                  display: "inline-block",
                }}
              />
              Your manuscript, your way, powered by AI
            </div>
            <h1
              style={{
                fontFamily: "var(--font-space-grotesk)",
                fontWeight: 700,
                fontSize: 74,
                lineHeight: .96,
                letterSpacing: "-.035em",
                margin: "26px 0 0",
              }}
            >
              Forge the book you meant to write.
            </h1>
            <p style={{ fontSize: 19.5, lineHeight: 1.6, color: "rgba(242,244,249,.7)", margin: "24px 0 0", maxWidth: "30em" }}>
              Drop in a 120,000-word draft and get a chapter-by-chapter revision plan, honest critique, and line
              edits that still sound like <em style={{ color: "#F2F4F9", fontStyle: "italic" }}>you</em>. Nothing
              is overwritten until you say so.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 36, flexWrap: "wrap" }}>
              <a
                href={loggedIn ? importHref : "#start"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "17px 30px",
                  borderRadius: 999,
                  background: "linear-gradient(180deg, #FFD888, #E7A93F)",
                  color: "#070A13",
                  fontWeight: 600,
                  fontSize: 17,
                  boxShadow: "0 16px 44px rgba(231,169,63,.32)",
                }}
              >
                {ctaLabel} <span style={{ fontSize: 19 }}>→</span>
              </a>
              <a
                href="#demo"
                className="bf-outline-btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "17px 26px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,.16)",
                  color: "#F2F4F9",
                  fontWeight: 500,
                  fontSize: 17,
                }}
              >
                Watch a 2-min forge
              </a>
            </div>
            <div style={{ display: "flex", gap: 34, marginTop: 42, flexWrap: "wrap", fontSize: 14, color: "rgba(242,244,249,.55)" }}>
              <div>
                <strong style={{ display: "block", fontFamily: "var(--font-space-grotesk)", fontSize: 23, color: "#F2F4F9", fontWeight: 600 }}>
                  4,100+
                </strong>
                manuscripts forged
              </div>
              <div>
                <strong style={{ display: "block", fontFamily: "var(--font-space-grotesk)", fontSize: 23, color: "#F2F4F9", fontWeight: 600 }}>
                  Powered by AI
                </strong>
                bring your own key
              </div>
              <div>
                <strong style={{ display: "block", fontFamily: "var(--font-space-grotesk)", fontSize: 23, color: "#F2F4F9", fontWeight: 600 }}>
                  0 words
                </strong>
                lost to an AI rewrite
              </div>
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                inset: "-12% -6%",
                background: "radial-gradient(closest-side, rgba(77,141,255,.30), rgba(7,10,19,0))",
                filter: "blur(6px)",
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative hero mark, not worth next/image's overhead */}
            <img
              src="/bookforge-icon.png"
              alt="BookForge AI"
              style={{
                position: "relative",
                width: "100%",
                borderRadius: 26,
                display: "block",
                boxShadow: "0 40px 120px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.07)",
              }}
            />
            <div
              style={{
                position: "relative",
                margin: "-56px 0 0 -34px",
                width: "calc(100% + 34px)",
                background: "rgba(15,20,34,.92)",
                backdropFilter: "blur(14px)",
                border: "1px solid rgba(255,255,255,.10)",
                borderRadius: 18,
                padding: "20px 22px",
                boxShadow: "0 30px 70px rgba(0,0,0,.6)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontFamily: "var(--font-plex-mono)",
                  fontSize: 11,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: "rgba(242,244,249,.45)",
                }}
              >
                <span>ch. 14 · scene 3 · humanize pass</span>
                <span style={{ color: "#F0C46A" }}>awaiting you</span>
              </div>
              <div style={{ fontFamily: "var(--font-plex-mono)", fontSize: 13.5, lineHeight: 1.75, marginTop: 14, display: "grid", gap: 4 }}>
                <div style={{ color: "rgba(255,145,145,.75)", textDecoration: "line-through" }}>
                  − She was very afraid of what was coming next.
                </div>
                <div style={{ color: "#A8E6BD" }}>+ She counted the stairs on the way down, twice.</div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <span style={{ padding: "8px 16px", borderRadius: 8, background: "#E7F3EA", color: "#0B2415", fontSize: 13.5, fontWeight: 600 }}>
                  Accept
                </span>
                <span style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,.16)", fontSize: 13.5, color: "rgba(242,244,249,.8)" }}>
                  Rework
                </span>
                <span style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,.16)", fontSize: 13.5, color: "rgba(242,244,249,.8)" }}>
                  Keep mine
                </span>
              </div>
            </div>
          </div>
        </section>

        <div
          style={{
            position: "relative",
            borderTop: "1px solid rgba(255,255,255,.07)",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            background: "rgba(255,255,255,.015)",
            overflow: "hidden",
            padding: "18px 0",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 56,
              width: "max-content",
              animation: "bfMarquee 34s linear infinite",
              fontFamily: "var(--font-plex-mono)",
              fontSize: 12.5,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "rgba(242,244,249,.38)",
            }}
          >
            {[0, 1].map((rep) => (
              <div key={rep} style={{ display: "flex", gap: 56 }}>
                {MARQUEE_ITEMS.map((item) => (
                  <span key={item} style={{ display: "flex", gap: 56 }}>
                    <span>{item}</span>
                    <span style={{ color: "#F0C46A" }}>◆</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section id="how" style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "110px 40px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: "var(--font-plex-mono)", fontSize: 11.5, letterSpacing: ".18em", textTransform: "uppercase", color: "#7FC0FF" }}>
                The forge, in four heats
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-space-grotesk)",
                  fontWeight: 700,
                  fontSize: 46,
                  lineHeight: 1.05,
                  letterSpacing: "-.03em",
                  margin: "14px 0 0",
                  maxWidth: "20em",
                }}
              >
                From messy draft to submission-ready in one pass.
              </h2>
            </div>
            <p style={{ fontSize: 16.5, lineHeight: 1.65, color: "rgba(242,244,249,.6)", maxWidth: "26em", margin: 0 }}>
              No prompt engineering. No copy-pasting chapters into a chat window and losing the thread by page 40.
            </p>
          </div>
          <div className="bf-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginTop: 46 }}>
            {STEPS.map((step) => (
              <div
                key={step.n}
                style={{
                  border: "1px solid rgba(255,255,255,.09)",
                  borderRadius: 18,
                  padding: "26px 24px 30px",
                  background: step.tint
                    ? "linear-gradient(180deg, rgba(240,196,106,.12), rgba(255,255,255,.015))"
                    : "linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015))",
                }}
              >
                <div style={{ fontFamily: "var(--font-space-grotesk)", fontSize: 13, color: "#F0C46A", letterSpacing: ".1em" }}>{step.n}</div>
                <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: 20, fontWeight: 600, margin: "14px 0 8px", letterSpacing: "-.01em" }}>
                  {step.title}
                </h3>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "rgba(242,244,249,.62)" }}>{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="critic" style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "110px 40px 0" }}>
          <div
            style={{
              border: "1px solid rgba(255,255,255,.10)",
              borderRadius: 26,
              background: "linear-gradient(150deg, rgba(77,141,255,.14), rgba(255,255,255,.02) 45%)",
              padding: 54,
            }}
          >
            <CriticLensDemo />
          </div>
        </section>

        <section
          id="trust"
          className="bf-trust-grid"
          style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "110px 40px 0", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}
        >
          <div style={{ gridColumn: "span 2", border: "1px solid rgba(255,255,255,.09)", borderRadius: 22, padding: "38px 40px", background: "rgba(255,255,255,.03)" }}>
            <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: 30, fontWeight: 600, letterSpacing: "-.02em", margin: "0 0 12px" }}>
              Your book never leaves your control.
            </h3>
            <p style={{ margin: 0, fontSize: 16.5, lineHeight: 1.65, color: "rgba(242,244,249,.65)", maxWidth: "46em" }}>
              AI runs locally through LM Studio by default — your manuscript stays on your machine. Need cloud
              speed for a full-book pass? Connect OpenAI, Anthropic or Google from Settings, per project, and
              switch back whenever you like. Your text lives in your own Supabase project, not our warehouse.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap", fontFamily: "var(--font-plex-mono)", fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }}>
              <span style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(127,192,255,.3)", color: "#7FC0FF" }}>Local by default</span>
              <span style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(127,192,255,.3)", color: "#7FC0FF" }}>No training on your work</span>
              <span style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(127,192,255,.3)", color: "#7FC0FF" }}>Auditable history</span>
            </div>
          </div>
          <div style={{ border: "1px solid rgba(240,196,106,.25)", borderRadius: 22, padding: "38px 34px", background: "linear-gradient(180deg, rgba(240,196,106,.12), rgba(255,255,255,.02))" }}>
            <h3 style={{ fontFamily: "var(--font-space-grotesk)", fontSize: 26, fontWeight: 600, letterSpacing: "-.02em", margin: "0 0 12px" }}>
              Author has the last word.
            </h3>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: "rgba(242,244,249,.7)" }}>
              Every suggestion is accepted, rejected or reworked by you. Original text is never overwritten — the
              draft you wrote is always one click away.
            </p>
          </div>
        </section>

        <section style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "96px 40px 0" }}>
          <blockquote
            style={{
              margin: 0,
              maxWidth: "26em",
              fontFamily: "var(--font-space-grotesk)",
              fontSize: 34,
              lineHeight: 1.28,
              fontWeight: 500,
              letterSpacing: "-.02em",
            }}
          >
            &ldquo;I&apos;d rewritten chapter one eleven times. BookForge told me the problem was chapter{" "}
            <span style={{ color: "#F0C46A" }}>four</span>. It was right.&rdquo;
          </blockquote>
          <div style={{ marginTop: 22, fontSize: 15, color: "rgba(242,244,249,.55)" }}>
            Rae Wilkinson — author of <em>The Quiet Grid</em>, 3-book series
          </div>
        </section>

        <section id="start" style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "120px 40px 130px", textAlign: "center" }}>
          <div
            style={{
              position: "absolute",
              inset: "60px 20% auto",
              height: 320,
              background: "radial-gradient(closest-side, rgba(240,196,106,.18), rgba(7,10,19,0))",
              pointerEvents: "none",
            }}
          />
          <h2
            style={{
              position: "relative",
              fontFamily: "var(--font-space-grotesk)",
              fontWeight: 700,
              fontSize: 60,
              lineHeight: 1.02,
              letterSpacing: "-.035em",
              margin: "0 auto",
              maxWidth: "18em",
            }}
          >
            Your draft is already good.
            <br />
            Let&apos;s make it undeniable.
          </h2>
          <p style={{ position: "relative", margin: "22px auto 0", maxWidth: "34em", fontSize: 18.5, lineHeight: 1.6, color: "rgba(242,244,249,.66)" }}>
            Free on your first manuscript. No card, no word-count trap, no rights grab.
          </p>
          <div style={{ position: "relative", display: "flex", justifyContent: "center", gap: 14, marginTop: 36, flexWrap: "wrap" }}>
            <a
              href={importHref}
              style={{
                padding: "18px 34px",
                borderRadius: 999,
                background: "linear-gradient(180deg, #FFD888, #E7A93F)",
                color: "#070A13",
                fontWeight: 600,
                fontSize: 17.5,
                boxShadow: "0 16px 48px rgba(231,169,63,.34)",
              }}
            >
              {ctaLabel}
            </a>
            <a
              href="/auth"
              style={{ padding: "18px 30px", borderRadius: 999, border: "1px solid rgba(255,255,255,.18)", color: "#F2F4F9", fontWeight: 500, fontSize: 17.5 }}
            >
              I have an account
            </a>
          </div>
        </section>

        <footer
          style={{
            position: "relative",
            borderTop: "1px solid rgba(255,255,255,.08)",
            padding: "34px 40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            maxWidth: 1200,
            margin: "0 auto",
            fontSize: 14,
            color: "rgba(242,244,249,.42)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontFamily: "var(--font-space-grotesk)", fontWeight: 600, color: "rgba(242,244,249,.75)" }}>BookForge AI</span>
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
            <a href="#privacy" className="bf-nav-link" style={{ color: "inherit" }}>Privacy</a>
            <a href="#terms" className="bf-nav-link" style={{ color: "inherit" }}>Terms</a>
            <a href="https://github.com/ricardojjulia/BookForge/blob/main/docs/HOWTO.md" target="_blank" rel="noopener noreferrer" className="bf-nav-link" style={{ color: "inherit" }}>
              Docs
            </a>
            <a href="#contact" className="bf-nav-link" style={{ color: "inherit" }}>Contact</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
