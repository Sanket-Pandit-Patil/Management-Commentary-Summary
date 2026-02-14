import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Portal – Earnings Call Summary",
  description: "Internal research tool for structured earnings call summaries."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}

