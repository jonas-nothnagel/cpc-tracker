import { useState, useCallback } from "react";
import { useLocale } from "next-intl";
import type { PolicyDocumentType } from "@/types";
import type { ExtractedItem } from "@/lib/upload-helpers";

interface ExtractionFootprint {
  energy_wh: number;
  water_ml: number;
  co2_geq: number;
  minerals_ugsbeq: number;
  call_count: number;
  tracked_call_count: number;
  cached_call_count: number;
}

const EMPTY_FOOTPRINT: ExtractionFootprint = {
  energy_wh: 0,
  water_ml: 0,
  co2_geq: 0,
  minerals_ugsbeq: 0,
  call_count: 0,
  tracked_call_count: 0,
  cached_call_count: 0,
};

export function useExtraction() {
  const locale = useLocale();
  const [extracting, setExtracting] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [extractFileName, setExtractFileName] = useState("");
  const [extractDocType, setExtractDocType] = useState<PolicyDocumentType>("SECTORAL");
  const [extractDocLabel, setExtractDocLabel] = useState("");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractManualLabel, setExtractManualLabel] = useState("");
  const [extractManualText, setExtractManualText] = useState("");

  // Accumulated environmental footprint across all extractions in this session.
  // Threaded into /api/analyze so the final analysis footprint includes
  // document extraction cost.
  const [extractionFootprint, setExtractionFootprint] =
    useState<ExtractionFootprint>(EMPTY_FOOTPRINT);

  // Multi-file queue
  const [extractionQueue, setExtractionQueue] = useState<File[]>([]);

  const handleDocExtract = useCallback(
    async (file: File, docType: PolicyDocumentType, sourceDocument: string) => {
      setExtracting(true);
      setExtractError(null);
      setExtractedItems([]);
      setExtractFileName(file.name);

      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      form.append("sourceDocument", sourceDocument);
      form.append("locale", locale);

      try {
        const res = await fetch("/api/extract", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Extraction failed");
        }
        const data = await res.json();
        // Accumulate extraction footprint from this run into the session total
        if (data.footprint && typeof data.footprint === "object") {
          const fp = data.footprint as Partial<ExtractionFootprint>;
          setExtractionFootprint((prev) => ({
            energy_wh: prev.energy_wh + (fp.energy_wh ?? 0),
            water_ml: prev.water_ml + (fp.water_ml ?? 0),
            co2_geq: prev.co2_geq + (fp.co2_geq ?? 0),
            minerals_ugsbeq:
              prev.minerals_ugsbeq + (fp.minerals_ugsbeq ?? 0),
            call_count: prev.call_count + (fp.call_count ?? 0),
            tracked_call_count:
              prev.tracked_call_count + (fp.tracked_call_count ?? 0),
            cached_call_count:
              prev.cached_call_count + (fp.cached_call_count ?? 0),
          }));
        }
        const rawItems = data.items || [];
        const items: ExtractedItem[] = rawItems.map(
          (item: {
            text: string;
            label: string;
            sourceDocument: string;
            pageNumbers?: number[];
            language?: string;
            text_eng?: string;
            label_eng?: string;
          }) => ({
            text: item.text,
            label: item.label,
            sourceDocument: item.sourceDocument,
            accepted: true,
            pageNumbers: item.pageNumbers,
            language: item.language,
            text_eng: item.text_eng,
            label_eng: item.label_eng,
          })
        );
        setExtractedItems(items);
      } catch (err) {
        setExtractError(err instanceof Error ? err.message : "Extraction failed");
      } finally {
        setExtracting(false);
      }
    },
    [locale]
  );

  const queueFilesForExtraction = useCallback(
    (files: File[], docType: PolicyDocumentType, sourceDocument: string) => {
      if (files.length === 0) return;
      if (files.length === 1) {
        handleDocExtract(files[0], docType, sourceDocument);
        return;
      }
      // Process first file immediately, queue the rest
      handleDocExtract(files[0], docType, sourceDocument);
      setExtractionQueue(files.slice(1));
    },
    [handleDocExtract]
  );

  const processNextInQueue = useCallback(
    (docType: PolicyDocumentType, sourceDocument: string) => {
      if (extractionQueue.length === 0) return;
      const [next, ...rest] = extractionQueue;
      setExtractionQueue(rest);
      handleDocExtract(next, docType, sourceDocument);
    },
    [extractionQueue, handleDocExtract]
  );

  const toggleItem = useCallback((idx: number) => {
    setExtractedItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, accepted: !it.accepted } : it))
    );
  }, []);

  const keepAll = useCallback(() => {
    setExtractedItems((prev) => prev.map((i) => ({ ...i, accepted: true })));
  }, []);

  const removeAll = useCallback(() => {
    setExtractedItems((prev) => prev.map((i) => ({ ...i, accepted: false })));
  }, []);

  const updateItem = useCallback(
    (idx: number, changes: Partial<ExtractedItem>) => {
      setExtractedItems((prev) =>
        prev.map((it, i) => (i === idx ? { ...it, ...changes } : it))
      );
    },
    []
  );

  const addManualExtractedItem = useCallback(() => {
    if (!extractManualText.trim()) return;
    const acceptedCount = extractedItems.filter((i) => i.accepted).length;
    setExtractedItems((prev) => [
      ...prev,
      {
        text: extractManualText.trim(),
        label: extractManualLabel.trim() || `Target ${acceptedCount + 1}`,
        sourceDocument: extractDocType,
        accepted: true,
      },
    ]);
    setExtractManualLabel("");
    setExtractManualText("");
  }, [extractManualText, extractManualLabel, extractDocType, extractedItems]);

  const discardExtraction = useCallback(() => {
    setExtractedItems([]);
    setExtractFileName("");
  }, []);

  const restoreFromBackup = useCallback(
    (backup: {
      items: ExtractedItem[];
      fileName: string;
      docLabel: string;
    }) => {
      setExtractedItems(backup.items);
      setExtractFileName(backup.fileName);
      setExtractDocLabel(backup.docLabel);
    },
    []
  );

  return {
    extracting,
    extractedItems,
    extractFileName,
    extractDocType,
    setExtractDocType,
    extractDocLabel,
    setExtractDocLabel,
    extractError,
    extractManualLabel,
    setExtractManualLabel,
    extractManualText,
    setExtractManualText,
    extractionQueue,
    extractionFootprint,
    handleDocExtract,
    queueFilesForExtraction,
    processNextInQueue,
    toggleItem,
    keepAll,
    removeAll,
    updateItem,
    addManualExtractedItem,
    discardExtraction,
    restoreFromBackup,
  };
}
