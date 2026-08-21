import { criticLenses } from "@/lib/critic/prompts";
import { isCriticReportType } from "@/lib/critic/progress";
import { extractCriticScore } from "@/lib/critic/score";
import type { CriticLens } from "@/lib/types";

type CriticReport = {
  id: string;
  report_type: string;
  created_at: string;
  content: Record<string, unknown> | null;
};

const lensDescriptions: Record<CriticLens, string> = {
  story_structure: "Structure and stakes",
  prose_quality: "Prose quality and voice",
  continuity: "Continuity and timeline",
  character_depth: "Character depth and interaction",
  market_fit: "Market fit and reader promise",
  contemporary_view: "Contemporary View alignment",
  revision_priorities: "Highest-leverage revision priorities",
  dialogue_density: "Dialogue density vs. author's setting",
};

// Reports newer than this render as "just updated" -- a colored border plus
// a relative-time badge instead of the plain date -- so a critic re-run
// (e.g. Focused Rewrite's Re-evaluate stage) is noticeable here even after
// its own completion message has scrolled away or been dismissed.
const RECENT_THRESHOLD_MS = 15 * 60 * 1000;

function scoreBand(score: number) {
  if (score >= 85) return { band: "STRONG", bg: "oklch(0.94 0.05 165)", color: "oklch(0.4 0.1 165)", ring: "oklch(0.65 0.15 165)" };
  if (score >= 70) return { band: "SOLID", bg: "oklch(0.94 0.03 250)", color: "oklch(0.45 0.09 250)", ring: "oklch(0.68 0.14 145)" };
  return { band: "NEEDS WORK", bg: "oklch(0.95 0.06 60)", color: "oklch(0.5 0.12 60)", ring: "oklch(0.65 0.14 60)" };
}

function lensPresentation(score: number | null, analyzed: boolean) {
  if (typeof score === "number") {
    const b = scoreBand(score);
    return {
      ring: b.ring,
      band: b.band as string | null,
      bandBg: b.bg,
      bandColor: b.color,
      statusLabel: "EVALUATED",
      statusBg: "oklch(0.94 0.05 165)",
      statusColor: "oklch(0.4 0.1 165)",
    };
  }
  if (analyzed) {
    return {
      ring: "oklch(0.5 0.16 275)",
      band: null as string | null,
      bandBg: null,
      bandColor: null,
      statusLabel: "ANALYZED, NO SCORE",
      statusBg: "oklch(0.94 0.04 275)",
      statusColor: "oklch(0.45 0.13 275)",
    };
  }
  return {
    ring: "oklch(0.85 0.005 90)",
    band: null as string | null,
    bandBg: null,
    bandColor: null,
    statusLabel: "NOT ANALYZED YET",
    statusBg: "oklch(0.96 0.003 90)",
    statusColor: "oklch(0.5 0.005 90)",
  };
}

