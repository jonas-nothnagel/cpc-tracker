import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FootprintChip } from "@/components/sustainability/footprint-chip";

export const metadata: Metadata = {
  title: "CPC Tracker | Policy Coherence Analysis",
  description: "AI-assisted tool for assessing coherence across nature-climate policies and tracking implementation progress.",
  icons: {
    icon: "/undp-logo.png",
  },
  openGraph: {
    title: "CPC Tracker | Policy Coherence Analysis",
    description: "AI-assisted tool for assessing coherence across nature-climate policies and tracking implementation progress.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh" }}>
        {children}
        <FootprintChip />
      </body>
    </html>
  );
}
