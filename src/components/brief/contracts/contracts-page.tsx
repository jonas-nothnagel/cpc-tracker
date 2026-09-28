"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { GeoFile } from "@/lib/brief/contracts/geo";
import type { LensKey } from "@/lib/brief/contracts/model";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { Overview } from "./overview";
import { ContractsPanels } from "./panels";
import "../brief.css";
import "./contracts.css";

/** A contract or a target opened in the panel, as a trail. */
export type PanelState = { kind: "contract"; id: string } | { kind: "target"; id: string };

/**
 * Public contracts beside the targets, on a page of its own: the overview
 * (the record narrowing to nature and climate, toward the policy areas and
 * places), then the deep dives, with a contract or a target in a panel.
 */
export function ContractsPage({ setup, geo }: { setup: ContractsSetup; geo: GeoFile | null }) {
  const t = useTranslations("brief.contracts");
  const [lens, setLens] = useState<LensKey>((setup.lenses[0]?.id as LensKey) ?? "globe");
  const [stack, setStack] = useState<PanelState[]>([]);
  const open = (p: PanelState) => setStack([p]);
  const placeNames = useMemo(() => Object.fromEntries((geo?.features ?? []).map((f) => [f.code, f.name])), [geo]);

  return (
    <div data-brief className="brief-root">
      <div className="ct-page">
        <header className="ct-head">
          <p className="ct-country">{setup.countryName}</p>
          <h1 className="ct-title">{t("title")}</h1>
        </header>
        <Overview
          setup={setup}
          geo={geo}
          lens={lens}
          onLens={setLens}
          onContract={(id) => open({ kind: "contract", id })}
          onTarget={(id) => open({ kind: "target", id })}
        />
      </div>
      <ContractsPanels
        stack={stack}
        setup={setup}
        placeNames={placeNames}
        onPush={(next) => setStack((s) => [...s, next])}
        onBack={() => setStack((s) => s.slice(0, -1))}
        onClose={() => setStack([])}
      />
    </div>
  );
}