export function CriticScoreboard({ reports }: { reports: CriticReport[] }) {
  // `reports` here is often the book's raw, unfiltered coherence_reports
  // feed (rewrite_execution, rewrite_plan, drift checks, etc. included) --
  // the badge must only count the critic ones, or it silently displays a
  // number larger than the 8 possible lenses could ever produce.
  const criticReports = reports.filter((report) => isCriticReportType(report.report_type));
  const latestByLens = getLatestReportByLens(criticReports);
  // Intentionally reads wall-clock time at render for the "recent" freshness
  // badge -- not a ticking clock, just a snapshot compared against report
  // timestamps each time this re-renders with new report data.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const lensRows = (Object.keys(criticLenses) as CriticLens[]).map((lens) => {
    const report = latestByLens.get(lens);
    const score = extractCriticScore(report?.content);
    const analyzed = Boolean(report);
    const scored = typeof score === "number";
    const ageMs = report ? now - Date.parse(report.created_at) : Infinity;
    const isRecent = ageMs < RECENT_THRESHOLD_MS;
    return { lens, report, score: scored ? (score as number) : null, analyzed, isRecent };
  });

  const scoredRows = lensRows.filter((row) => row.score !== null);
  const avgScore = scoredRows.length ? Math.round(scoredRows.reduce((sum, row) => sum + (row.score as number), 0) / scoredRows.length) : null;
  const sortedByScore = [...scoredRows].sort((a, b) => (b.score as number) - (a.score as number));
  const topRow = sortedByScore[0] || null;
  const lowRow = sortedByScore[sortedByScore.length - 1] || null;

  return (
    <div style={{ background: "#fff", border: "1px solid oklch(0.92 0.003 90)", borderRadius: 12, padding: "24px 26px", marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "oklch(0.2 0.005 90)" }}>BookForge Critic</div>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "oklch(0.5 0.005 90)" }}>
            Single-value evaluation graphs appear as each lens is run.
          </p>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 6,
            background: "oklch(0.94 0.04 275)",
            color: "oklch(0.45 0.13 275)",
            whiteSpace: "nowrap",
          }}
        >
          {criticReports.length} saved
        </span>
      </div>

      {avgScore !== null && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
          <div style={{ border: "1px solid oklch(0.92 0.003 90)", borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.55 0.005 90)" }}>Average score</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: "oklch(0.2 0.005 90)", marginTop: 4 }}>{avgScore}</div>
          </div>
          {topRow && (
            <div style={{ border: "1px solid oklch(0.85 0.06 165)", background: "oklch(0.97 0.03 165)", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.4 0.09 165)" }}>Strongest lens</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "oklch(0.3 0.1 165)", marginTop: 4 }}>
                {lensDescriptions[topRow.lens]} · {topRow.score}
              </div>
            </div>
          )}
          {lowRow && (
            <div style={{ border: "1px solid oklch(0.85 0.08 60)", background: "oklch(0.97 0.04 60)", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.45 0.1 60)" }}>Needs the most work</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "oklch(0.35 0.1 60)", marginTop: 4 }}>
                {lensDescriptions[lowRow.lens]} · {lowRow.score}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {lensRows.map(({ lens, report, score, analyzed, isRecent }) => {
          const presentation = lensPresentation(score, analyzed);
          return (
            <div
              key={lens}
              style={{
                border: "1px solid oklch(0.92 0.003 90)",
                borderLeft: `4px solid ${presentation.ring}`,
                borderRadius: 10,
                padding: 18,
                display: "flex",
                gap: 16,
                alignItems: "flex-start",
              }}
            >
              <ScoreRing score={score} color={presentation.ring} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.2 0.005 90)" }}>{lensDescriptions[lens]}</span>
                  {presentation.band && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                        padding: "3px 8px",
                        borderRadius: 5,
                        background: presentation.bandBg as string,
                        color: presentation.bandColor as string,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {presentation.band}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.005 90)", marginTop: 4, lineHeight: 1.5 }}>
                  {criticLenses[lens].instruction}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      padding: "3px 8px",
                      borderRadius: 5,
                      background: presentation.statusBg,
                      color: presentation.statusColor,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {presentation.statusLabel}
                  </span>
                  {report && isRecent && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                        padding: "3px 8px",
                        borderRadius: 5,
                        background: "oklch(0.5 0.16 275)",
                        color: "#fff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Updated {formatRecency(now - Date.parse(report.created_at))}
                    </span>
                  )}
                  {report && !isRecent && (
                    <span style={{ fontSize: 12, color: "oklch(0.55 0.005 90)" }}>{new Date(report.created_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreRing({ score, color }: { score: number | null; color: string }) {
  const size = 72;
  const radius = 30;
  const strokeWidth = 7;
  const circumference = 2 * Math.PI * radius;
  const dash = ((score ?? 100) / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="oklch(0.93 0.003 90)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dash.toFixed(1)} ${circumference.toFixed(1)}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize={20} fontWeight={800} fill="oklch(0.2 0.005 90)" fontFamily="Inter, sans-serif">
        {score ?? "--"}
      </text>
    </svg>
  );
}

function getLatestReportByLens(reports: CriticReport[]) {
  const map = new Map<CriticLens, CriticReport>();

  for (const report of [...reports].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    const lens = getLensFromReportType(report.report_type);
    if (!(lens in criticLenses) || map.has(lens)) continue;
    map.set(lens, report);
  }

  return map;
}

function getLensFromReportType(reportType: string) {
  return reportType.replace(/^critic_post:/, "").replace(/^critic:/, "") as CriticLens;
}

function formatRecency(ageMs: number) {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "just now";
  return `${minutes}m ago`;
}
