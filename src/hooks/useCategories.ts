import { useState, useMemo, useCallback } from "react";
import type { CategoryItem } from "@/lib/upload-helpers";
import { NBS_CATEGORIES } from "@/data/nbs-categories";
import { IPCC_SECTORS } from "@/data/sectors";
import { GLOBE_CATEGORIES } from "@/data/globe-categories";

export interface TaxonomyGroup {
  id: string;
  name: string;
  description: string;
  color: "blue" | "amber" | "gray" | "emerald" | "violet";
  items: CategoryItem[];
  isCustomGroup: boolean;
}

export function useCategories() {
  const [groups, setGroups] = useState<TaxonomyGroup[]>([
    {
      id: "nbs",
      name: "Nature-Based Solutions",
      description: "Classify targets against NBS intervention types (forests, wetlands, agriculture, etc.)",
      color: "blue",
      items: NBS_CATEGORIES.map((c) => ({ ...c, enabled: true, isCustom: false })),
      isCustomGroup: false,
    },
    {
      id: "sector",
      name: "Climate Mitigation Taxonomy",
      description: "Match targets to IPCC emissions sectors (energy, transport, agriculture, etc.)",
      color: "amber",
      items: IPCC_SECTORS.map((s) => ({ ...s, enabled: true, isCustom: false })),
      isCustomGroup: false,
    },
    {
      id: "globe",
      name: "Biodiversity Taxonomy",
      description: "BIOFIN's GLOBE Biodiversity Expenditure Taxonomy for cross-level analysis",
      color: "emerald",
      items: GLOBE_CATEGORIES.map((c) => ({ ...c, enabled: true, isCustom: false })),
      isCustomGroup: false,
    },
  ]);

  const [showCategories, setShowCategories] = useState(true);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [addingTo, setAddingTo] = useState<string | null>(null);

  // Derived — keep backward-compatible accessors
  const nbsGroup = groups.find((g) => g.id === "nbs")!;
  const sectorGroup = groups.find((g) => g.id === "sector")!;

  const nbsCategories = nbsGroup.items;
  const sectors = sectorGroup.items;
  const activeNbs = useMemo(() => nbsCategories.filter((c) => c.enabled), [nbsCategories]);
  const activeSectors = useMemo(() => sectors.filter((s) => s.enabled), [sectors]);

  const toggleCategory = useCallback((groupId: string, itemId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, items: g.items.map((c) => (c.id === itemId ? { ...c, enabled: !c.enabled } : c)) }
          : g
      )
    );
  }, []);

  // Backward-compatible overload: type "nbs"/"sector" maps to group id
  const toggleCategoryCompat = useCallback((type: string, id: string) => {
    toggleCategory(type, id);
  }, [toggleCategory]);

  const removeCategory = useCallback((groupId: string, itemId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, items: g.items.filter((c) => c.id !== itemId) }
          : g
      )
    );
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
    setGroups((prev) =>
      prev.map((g) =>
        g.id === addingTo ? { ...g, items: [...g.items, newItem] } : g
      )
    );
    setNewCatName("");
    setNewCatDesc("");
    setAddingTo(null);
  }, [newCatName, newCatDesc, addingTo]);

  const toggleAllInGroup = useCallback((groupId: string, enable: boolean) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, items: g.items.map((c) => ({ ...c, enabled: enable })) }
          : g
      )
    );
  }, []);

  const addGroup = useCallback((name: string, description: string) => {
    const id = `custom_group_${Date.now()}`;
    setGroups((prev) => [
      ...prev,
      {
        id,
        name,
        description,
        color: "violet" as const,
        items: [],
        isCustomGroup: true,
      },
    ]);
    return id;
  }, []);

  const removeGroup = useCallback((groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  return {
    groups,
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
    toggleCategory: toggleCategoryCompat,
    removeCategory,
    addCustomCategory,
    toggleAllInGroup,
    addGroup,
    removeGroup,
  };
}
