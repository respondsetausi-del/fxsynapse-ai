import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FXSynapse AI — Chart Intelligence Engine",
  description:
    "Upload a forex chart screenshot and get instant AI-powered annotated analysis with key levels, trade setups, and market structure detection.",
  keywords: "forex, AI, chart analysis, trading, technical analysis, XAUUSD, MetaTrader",
  openGraph: {
    title: "FXSynapse AI — Chart Intelligence Engine",
    description: "Scan any forex chart. Get annotated intelligence instantly.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
