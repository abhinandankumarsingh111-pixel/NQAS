import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NQAS — Notebook Quality Assurance System",
  description: "Notebook verification, standardized.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
