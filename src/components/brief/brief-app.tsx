"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { scopeOf, type Scope } from "@/lib/brief/compute";
import { buildBriefData } from "@/lib/brief/data";
import { paginate } from "@/lib/brief/sections";
import {
  defaultSelection,
  selectionQuery,
  type BriefSelection,
} from "@/lib/brief/selection";
import type { BriefSource } from "@/lib/brief/source";
import { Builder } from "./builder";
import { Hero } from "./hero";
import { clip } from "./ink";
import { SectionView } from "./section-view";
import { Sheets, TitleBlock } from "./sheets";
import "./brief.css";

/** Verbatim commitments for the landing, dealt across documents in turn. */
function driftLines(scope: Scope, max = 108): string[] {
  const byDoc = scope.docs.map((d) => scope.commitments.filter((c) => c.doc === d.id));
  const lines: string[] = [];
  for (let i = 0; lines.length < max && byDoc.some((list) => i < list.length); i++) {
    for (const list of byDoc) {
      if (i < list.length && lines.length < max) lines.push(clip(list[i].text, 150));
    }
  }
  return lines;
}

export function BriefApp({
  source,
  initialSelection,
  preparedOn,
}: {
  source: BriefSource;
  initialSelection: BriefSelection;
  preparedOn: string;
}) {
  const tl = useTranslations("briefing.lens");
  const [selection, setSelection] = useState(initialSelection);

  const update = useCallback(
    (next: BriefSelection) => {
      setSelection(next);
      // A shallow URL update keeps the brief shareable without a server
      // round trip; every number is computed here from the source.
      const query = selectionQuery(next, source);
      const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
      window.history.replaceState(window.history.state, "", url);
    },
    [source],
  );

  const scope = useMemo(() => scopeOf(source, selection.docs), [source, selection.docs]);
  const pages = useMemo(() => paginate(selection.sections), [selection.sections]);
  const lines = useMemo(() => driftLines(scope), [scope]);
  const data = useMemo(
    () => buildBriefData(source, scope, selection.lens),
    [source, scope, selection.lens],
  );
  const lensName = selection.lens ? tl(selection.lens) : null;

  const readBrief = () =>
    document.getElementById("brief-sheets")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const customize = () => {
    const title = document.getElementById("brief-builder-title");
    title?.scrollIntoView({ behavior: "smooth", block: "start" });
    title?.focus({ preventScroll: true });
  };

  return (
    <div data-brief className="brief-root">
      <Hero
        countryName={source.countryName}
        commitments={scope.commitments.length}
        documents={scope.docs.length}
        comparisons={scope.comparisons.length}
        lines={lines}
        onRead={readBrief}
        onCustomize={customize}
      />
      <div className="brief-desk">
        <Builder
          source={source}
          selection={selection}
          pageCount={pages.length}
          onChange={update}
          onReset={() => update(defaultSelection(source))}
          onPrint={() => window.print()}
        />
        <Sheets
          pages={pages}
          countryName={source.countryName}
          preparedOn={preparedOn}
          titleBlock={
            <TitleBlock
              countryName={source.countryName}
              commitments={scope.commitments.length}
              documents={scope.docs.length}
              comparisons={scope.comparisons.length}
              lensName={lensName}
              documentNames={scope.docs.map((d) => d.full)}
            />
          }
          renderSection={(id) => (
            <SectionView id={id} data={data} lensName={lensName} handlers={{}} />
          )}
        />
      </div>
    </div>
  );
}
