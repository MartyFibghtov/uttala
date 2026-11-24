import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { TestEnvBanner } from "@/components/test-env-banner";
import { ThemeProvider } from "@/components/theme";
import { Toaster } from "@/components/ui/sonner";
import { LANGUAGES } from "@/lib/languages";
import { SITE } from "@/lib/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext", "cyrillic"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const TITLE = `${SITE.name}: Pronunciation practice in ${LANGUAGES.length} languages`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: TITLE, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  // Social images come from the opengraph-image file convention (root, language and sound routes).
  openGraph: { siteName: SITE.name, type: "website", locale: "en_US", title: TITLE, description: SITE.description },
  twitter: { card: "summary_large_image", title: TITLE, description: SITE.description },
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
