"use client";

import type { CategoryItem } from "@/lib/upload-helpers";
import { CROSS_CUTTING_THEMES_COUNT } from "@/lib/upload-helpers";

interface CategoryConfigProps {
  nbsCategories: CategoryItem[];
  sectors: CategoryItem[];
  activeNbs: CategoryItem[];
  activeSectors: CategoryItem[];
  showCategories: boolean;
  onToggleShow: () => void;
  toggleCategory: (type: "nbs" | "sector", id: string) => void;
  removeCategory: (type: "nbs" | "sector", id: string) => void;
  addingTo: "nbs" | "sector" | null;
  onSetAddingTo: (v: "nbs" | "sector" | null) => void;
  newCatName: string;
  onNewCatNameChange: (v: string) => void;
  newCatDesc: string;
  onNewCatDescChange: (v: string) => void;
  onAddCustomCategory: () => void;
}

function CategoryList({
  items,
  type,
  toggleCategory,
  removeCategory,
}: {
  items: CategoryItem[];
  type: "nbs" | "sector";
  toggleCategory: (type: "nbs" | "sector", id: string) => void;
  removeCategory: (type: "nbs" | "sector", id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((cat) => (
        <label
          key={cat.id}
          className="flex items-start gap-3 text-sm cursor-pointer group"
        >
          <input
            type="checkbox"
            checked={cat.enabled}
            onChange={() => toggleCategory(type, cat.id)}
            className="mt-0.5 rounded border-gray-300 text-[var(--undp-blue)] focus:ring-[var(--undp-blue)]"
          />
          <div className="flex-1 min-w-0">
            <span
              className={
                cat.enabled
                  ? "text-[var(--undp-black)]"
                  : "text-gray-400 line-through"
              }
            >
              {cat.name}
            </span>
            {cat.isCustom && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  removeCategory(type, cat.id);
                }}
                className="ml-2 text-xs text-gray-400 hover:text-[var(--undp-red)]"
              >
                remove
              </button>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}

function AddCategoryForm({
  type,
  addingTo,
  onSetAddingTo,
  newCatName,
  onNewCatNameChange,
  newCatDesc,
  onNewCatDescChange,
  onAdd,
  label,
}: {
  type: "nbs" | "sector";
  addingTo: "nbs" | "sector" | null;
  onSetAddingTo: (v: "nbs" | "sector" | null) => void;
  newCatName: string;
  onNewCatNameChange: (v: string) => void;
  newCatDesc: string;
  onNewCatDescChange: (v: string) => void;
  onAdd: () => void;
  label: string;
}) {
  if (addingTo === type) {
    return (
      <div className="mt-3 flex gap-2 items-end">
        <div className="flex-1">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => onNewCatNameChange(e.target.value)}
            placeholder={type === "nbs" ? "Category name" : "Sector name"}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
          />
        </div>
        <div className="flex-1">
          <input
            type="text"
            value={newCatDesc}
            onChange={(e) => onNewCatDescChange(e.target.value)}
            placeholder="Brief description (optional)"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
          />
        </div>
        <button
          onClick={onAdd}
          disabled={!newCatName.trim()}
          className="px-3 py-1.5 bg-[var(--undp-blue)] text-white text-sm rounded-md disabled:opacity-40"
        >
          Add
        </button>
        <button
          onClick={() => {
            onSetAddingTo(null);
            onNewCatNameChange("");
            onNewCatDescChange("");
          }}
          className="px-3 py-1.5 text-sm text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => onSetAddingTo(type)}
      className="mt-3 text-xs text-[var(--undp-blue)] hover:underline"
    >
      + {label}
    </button>
  );
}

export function CategoryConfig({
  nbsCategories,
  sectors,
  activeNbs,
  activeSectors,
  showCategories,
  onToggleShow,
  toggleCategory,
  removeCategory,
  addingTo,
  onSetAddingTo,
  newCatName,
  onNewCatNameChange,
  newCatDesc,
  onNewCatDescChange,
  onAddCustomCategory,
}: CategoryConfigProps) {
  return (
    <div className="mb-8">
      <button
        onClick={onToggleShow}
        className="flex items-center gap-2 text-sm font-medium text-[var(--undp-black)] mb-3 hover:text-[var(--undp-blue)] transition-colors w-full"
      >
        <span className="flex-1 text-left">Analysis configuration</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform shrink-0 ${showCategories ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {!showCategories && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-xs text-[var(--undp-gray)]">
            {activeNbs.length} NBS categories
          </span>
          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-xs text-[var(--undp-gray)]">
            {activeSectors.length} IPCC sectors
          </span>
          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-xs text-[var(--undp-gray)]">
            {CROSS_CUTTING_THEMES_COUNT} themes
          </span>
        </div>
      )}

      {showCategories && (
        <div className="bg-[var(--undp-light)] rounded-lg p-6 space-y-6">
          <p className="text-xs text-[var(--undp-gray)] leading-relaxed">
            Each target will be classified against every enabled NBS
            category, IPCC sector, and {CROSS_CUTTING_THEMES_COUNT} cross-cutting themes.
            You can disable NBS/sector categories or add custom ones.
          </p>

          {/* NBS Categories */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-3">
              Nature-Based Solutions Categories ({activeNbs.length} active)
            </h3>
            <CategoryList items={nbsCategories} type="nbs" toggleCategory={toggleCategory} removeCategory={removeCategory} />
            <AddCategoryForm
              type="nbs"
              addingTo={addingTo}
              onSetAddingTo={onSetAddingTo}
              newCatName={newCatName}
              onNewCatNameChange={onNewCatNameChange}
              newCatDesc={newCatDesc}
              onNewCatDescChange={onNewCatDescChange}
              onAdd={onAddCustomCategory}
              label="Add custom NBS category"
            />
          </div>

          {/* IPCC Sectors */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-3">
              IPCC Sectors ({activeSectors.length} active)
            </h3>
            <CategoryList items={sectors} type="sector" toggleCategory={toggleCategory} removeCategory={removeCategory} />
            <AddCategoryForm
              type="sector"
              addingTo={addingTo}
              onSetAddingTo={onSetAddingTo}
              newCatName={newCatName}
              onNewCatNameChange={onNewCatNameChange}
              newCatDesc={newCatDesc}
              onNewCatDescChange={onNewCatDescChange}
              onAdd={onAddCustomCategory}
              label="Add custom sector"
            />
          </div>
        </div>
      )}
    </div>
  );
}
