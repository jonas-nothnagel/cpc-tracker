"use client";

import { useTranslations } from "next-intl";
import type { Stage } from "@/lib/brief/contracts/field";
import { tierTotals, type ContractsFile } from "@/lib/brief/contracts/model";
import { FIELD_INK } from "./money-field";
import { useMoney } from "./money";

/**
 * The whole record as one line above the field, with the part the step works
 * with inked on it and named: every contract at first, then the two slivers
 * for nature and climate (never added into one figure), then only the money
 * mainly for nature or climate once the field narrows to it.
 */
export function SetLine({ file, stage }: { file: ContractsFile; stage: Stage }) {
  const t = useTranslations("brief.contracts.set");
  const { tugrik, n } = useMoney();
  const total = file.census.value;
  const principal = tierTotals(file, "principal");
  const significant = tierTotals(file, "significant");
  const width = (v: number) => `${total > 0 ? Math.max(0.4, (v / total) * 100) : 0}%`;
  const record = stage.kind === "record";
  const narrow = stage.kind === "areas" || stage.kind === "places";
  return (
    <div className="ct-setline" data-stage={stage.kind}>
      <div className="ct-setline-bar" aria-hidden="true" data-all={record || undefined}>
        {!record && (
          <>
            <span
              className="ct-setline-seg"
              style={{
                width: width(principal.value),
                background: FIELD_INK.principal,
              }}
            />
            <span
              className="ct-setline-seg"
              style={{
                width: width(significant.value),
                background: narrow ? FIELD_INK.rest : FIELD_INK.significant,
              }}
            />
          </>
        )}
      </div>
      <p className="ct-setline-text">
        {record ? (
          t("all", { count: n(file.census.contracts), value: tugrik(total) })
        ) : (
          <>
            <span className="ct-setline-key">
              <i style={{ background: FIELD_INK.principal }} aria-hidden="true" />
              {t("principal", {
                count: n(principal.contracts),
                value: tugrik(principal.value),
              })}
            </span>
            {!narrow && (
              <span className="ct-setline-key">
                <i style={{ background: FIELD_INK.significant }} aria-hidden="true" />
                {t("significant", {
                  count: n(significant.contracts),
                  value: tugrik(significant.value),
                })}
              </span>
            )}
            <span className="ct-setline-of">{t("of", { value: tugrik(total) })}</span>
          </>
        )}
      </p>
    </div>
  );
}
