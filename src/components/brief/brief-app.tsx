"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { scopeOf, type Scope } from "@/lib/brief/compute";
import { buildBriefData } from "@/lib/brief/data";
import { paginate } from "@/lib/brief/sections";
import {
  defaultSelection,
  selectionQuery,
  type BriefSelection,
  type SectionId,
} from "@/lib/brief/selection";
import type { BriefSource } from "@/lib/brief/source";
import { Builder } from "./builder";
import { Flow } from "./flow";
import { Hero } from "./hero";
import { Hub } from "./hub/hub";
import { BriefPanels, type PanelState } from "./panels";
import { clip } from "./ink";
import { SectionView, type SectionHandlers } from "./section-view";
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

/** Sections the coherence overview shows on screen; they print as sections. */
const OVERVIEW_SECTIONS: SectionId[] = ["overall", "together", "aligned", "apart", "commitments", "documents"];

/**
 * The coherence brief. On screen it is one flowing page; the A4 sheets are
 * always laid out (off screen, so their charts are drawn at page size) and
 * come forward as a print preview from the print button, and in print.
 */
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
  const tp = useTranslations("brief.preview");
  const [selection, setSelection] = useState(initialSelection);
  const [panels, setPanels] = useState<PanelState[]>([]);
  const [mode, setMode] = useState<"read" | "preview">("read");
  // Where the reader was on the flowing page when the preview opened.
  const readScroll = useRef(0);
  const printRef = useRef<HTMLButtonElement>(null);
  const lastMode = useRef(mode);

  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    if (mode === "preview") {
      // The preview opens at its first page, with Print in reach.
      document.getElementById("brief-main")?.scrollIntoView({ block: "start" });
      printRef.current?.focus({ preventScroll: true });
    } else {
      window.scrollTo(0, readScroll.current);
    }
  }, [mode]);
  const openPreview = () => {
    readScroll.current = window.scrollY;
    setMode("preview");
  };

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
  // Say so whenever the commitments on the page are not the documents' own wording.
  const translation = scope.commitments.some((c) => c.translated === "machine")
    ? "machine"
    : scope.commitments.some((c) => c.translated === "translation")
      ? "source"
      : null;

  const handlers: SectionHandlers = useMemo(
    () => ({
      onOpenPair: (a, b) => setPanels([{ kind: "pair", a, b }]),
      onOpenDocPair: (a, b) => setPanels([{ kind: "docPair", a, b }]),
      onOpenCommitment: (id) => setPanels([{ kind: "commitment", id }]),
      onOpenTheme: (type, name) => setPanels([{ kind: "theme", type, name }]),
    }),
    [],
  );

  const readBrief = () =>
    document.getElementById("brief-main")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const customize = () => {
    const title = document.getElementById("brief-builder-title");
    title?.scrollIntoView({ behavior: "smooth", block: "start" });
    title?.focus({ preventScroll: true });
  };
  const preview = mode === "preview";

  return (
    <div data-brief className="brief-root">
      <Hero
        countryName={source.countryName}
        commitments={scope.commitments.length}
        documents={scope.docs.length}
        comparisons={scope.comparisons.length}
        lines={lines}
        translation={translation}
        onRead={readBrief}
        onCustomize={customize}
      />
      <div className="brief-desk" data-mode={mode}>
        <Builder
          source={source}
          selection={selection}
          pageCount={pages.length}
          onChange={update}
          onReset={() => update(defaultSelection(source))}
          onPrint={() => (preview ? window.print() : openPreview())}
        />
        <div className="brief-main" id="brief-main">
          {preview && (
            <div className="brief-preview-bar" data-screen-only>
              <p className="brief-preview-pages">{tp("pages", { count: pages.length })}</p>
              <button ref={printRef} type="button" className="brief-button-primary" onClick={() => window.print()}>
                {tp("print")}
              </button>
              <button type="button" className="brief-button-quiet" onClick={() => setMode("read")}>
                {tp("back")}
              </button>
            </div>
          )}
          <Flow
            hidden={preview}
            overview={
              <Hub
                data={data}
                onOpenTheme={handlers.onOpenTheme}
                onOpenCommitment={handlers.onOpenCommitment}
                onOpenDocPair={handlers.onOpenDocPair}
                onOpenPair={handlers.onOpenPair}
              />
            }
            sections={selection.sections.filter((id) => !OVERVIEW_SECTIONS.includes(id))}
            renderSection={(id) => (
              <SectionView id={id} variant="screen" data={data} lensName={lensName} handlers={handlers} />
            )}
          />
          <Sheets
            pages={pages}
            countryName={source.countryName}
            preparedOn={preparedOn}
            hidden={!preview}
            titleBlock={
              <TitleBlock
                countryName={source.countryName}
                commitments={scope.commitments.length}
                documents={scope.docs.length}
                comparisons={scope.comparisons.length}
                translation={translation}
              />
            }
            renderSection={(id) => (
              <SectionView id={id} variant="print" data={data} lensName={lensName} handlers={handlers} />
            )}
          />
        </div>
      </div>
      <div data-screen-only>
        <BriefPanels
          stack={panels}
          source={source}
          data={data}
          onPush={(next) => setPanels((stack) => [...stack, next])}
          onBack={() => setPanels((stack) => stack.slice(0, -1))}
          onClose={() => setPanels([])}
        />
      </div>
    </div>
  );
}
