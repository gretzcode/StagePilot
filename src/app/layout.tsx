import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StagePilot — Realtime Stage Control System",
  description: "Realtime web application for VJs, stage operators, show callers, speakers, and technical crews.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-purple-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
