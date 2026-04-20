import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PreloaderDismiss } from "@/components/providers/preloader-dismiss";
import { PwaRegistrar } from "@/components/providers/pwa-registrar";
import { QueryProvider } from "@/components/providers/query-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Chertt",
  description: "A warm, mobile-first conversational operations workspace for businesses, churches, stores, and events.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: ["/favicon.svg"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chertt",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Inline theme script — runs synchronously before any paint.
          Reads saved theme from localStorage (or prefers-color-scheme) and
          sets data-chertt-theme on <html> so CSS vars + background-color are
          correct immediately. This is a static string — no XSS risk.
        */}
        {/* biome-ignore lint: intentional inline script for theme FOUC prevention */}
        <script
          // Safe: hardcoded constant, no user data interpolated
          // nosemgrep: react-dangerouslysetinnerhtml
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('chertt-theme');if(!t)t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.setAttribute('data-chertt-theme',t);}catch(e){}})();",
          }}
        />
      </head>
      <body>
        {/* Preloader — visible before React hydrates; dismissed by WorkspaceShell */}
        <div id="ch-preloader" aria-hidden="true">
          <div className="ch-pl-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={48} height={48} />
            <div className="ch-pl-dots">
              <div className="ch-pl-dot" />
              <div className="ch-pl-dot" />
              <div className="ch-pl-dot" />
            </div>
          </div>
        </div>
        <QueryProvider>
          <ToastProvider>
            <PreloaderDismiss />
            <PwaRegistrar />
            {children}
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
