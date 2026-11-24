import { ImageResponse } from "next/og";

/** PNG icons for the web app manifest: /icons/192, /icons/512 and /icons/maskable-512. */
const ICONS: Record<string, { px: number; maskable: boolean }> = {
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  "maskable-512": { px: 512, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((size) => ({ size }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const icon = ICONS[(await params).size];
  if (!icon) return new Response("Not found", { status: 404 });
  const { px, maskable } = icon;
  // Maskable icons keep the artwork inside the central 80% safe zone and fill the whole square.
  const scale = (maskable ? 0.64 : 0.8) * (px / 64);
  const bars = [14, 30, 42, 22].map((h) => h * scale);
  const radius = maskable ? 0 : px * (14 / 64);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#171717", borderRadius: radius }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {bars.map((h, i) => (
            <div key={i} style={{ width: 6 * scale, height: h, marginLeft: i ? 4 * scale : 0, borderRadius: 3 * scale, background: "#ffffff" }} />
          ))}
        </div>
      </div>
    ),
    { width: px, height: px },
  );
}
