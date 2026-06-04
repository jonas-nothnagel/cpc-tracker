import type { Metadata } from "next";

import { SustainabilityClient } from "@/components/sustainability/sustainability-client";

export const metadata: Metadata = {
  title: "AI Sustainability Footprint | CPC Tracker",
  description:
    "Estimated environmental footprint of the AI computation behind the CPC Tracker, for transparency reporting.",
};

export default function SustainabilityPage() {
  return <SustainabilityClient />;
}
