import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { TestEnvBanner } from "@/components/test-env-banner";
import { ThemeProvider } from "@/components/theme";
import { Toaster } from "@/components/ui/sonner";
import { SITE } from "@/lib/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "SayClear · Sound clear, then sound native", template: "%s · SayClear" },
  description: SITE.description,
  openGraph: {
    title: "SayClear · Sound clear, then sound native",
    description: SITE.description,
    siteName: SITE.name,
    type: "website",
    images: [{ url: "/images/hero-acoustic.jpg", width: 1376, height: 768, alt: "SayClear acoustic waves" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SayClear · Sound clear, then sound native",
    description: SITE.description,
    images: ["/images/hero-acoustic.jpg"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider>
          <TestEnvBanner />
          {children}
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
