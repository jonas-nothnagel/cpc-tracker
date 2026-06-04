// The real <html>/<body> shell lives in `[locale]/layout.tsx` so it can
// react to the active locale. This root layout is a passthrough required by
// the App Router; everything user-facing renders below the [locale] segment.

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
