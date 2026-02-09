import type {
  Target,
  ThematicClassification,
  PolicyDocumentType,
} from "@/types";

/** Color palette for policy document types — UNDP-adjacent palette */
export const DOC_COLORS: Record<PolicyDocumentType, string> = {
  NDC: "#0468b1",    // UNDP blue
  NBSAP: "#59ba47",  // UNDP green
  NAP: "#ffbc00",    // UNDP yellow
  LDN: "#ee402d",    // UNDP red
  SECTORAL: "#6b7280",
  OTHER: "#a9b1b7",
};

/** Shorter labels for chart axes */
export const DOC_LABELS: Record<PolicyDocumentType, string> = {
  NDC: "NDC",
  NBSAP: "NBT",
  NAP: "NAP",
  LDN: "LDN",
  SECTORAL: "Sectoral",
  OTHER: "Other",
};

/**
 * Count how many targets are classified under each category,
 * broken down by source document type.
 */
export function countByCategory(
  targets: Target[],
  classifications: ThematicClassification[],
  categories: { id: string; name: string }[]
): {
  categoryId: string;
  categoryName: string;
  total: number;
  byDocument: Record<PolicyDocumentType, number>;
}[] {
  const targetMap = new Map(targets.map((t) => [t.id, t]));

  return categories.map((cat) => {
    const relevant = classifications.filter(
      (c) => c.categoryId === cat.id && c.isRelevant
    );
    const byDoc: Record<PolicyDocumentType, number> = {
      NDC: 0,
      NBSAP: 0,
      NAP: 0,
      LDN: 0,
      SECTORAL: 0,
      OTHER: 0,
    };
    for (const c of relevant) {
      const target = targetMap.get(c.targetId);
      if (target) byDoc[target.sourceDocument]++;
    }
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      total: relevant.length,
      byDocument: byDoc,
    };
  });
}

