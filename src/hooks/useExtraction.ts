import { useState, useCallback } from "react";
import type { PolicyDocumentType } from "@/types";
import type { ExtractedItem } from "@/lib/upload-helpers";

export function useExtraction() {
  const [extracting, setExtracting] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [extractFileName, setExtractFileName] = useState("");
  const [extractDocType, setExtractDocType] = useState<PolicyDocumentType>("SECTORAL");
  const [extractDocLabel, setExtractDocLabel] = useState("");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractManualLabel, setExtractManualLabel] = useState("");
  const [extractManualText, setExtractManualText] = useState("");

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

      try {
        const res = await fetch("/api/extract", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Extraction failed");
        }
        const data = await res.json();
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
    []
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
