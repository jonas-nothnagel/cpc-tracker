import { useState, useMemo, useCallback } from "react";
import type { CategoryItem } from "@/lib/upload-helpers";
import { NBS_CATEGORIES } from "@/data/nbs-categories";
import { IPCC_SECTORS } from "@/data/sectors";

export function useCategories() {
  const [nbsCategories, setNbsCategories] = useState<CategoryItem[]>(
    NBS_CATEGORIES.map((c) => ({ ...c, enabled: true, isCustom: false }))
  );
  const [sectors, setSectors] = useState<CategoryItem[]>(
    IPCC_SECTORS.map((s) => ({ ...s, enabled: true, isCustom: false }))
  );
  const [showCategories, setShowCategories] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [addingTo, setAddingTo] = useState<"nbs" | "sector" | null>(null);

  const activeNbs = useMemo(() => nbsCategories.filter((c) => c.enabled), [nbsCategories]);
  const activeSectors = useMemo(() => sectors.filter((s) => s.enabled), [sectors]);

  const toggleCategory = useCallback((type: "nbs" | "sector", id: string) => {
    const setter = type === "nbs" ? setNbsCategories : setSectors;
    setter((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  }, []);

  const removeCategory = useCallback((type: "nbs" | "sector", id: string) => {
    const setter = type === "nbs" ? setNbsCategories : setSectors;
    setter((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addCustomCategory = useCallback(() => {
    if (!newCatName.trim() || !addingTo) return;
    const newItem: CategoryItem = {
      id: `custom_${Date.now()}`,
      name: newCatName.trim(),
      description: newCatDesc.trim(),
      enabled: true,
      isCustom: true,
    };
    if (addingTo === "nbs") {
      setNbsCategories((prev) => [...prev, newItem]);
    } else {
      setSectors((prev) => [...prev, newItem]);
    }
    setNewCatName("");
    setNewCatDesc("");
    setAddingTo(null);
  }, [newCatName, newCatDesc, addingTo]);

  return {
    nbsCategories,
    sectors,
    activeNbs,
    activeSectors,
    showCategories,
    setShowCategories,
    newCatName,
    setNewCatName,
    newCatDesc,
    setNewCatDesc,
    addingTo,
    setAddingTo,
    toggleCategory,
    removeCategory,
    addCustomCategory,
  };
}
