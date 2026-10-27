"use client";

import "@/components/brief/brief.css";
import "./upload.css";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { draftCounts } from "@/lib/upload/counts";
import { documentColors } from "@/lib/upload/documents";
import { getFeedbackClientId } from "@/lib/feedback/client-id";
import type { Speed } from "@/lib/upload/estimate";
import type { PublishedLens } from "@/lib/upload/published-areas";
import type { ServiceFacts } from "@/lib/upload/service";
import type { Draft } from "@/lib/upload/types";
import { MAX_ITEMS } from "@/lib/upload/limits";
import { AreasStep } from "./areas-step";
import { DocumentsStep } from "./documents-step";
import { StartStep } from "./start-step";
import { TargetsStep } from "./targets-step";
import { STEPS, type StepId } from "@/lib/upload/steps";
import { UploadBuilder } from "./upload-builder";
import { UploadHero } from "./upload-hero";
import { useDraft } from "./use-draft";

/**
 * The upload page: the brief's opening with the country as its title, then
 * the brief's builder column beside one step at a time.
 * The draft lives on the server; the step lives in the address.
 */
export function UploadPage({
  initialDraft,
  initialStep = "documents",
  lockedCountry,
  facts,
  lenses,
  speed,
  ahead: initialAhead = 0,
}: {
  initialDraft: Draft | null;
  initialStep?: StepId;
  lockedCountry?: string;
  facts: ServiceFacts;
  /** The four sets of policy areas every analysis reads, with their areas. */
  lenses: PublishedLens[];
  speed: Speed;
  /** Analyses running or waiting when the page was served. */
  ahead?: number;
}) {
  const locale = useLocale();
  const router = useRouter();
  const te = useTranslations("upload.documents.errors");
  const [pendingCountry, setPendingCountry] = useState(lockedCountry ?? "");
  const { draft, ahead, error, startError, adding, addFiles, change, read, start } = useDraft(initialDraft, {
    locale,
    country: lockedCountry ?? pendingCountry,
    ahead: initialAhead,
  });
  const counts = useMemo(() => draftCounts(draft), [draft]);
  const colors = useMemo(() => documentColors((draft?.documents ?? []).map((d) => d.code)), [draft]);
  const country = draft?.country ?? pendingCountry;

  // Once there are targets every step can be seen; the start says what it still needs.
  const reachable = (id: StepId) => id === "documents" || counts.targets > 0;
  const [chosen, setChosen] = useState<StepId>(initialStep);
  const step: StepId = reachable(chosen) ? chosen : "documents";
  const go = (id: StepId) => {
    setChosen(id);
    const url = new URL(window.location.href);
    if (id === "documents") url.searchParams.delete("step");
    else url.searchParams.set("step", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    document.getElementById("up-main")?.scrollIntoView({ block: "start" });
  };
  const next = (id: StepId) => () => go(STEPS[STEPS.indexOf(id) + 1] ?? id);

  return (
    <div data-brief className="up-root">
      <UploadHero draft={draft} country={country} />
      <div className="brief-desk up-desk">
        <UploadBuilder
          draft={draft}
          colors={colors}
          counts={counts}
          step={step}
          reachable={reachable}
          onStep={go}
        />
        <main className="brief-main" id="up-main">
          {error && (
            <p className="up-error up-error-top" role="alert">
              {te(error.code, { file: error.file ?? "" })}
            </p>
          )}
          {step === "documents" && (
            <DocumentsStep
              draft={draft}
              country={country}
              locked={!!lockedCountry && !draft}
              colors={colors}
              facts={facts}
              adding={adding}
              onCountry={(value) => (draft ? change({ op: "country", value }) : setPendingCountry(value))}
              onFiles={addFiles}
              onChange={change}
              onRead={read}
              onContinue={next("documents")}
            />
          )}
          {step === "targets" && draft && (
            <TargetsStep
              draft={draft}
              colors={colors}
              over={Math.max(0, counts.items - MAX_ITEMS)}
              onChange={change}
              onContinue={next("targets")}
            />
          )}
          {step === "areas" && draft && (
            <AreasStep draft={draft} lenses={lenses} onChange={change} onContinue={next("areas")} />
          )}
          {step === "start" && draft && (
            <StartStep
              draft={draft}
              ahead={ahead}
              speed={speed}
              error={startError}
              onStart={async () => {
                const id = await start(getFeedbackClientId());
                if (id) router.push(`/analysis/${id}`);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
