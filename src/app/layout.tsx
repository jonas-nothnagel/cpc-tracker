import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CPC Tracker",
  description: "Nature-Climate Policy Coherence Progress Analysis Tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
