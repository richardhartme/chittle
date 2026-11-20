import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { SiteNav } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const body = Figtree({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Practise speaking with Chittle",
  description: "Answer a random topic on camera or with audio only. Chittle scores your answer out of 1000 and tells you what to change next time.",
};

// Every page here depends on the signed-in user, so the shell (header and
// frame) is static and the page content streams in behind the boundary.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme on <html> before React hydrates, so React keeps it.
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            <svg className="brand-mark" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
              <path d="M5 3h20a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H14l-6 5v-5H5a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z" fill="#9e82fa" />
              <circle cx="9" cy="13" r="2" fill="#2b0b7d" />
              <circle cx="15" cy="13" r="2" fill="#2b0b7d" />
              <circle cx="21" cy="13" r="2" fill="#f7a918" />
            </svg>
            Chittle
          </Link>
          <div className="site-header-end">
            <Suspense fallback={null}>
              <SiteNav />
            </Suspense>
            <ThemeToggle />
          </div>
        </header>
        <main className="container">
          <Suspense fallback={<p className="muted">Loading…</p>}>{children}</Suspense>
        </main>
        <footer className="site-footer">
          <a href="https://github.com/richardhartme/chittle" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
