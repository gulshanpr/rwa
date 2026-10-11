import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/layout/app-shell";
import { Footer } from "@/components/layout/footer";
import { searchIndex } from "@/lib/profile";
import { SITE } from "@/lib/site";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const paperMono = localFont({
  src: "./fonts/PaperMono-Variable.woff2",
  variable: "--font-paper-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: `${SITE.name} · Tokenized assets, risk-checked`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  alternates: { types: { "application/rss+xml": "/api/alerts.rss" } },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${paperMono.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell footer={<Footer />} searchItems={await searchIndex()}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
