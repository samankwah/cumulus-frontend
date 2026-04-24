import type { Metadata } from "next";
import { Sora, Source_Sans_3 } from "next/font/google";

import "leaflet/dist/leaflet.css";

import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Ghana Seasonal Advisory Map",
  description: "Near-real-time Ghana seasonal agro-climate map powered by published Cumulus seasonal products.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${sourceSans.variable}`}>{children}</body>
    </html>
  );
}
