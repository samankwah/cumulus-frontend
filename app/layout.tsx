import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";

import "leaflet/dist/leaflet.css";

import "./globals.css";
import "./subseasonal.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "Cumulus · Ghana Forecast Map",
  description: "Near-real-time Ghana seasonal agro-climate map powered by published Cumulus seasonal products.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  manifest: "/site.webmanifest",
  // Added to the Home Screen, the app runs full screen with the map under the status bar.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Cumulus" },
};

/**
 * Edge to edge on phones: the page may draw under the status bar and home indicator (so
 * env(safe-area-inset-*) is real), and Safari tints its bars with the map-panel grey, not white.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e2e8ee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.variable}>{children}</body>
    </html>
  );
}
