import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PwaRegistrar } from "@/components/providers/pwa-registrar";
import { QueryProvider } from "@/components/providers/query-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Chertt",
  description: "A warm, mobile-first conversational operations workspace for businesses, churches, stores, and events.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chertt",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <PwaRegistrar />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
