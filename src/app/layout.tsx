import "./globals.css";
export const metadata = { title: "Reflect — Solana trading journal", description: "See how you actually trade." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
