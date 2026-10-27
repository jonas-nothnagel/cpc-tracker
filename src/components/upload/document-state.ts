"use client";

import { useTranslations } from "next-intl";
import type { DraftDocument } from "@/lib/upload/types";

/** A document's state in words, as its row and the builder column say it. */
export function useDocumentState(): (doc: DraftDocument) => string {
  const t = useTranslations("upload.documents.state");
  return (doc) => {
    switch (doc.state) {
      case "added":
        return t("added");
      case "queued":
        return t("queued");
      case "reading":
        return doc.part && doc.parts ? t("readingPart", { part: doc.part, parts: doc.parts }) : t("reading");
      case "noText":
        return t("noText");
      case "failed":
        return t("failed");
      default: {
        const count = doc.targets.filter((x) => !x.removed).length;
        return doc.emptyPages && doc.pages
          ? t("partial", { count, empty: doc.emptyPages, pages: doc.pages })
          : t("read", { count });
      }
    }
  };
}
