import "../globals.css";

/**
 * Minimal shell for the internal analytics dashboard. Lives OUTSIDE the
 * [locale] tree on purpose: English-only internal tool, no i18n messages,
 * and no AnalyticsProvider — the dashboard never tracks itself. The root
 * layout is a passthrough, so this segment supplies its own <html>/<body>
 * (same pattern as src/app/[locale]/layout.tsx).
 *
 * REMOVABLE SYSTEM: see src/lib/analytics/README.md.
 */

export const metadata = {
  title: "Usage analytics",
  robots: { index: false, follow: false },
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh" }}>{children}</body>
    </html>
  );
}
