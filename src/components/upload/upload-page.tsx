"use client";

import "@/components/brief/brief.css";
import "./upload.css";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LOCALE_LABELS } from "@/i18n/locale-labels";
import { routing } from "@/i18n/routing";
import { draftCounts } from "@/lib/upload/counts";
import { documentColors } from "@/lib/upload/documents";
import type { ServiceFacts } from "@/lib/upload/service";
import type { Draft } from "@/lib/upload/types";
import { DocumentsStep } from "./documents-step";
import { STEPS, type StepId } from "@/lib/upload/steps";
import { UploadBuilder } from "./upload-builder";
import { uploadPath, useDraft } from "./use-draft";

/** The lockup and the page in each language. */
function UploadTop({ draftId }: { draftId?: string }) {
  const locale = useLocale();
  const brand = useTranslations("header")("brand");
  const tl = useTranslations("common.languageSwitcher");
  return (
    <header className="up-top">
      <a className="up-brand" href={locale === routing.defaultLocale ? "/" : `/${locale}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the app's own lockup, small and static */}
        <img src="/undp-logo.png" alt="UNDP" width={22} height={44} /> <span>{brand}</span>
      </a>
      <nav className="up-languages" aria-label={tl("aria")}>
        {routing.locales.map((l) =>
          l === locale ? (
            <span key={l} aria-current="true">
              {LOCALE_LABELS[l] ?? l}
            </span>
          ) : (
            <a
              key={l}
              lang={l}
              href={uploadPath(l, draftId)}
              onClick={(e) => e.currentTarget.setAttribute("href", `${uploadPath(l, draftId)}${window.location.search}`)}
            >
              {LOCALE_LABELS[l] ?? l}
            </a>
          ),
        )}
      </nav>
    </header>
  );
}

/**
 * The upload page: the brief's builder column beside one step at a time.
 * The draft lives on the server; the step lives in the address.
 */
export function UploadPage({
  initialDraft,
  initialStep = "documents",
  lockedCountry,
  facts,
}: {
  initialDraft: Draft | null;
  initialStep?: StepId;
  lockedCountry?: string;
  facts: ServiceFacts;
}) {
  const locale = useLocale();
  const ts = useTranslations("upload.steps");
  const [pendingCountry, setPendingCountry] = useState(lockedCountry ?? "");
  const { draft, error, adding, addFiles, change, read } = useDraft(initialDraft, {
    locale,
    country: lockedCountry ?? pendingCountry,
  });
  const counts = useMemo(() => draftCounts(draft), [draft]);
  const colors = useMemo(() => documentColors((draft?.documents ?? []).map((d) => d.code)), [draft]);
  const country = draft?.country ?? pendingCountry;

  const reachable = (id: StepId) =>
    id === "documents" || (id === "start" ? counts.withTargets >= 2 : counts.targets > 0);
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
      <UploadTop draftId={draft?.id} />
      <div className="brief-desk up-desk">
        <UploadBuilder
          draft={draft}
          country={country}
          colors={colors}
          counts={counts}
          step={step}
          reachable={reachable}
          onStep={go}
        />
        <main className="brief-main" id="up-main">
          {step === "documents" && (
            <DocumentsStep
              draft={draft}
              country={country}
              locked={!!lockedCountry && !draft}
              colors={colors}
              facts={facts}
              adding={adding}
              error={error}
              onCountry={(value) => (draft ? change({ op: "country", value }) : setPendingCountry(value))}
              onFiles={addFiles}
              onChange={change}
              onRead={read}
              onContinue={next("documents")}
            />
          )}
          {step !== "documents" && <h2 className="up-title">{ts(step)}</h2>}
        </main>
      </div>
    </div>
  );
}
