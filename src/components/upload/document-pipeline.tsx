"use client";

import { useTranslations } from "next-intl";
import type { UploadedDoc } from "@/lib/upload-helpers";
import { getDocColor } from "@/lib/utils";

interface DocumentPipelineProps {
  uploadedDocs: UploadedDoc[];
  onRemoveDoc: (docId: string) => void;
}

export function DocumentPipeline({ uploadedDocs, onRemoveDoc }: DocumentPipelineProps) {
  const t = useTranslations("upload.pipeline");
  if (uploadedDocs.length === 0) return null;

  return (
    <div className="mt-4 border border-line rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-line-soft bg-gray-50/50">
        <p className="text-caption font-medium text-[var(--undp-gray)]">
          {t("heading")}
        </p>
      </div>
      <div className="p-4">
        {uploadedDocs.map((doc, i) => (
          <div key={doc.id}>
            {i > 0 && (
              <div className="flex justify-center py-1.5">
                <svg width="2" height="20" className="text-line-strong">
                  <line x1="1" y1="0" x2="1" y2="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                </svg>
              </div>
            )}
            <div className={`border rounded-lg p-3 transition-all ${
              doc.status === "error"
                ? "border-red-200 bg-red-50/50"
                : doc.status === "parsing"
                ? "border-line bg-gray-50/30"
                : doc.fileType === "btr"
                ? "border-[var(--undp-blue)]/30 bg-blue-50/30"
                : "border-green-200 bg-green-50/30"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                    doc.fileType === "btr" ? "bg-[var(--undp-blue)]/10" : "bg-green-100"
                  }`}>
                    {doc.fileType === "btr" ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--undp-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M9 3v18M3 9h18M3 15h18" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-body font-medium text-[var(--undp-black)] truncate">{doc.fileName}</p>
                      {doc.status === "parsing" && (
                        <span className="shrink-0 text-caption px-1.5 py-0.5 rounded bg-gray-100 text-[var(--undp-gray)] animate-pulse">{t("status.parsing")}</span>
                      )}
                      {doc.status === "ready" && (
                        <span className="shrink-0 text-caption px-1.5 py-0.5 rounded bg-green-100 text-green-700">{t("status.ready")}</span>
                      )}
                      {doc.status === "error" && (
                        <span className="shrink-0 text-caption px-1.5 py-0.5 rounded bg-red-100 text-red-700">{t("status.error")}</span>
                      )}
                    </div>
                    {doc.status === "error" && doc.error && (
                      <p className="text-caption text-red-600">{doc.error}</p>
                    )}
                    {doc.status === "ready" && doc.fileType === "targets" && doc.docTypeCounts && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {Object.entries(doc.docTypeCounts).map(([docType, count]) => (
                          <span
                            key={docType}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-caption font-medium text-white"
                            style={{ backgroundColor: getDocColor(null, docType) }}
                          >
                            {docType}
                            <span className="opacity-80">{count}</span>
                          </span>
                        ))}
                        <span className="text-caption text-[var(--undp-gray)] ml-1">{t("policyTargetsCount", { count: doc.targetCount ?? 0 })}</span>
                      </div>
                    )}
                    {doc.status === "ready" && doc.fileType === "btr" && doc.btrSummary && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-[var(--undp-gray)]">
                        {doc.btrSummary.mitigationMeasures > 0 && <span>{t("btr.actions", { count: doc.btrSummary.mitigationMeasures })}</span>}
                        {doc.btrSummary.sectorEmissions > 0 && <span>{t("btr.emissions", { count: doc.btrSummary.sectorEmissions })}</span>}
                        {doc.btrSummary.projections > 0 && <span>{t("btr.projections", { count: doc.btrSummary.projections })}</span>}
                        {doc.btrSummary.technologySupport > 0 && <span>{t("btr.techSupport", { count: doc.btrSummary.technologySupport })}</span>}
                        {doc.btrSummary.capacityBuilding > 0 && <span>{t("btr.capacityBuilding", { count: doc.btrSummary.capacityBuilding })}</span>}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onRemoveDoc(doc.id)}
                  className="shrink-0 text-[var(--undp-gray)] hover:text-[var(--undp-red)] transition-colors text-lg leading-none mt-0.5"
                  title={t("remove")}
                >
                  &times;
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
