import { DashboardClient } from "@/components/dashboard/dashboard-client";

interface DashboardPageProps {
  searchParams: Promise<{ analysisId?: string }>;
}

export async function generateMetadata({ searchParams }: DashboardPageProps) {
  const { analysisId } = await searchParams;
  return {
    title: analysisId
      ? `Analysis ${analysisId} — CPC Tracker`
      : "Mongolia Dashboard — CPC Tracker",
  };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { analysisId } = await searchParams;
  return <DashboardClient analysisId={analysisId} />;
}
