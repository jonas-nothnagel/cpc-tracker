"use client";

import { useTranslations } from "next-intl";

const STEP_ICONS = [
  "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
  "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  "M13 10V3L4 14h7v7l9-11h-7z",
] as const;
const STEP_KEYS = ["countryDocs", "referenceData", "reviewConfigure", "summaryRun"] as const;

interface WizardNavProps {
  currentStep: number;
  onStepChange: (step: number) => void;
  canProceed: boolean;
  hasExtractionPending?: boolean;
}

export function WizardNav({
  currentStep,
  onStepChange,
  canProceed,
  hasExtractionPending,
}: WizardNavProps) {
  const t = useTranslations("upload.wizard.nav");
  return (
    <div className="mb-8">
      {/* Step cards */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {STEP_KEYS.map((key, i) => {
          const isActive = i === currentStep;
          const isComplete = i < currentStep;
          const isFuture = i > currentStep;
          const icon = STEP_ICONS[i];
          const label = t(`steps.${key}`);
          return (
            <button
              key={i}
              type="button"
              onClick={() => i <= currentStep && onStepChange(i)}
              disabled={isFuture}
              className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                isActive
                  ? "border-[var(--undp-blue)] bg-blue-50 shadow-sm"
                  : isComplete
                    ? "border-emerald-200 bg-emerald-50/50 cursor-pointer hover:border-emerald-300"
                    : "border-line-soft bg-gray-50 opacity-50 cursor-not-allowed"
              }`}
            >
              {/* Top bar indicator */}
              <div
                className={`absolute top-0 left-3 right-3 h-0.5 rounded-b ${
                  isActive
                    ? "bg-[var(--undp-blue)]"
                    : isComplete
                      ? "bg-emerald-400"
                      : "bg-transparent"
                }`}
              />
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isActive
                      ? "bg-[var(--undp-blue)] text-white"
                      : isComplete
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-200 text-gray-400"
                  }`}
                >
                  {isComplete ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-caption font-medium truncate ${
                      isActive
                        ? "text-[var(--undp-blue)]"
                        : isComplete
                          ? "text-emerald-700"
                          : "text-gray-400"
                    }`}
                  >
                    {label}
                  </p>
                  <p className="text-caption text-gray-400">
                    {t("stepCount", { n: i + 1 })}
                  </p>
                </div>
              </div>
              {/* Extraction pending badge */}
              {i === 0 && hasExtractionPending && currentStep !== 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-400 rounded-full border-2 border-white" />
              )}
            </button>
          );
        })}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={() => onStepChange(currentStep - 1)}
          disabled={currentStep === 0}
          className={`px-4 py-2 text-body rounded-lg border transition-colors flex items-center gap-1.5 ${
            currentStep === 0
              ? "border-line-soft text-gray-300 cursor-not-allowed"
              : "border-line-strong text-[var(--undp-gray)] hover:border-gray-400 hover:text-[var(--undp-black)]"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t("back")}
        </button>

        {currentStep < STEP_KEYS.length - 1 ? (
          <button
            type="button"
            onClick={() => onStepChange(currentStep + 1)}
            disabled={!canProceed}
            className={`px-5 py-2 text-body rounded-lg transition-colors flex items-center gap-1.5 font-medium ${
              canProceed
                ? "bg-[var(--undp-blue)] text-white hover:bg-[var(--undp-blue)]/90 shadow-sm"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {t("next")}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <div className="w-[88px]" />
        )}
      </div>
    </div>
  );
}
