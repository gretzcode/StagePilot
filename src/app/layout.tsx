import "@/lib/polyfills";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StagePilot — Realtime Stage Control System",
  description: "Realtime web application for VJs, stage operators, show callers, speakers, and technical crews.",
  icons: {
    icon: [{ url: "/favicon.ico?v=2", sizes: "any" }],
    shortcut: "/favicon.ico?v=2",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var g=typeof globalThis!=="undefined"?globalThis:typeof window!=="undefined"?window:this;var P=g&&g.Promise?g.Promise:Promise;if(P&&typeof P.withResolvers!=="function"){P.withResolvers=function(){var res,rej,p=new P(function(r,j){res=r;rej=j;});return{promise:p,resolve:res,reject:rej};};}if(typeof Promise!=="undefined"&&typeof Promise.withResolvers!=="function"){Promise.withResolvers=P.withResolvers;}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-purple-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
