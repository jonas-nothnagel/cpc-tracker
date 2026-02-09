"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { PolicyDocumentType } from "@/types";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";

interface TargetRow {
  text: string;
  sourceDocument: PolicyDocumentType;
  sourceLabel: string;
}

const DOCUMENT_TYPES: PolicyDocumentType[] = [
  "NDC",
  "NBSAP",
  "NAP",
  "LDN",
  "SECTORAL",
];

export default function UploadPage() {
  const [country, setCountry] = useState("");
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [currentDoc, setCurrentDoc] = useState<PolicyDocumentType>("NDC");
  const [currentLabel, setCurrentLabel] = useState("");
  const [csvInput, setCsvInput] = useState("");
  const [mode, setMode] = useState<"manual" | "csv">("manual");

  function addTarget() {
    if (!currentText.trim()) return;
    setTargets([
      ...targets,
      {
        text: currentText.trim(),
        sourceDocument: currentDoc,
        sourceLabel: currentLabel.trim() || `Target ${targets.length + 1}`,
      },
    ]);
    setCurrentText("");
    setCurrentLabel("");
  }

  function removeTarget(index: number) {
    setTargets(targets.filter((_, i) => i !== index));
  }

  function parseCsv() {
    const lines = csvInput
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: TargetRow[] = [];
    for (const line of lines) {
      // Expected: source_document, label, target_text
      const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
      if (parts.length >= 3) {
        const doc = parts[0].toUpperCase() as PolicyDocumentType;
        parsed.push({
          sourceDocument: DOCUMENT_TYPES.includes(doc) ? doc : "OTHER",
          sourceLabel: parts[1],
          text: parts.slice(2).join(", "),
        });
      }
    }
    if (parsed.length > 0) {
      setTargets([...targets, ...parsed]);
      setCsvInput("");
    }
  }

  async function runAnalysis() {
    // TODO: Call API endpoint
    alert(
      `Analysis would run for ${targets.length} targets from ${country || "Unknown Country"}.\n\nAPI endpoint not yet connected — see /api/analyze route.`
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 sticky top-0 bg-white z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Image
                src="/undp-logo.png"
                alt="UNDP"
                width={40}
                height={64}
                className="h-10 w-auto"
              />
            </Link>
            <div className="border-l border-gray-200 pl-4">
              <p className="text-sm font-medium text-[var(--undp-black)]">
                Policy Coherence Tracker
              </p>
              <p className="text-xs text-[var(--undp-gray)]">Upload Targets</p>
            </div>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/dashboard"
              className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/"
              className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors"
            >
              ← Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-8 w-full">
        <h1 className="text-2xl font-semibold text-[var(--undp-black)] mb-2">
          Upload Policy Targets
        </h1>
        <p className="text-sm text-[var(--undp-gray)] mb-8">
          Enter your national policy targets below. Once submitted, the AI
          pipeline will classify them against NBS categories, cross-cutting
          themes, and assess pairwise alignment.
        </p>

        {/* Country */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-[var(--undp-black)] mb-1">
            Country
          </label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="e.g. Mongolia"
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-[var(--undp-blue)] focus:ring-1 focus:ring-[var(--undp-blue)]"
          />
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode("manual")}
            className={`px-4 py-2 text-sm rounded border transition-colors ${
              mode === "manual"
                ? "bg-[var(--undp-blue)] text-white border-transparent"
                : "border-gray-300 text-[var(--undp-gray)] hover:border-gray-400"
            }`}
          >
            Manual Entry
          </button>
          <button
            onClick={() => setMode("csv")}
            className={`px-4 py-2 text-sm rounded border transition-colors ${
              mode === "csv"
                ? "bg-[var(--undp-blue)] text-white border-transparent"
                : "border-gray-300 text-[var(--undp-gray)] hover:border-gray-400"
            }`}
          >
            Paste CSV
          </button>
        </div>

        {/* Manual entry */}
        {mode === "manual" && (
          <div className="border border-gray-200 rounded-lg p-6 mb-6">
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
                  Source Document
                </label>
                <select
                  value={currentDoc}
                  onChange={(e) =>
                    setCurrentDoc(e.target.value as PolicyDocumentType)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                >
                  {DOCUMENT_TYPES.map((d) => (
                    <option key={d} value={d}>
                      {DOC_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={currentLabel}
                  onChange={(e) => setCurrentLabel(e.target.value)}
                  placeholder="e.g. Biodiversity 1"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-[var(--undp-blue)]"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
                Target Text
              </label>
              <textarea
                value={currentText}
                onChange={(e) => setCurrentText(e.target.value)}
                placeholder="Paste or type the full target text..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-[var(--undp-blue)] resize-y"
              />
            </div>
            <button
              onClick={addTarget}
              disabled={!currentText.trim()}
              className="px-4 py-2 bg-[var(--undp-blue)] text-white text-sm rounded hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Add Target
            </button>
          </div>
        )}

        {/* CSV paste */}
        {mode === "csv" && (
          <div className="border border-gray-200 rounded-lg p-6 mb-6">
            <p className="text-xs text-[var(--undp-gray)] mb-3">
              Format: <code className="bg-gray-100 px-1 rounded">source_document, label, target_text</code> — one per line.
              <br />
              Example: <code className="bg-gray-100 px-1 rounded">NDC, Forests 1, Protect natural forests and enhance regeneration capacity</code>
            </p>
            <textarea
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              placeholder={`NDC, Forests 1, Protect natural forests and enhance regeneration capacity\nNAP, Target 1, Enhance policies to support climate change adaptation`}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:border-[var(--undp-blue)] resize-y mb-4"
            />
            <button
              onClick={parseCsv}
              disabled={!csvInput.trim()}
              className="px-4 py-2 bg-[var(--undp-blue)] text-white text-sm rounded hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Parse & Add Targets
            </button>
          </div>
        )}

        {/* Targets list */}
        {targets.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--undp-black)]">
                Targets ({targets.length})
              </h2>
              <button
                onClick={runAnalysis}
                className="px-6 py-2.5 bg-[var(--undp-blue)] text-white text-sm font-medium rounded hover:bg-[var(--undp-blue-dark)] transition-colors"
              >
                Run Analysis →
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-medium text-[var(--undp-gray)] w-36">
                      Source
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-[var(--undp-gray)]">
                      Target
                    </th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="px-4 py-2.5 align-top">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                          style={{
                            backgroundColor:
                              DOC_COLORS[t.sourceDocument] ?? "#a9b1b7",
                          }}
                        >
                          {t.sourceLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--undp-black)] leading-relaxed">
                        {t.text}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => removeTarget(i)}
                          className="text-[var(--undp-gray)] hover:text-[var(--undp-red)] transition-colors text-lg"
                          title="Remove"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {targets.length === 0 && (
          <div className="text-center py-16 text-[var(--undp-gray)]">
            <p className="text-lg mb-2">No targets added yet</p>
            <p className="text-sm">
              Use manual entry or paste CSV above to add policy targets for
              analysis.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-sm text-[var(--undp-gray)]">
          United Nations Development Programme · CPC Tracker Prototype
        </div>
      </footer>
    </div>
  );
}

