"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { Focus } from "@/lib/brief/contracts/focus";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import type { LensKey } from "@/lib/brief/contracts/model";
import { scopeSetup, type ContractsSetup } from "@/lib/brief/contracts/setup";
import type { LensId } from "@/lib/brief/source";
import type { PanelState } from "./contracts-page";
import { CurrencySwitch } from "./currency-switch";
import { FocusBar } from "./focus-bar";
import type { Currency } from "./money";
import { Overview, type Step } from "./overview";
import { ContractsPanels } from "./panels";
import "./contracts.css";

/** The country's public contract record and the outlines its map is drawn
 *  on, from the server. */
export interface BriefContracts {
  setup: ContractsSetup;
  geo: GeoFile | null;
}

/** The brief keeps the steps up to the map; the rest stay on the contracts page. */
const BRIEF_STEPS: readonly Step[] = ["record", "purpose", "places"];

/** The focus the section keeps itself: a policy area under the lens it was
 *  chosen in, a document and a place. The lens is the brief's. */
interface OwnFocus {
  area: { lens: LensKey; id: string } | null;
  doc: string | null;
  place: string | null;
}

/**
 * The public contracts in the brief: the record, its share for nature or
 * climate and where it lands, beside the record's field, under one focus.
 * The brief decides the lens and the documents: the policy areas read by
 * the brief's lens (by Biodiversity where no contract carries it), and the
 * targets are those in the brief's documents. A contract, a target or a
 * list opens in the section's panel; a target goes on to the ring.
 */
export function ContractsSection({
  contracts,
  docs,
  lens,
  onLens,
  currency,
  onCurrency,
  onExplore,
}: {
  contracts: BriefContracts;
  /** The brief's documents. */
  docs: string[];
  /** The brief's lens. */
  lens: LensId | null;
  onLens: (lens: LensKey) => void;
  currency: Currency;
  onCurrency: (next: Currency) => void;
  /** Puts a target in the centre of the ring further down. */
  onExplore?: (id: string) => void;
}) {
  const t = useTranslations("brief.contracts");
  const setup = useMemo(() => scopeSetup(contracts.setup, docs), [contracts.setup, docs]);
  const lensKey = (setup.lenses.find((l) => l.id === lens)?.id ?? setup.lenses[0]?.id ?? "globe") as LensKey;
  const [own, setOwn] = useState<OwnFocus>({ area: null, doc: null, place: null });
  // A new lens, or a document leaving the brief, lets its part of the focus
  // go for good (it does not come back with the lens or the document).
  const scopeKey = `${lensKey}|${docs.join()}`;
  const [seen, setSeen] = useState(scopeKey);
  if (seen !== scopeKey) {
    setSeen(scopeKey);
    setOwn((cur) => {
      const area = cur.area && cur.area.lens !== lensKey ? null : cur.area;
      const doc = cur.doc !== null && !docs.includes(cur.doc) ? null : cur.doc;
      return area === cur.area && doc === cur.doc ? cur : { ...cur, area, doc };
    });
  }
  const focus: Focus = {
    lens: lensKey,
    area: own.area && own.area.lens === lensKey ? own.area.id : null,
    doc: own.doc !== null && docs.includes(own.doc) ? own.doc : null,
    place: own.place,
  };
  const onFocus = (patch: Partial<Focus>) => {
    const next = patch.lens ?? lensKey;
    if (next !== lensKey) onLens(next);
    setOwn((cur) => ({
      area:
        patch.area !== undefined
          ? patch.area === null
            ? null
            : { lens: next, id: patch.area }
          : next !== lensKey
            ? null
            : cur.area,
      doc: patch.doc !== undefined ? patch.doc : cur.doc,
      place: patch.place !== undefined ? patch.place : cur.place,
    }));
  };

  const [stack, setStack] = useState<PanelState[]>([]);
  const open = (p: PanelState) => setStack([p]);
  const placeNames = useMemo(
    () => Object.fromEntries((contracts.geo?.features ?? []).map((f) => [f.code, f.name])),
    [contracts.geo],
  );
  // The panel closes and hands focus back to where it was opened first, so
  // the page then moves on to the ring and stays there.
  const explore = onExplore
    ? (id: string) => {
        setStack([]);
        window.setTimeout(() => onExplore(id), 0);
      }
    : undefined;

  return (
    <div className="ct-brief" data-testid="brief-contracts">
      <header className="ct-brief-head">
        <h2 id="brief-contracts-title" className="ct-brief-title" tabIndex={-1}>
          {t("title")}
        </h2>
        <CurrencySwitch currency={currency} rate={setup.file.source.usdRate} onChange={onCurrency} />
      </header>
      <FocusBar setup={setup} focus={focus} placeNames={placeNames} onFocus={onFocus} />
      <Overview
        setup={setup}
        geo={contracts.geo}
        focus={focus}
        onFocus={onFocus}
        onContract={(id) => open({ kind: "contract", id })}
        onTarget={(id) => open({ kind: "target", id })}
        onList={(list) => open({ kind: "list", ...list })}
        steps={BRIEF_STEPS}
      />
      <ContractsPanels
        stack={stack}
        setup={setup}
        placeNames={placeNames}
        onPush={(next) => setStack((s) => [...s, next])}
        onBack={() => setStack((s) => s.slice(0, -1))}
        onClose={() => setStack([])}
        onExplore={explore}
      />
    </div>
  );
}
