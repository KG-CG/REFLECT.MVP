import "./globals.css";
import type { Metadata, Viewport } from "next";

const title = "Reflect — Solana trading journal";
const description = "See how you actually trade. Track your FOMO handle or Solana wallet, spot costly habits, and get specific fixes.";
// Set NEXT_PUBLIC_SITE_URL on Vercel to your real domain so social previews resolve correctly.
const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title, description,
  icons: { icon: "/logo.jpg", apple: "/logo.jpg" },
  openGraph: { title, description, images: ["/logo.jpg"], type: "website" },
  twitter: { card: "summary", title, description, images: ["/logo.jpg"] },
};
export const viewport: Viewport = { themeColor: "#07060f", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
