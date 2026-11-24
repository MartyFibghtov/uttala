import { SITE } from "@/lib/site";

export const OG_SIZE = { width: 1200, height: 630 };

/** Keep only characters the default image font can draw (Latin), so titles never render as empty boxes. */
export const ogSafe = (text: string) => text.replace(/[^ -ɏ]/g, "").replace(/\s+/g, " ").trim();

const BARS = [60, 108, 144, 84];

/** The 1200x630 social card: wordmark, a headline, a supporting line and an optional badge. */
export function OgCard({
  eyebrow,
  title,
  subtitle,
  badge,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1c1c1f 100%)",
        color: "#ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", marginRight: 20 }}>
            {BARS.map((h, i) => (
              <div key={i} style={{ width: 16, height: h / 2, marginRight: 8, borderRadius: 8, background: "#ffffff" }} />
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>{SITE.name}</div>
        </div>
        {badge ? (
          <div style={{ display: "flex", fontSize: 28, padding: "10px 24px", borderRadius: 999, background: "#ffffff22" }}>{badge}</div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {eyebrow ? <div style={{ display: "flex", fontSize: 32, color: "#a1a1aa", marginBottom: 16 }}>{eyebrow}</div> : null}
        <div style={{ display: "flex", fontSize: title.length > 40 ? 64 : 80, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 34, color: "#d4d4d8", marginTop: 24 }}>{subtitle}</div>
      </div>
    </div>
  );
}
