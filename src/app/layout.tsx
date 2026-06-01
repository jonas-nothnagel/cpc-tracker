import type { Metadata, Viewport } from "next";
import { Lora } from "next/font/google";
import "./globals.css";

// Editorial serif for headlines (UNDP pairs its titles with Lora). Exposed as a
// CSS variable so Tailwind / the `.font-display` utility can opt specific
// headings into it while body copy stays on the clean system sans.
const lora = Lora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

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
    <html lang="en" className={lora.variable}>
      <body style={{ margin: 0, minHeight: "100vh" }}>{children}</body>
    </html>
  );
}
