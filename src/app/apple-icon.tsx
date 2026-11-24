import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // Same four bars as icon.svg, on the full square (iOS rounds the corners itself).
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#171717" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {[28, 60, 84, 44].map((h, i) => (
            <div key={i} style={{ width: 16, height: h, marginLeft: i ? 12 : 0, borderRadius: 8, background: "#ffffff" }} />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
