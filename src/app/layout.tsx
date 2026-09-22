import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vaultline",
  description: "Lock commercials, execute paper, and run renewal for Experience.com.",
};

export const maxDuration = 60;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
