"use client";

import { useState } from "react";
import type { CategoryItem } from "@/lib/upload-helpers";
import type { TaxonomyGroup } from "@/hooks/useCategories";

const COLOR_MAP = {
  blue: { border: "border-blue-200", bg: "bg-blue-50", accent: "text-[var(--undp-blue)]" },
  amber: { border: "border-amber-200", bg: "bg-amber-50", accent: "text-amber-600" },
  gray: { border: "border-gray-200", bg: "bg-gray-50", accent: "text-gray-600" },
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50", accent: "text-emerald-600" },
  violet: { border: "border-violet-200", bg: "bg-violet-50", accent: "text-violet-600" },
};

interface CategoryConfigProps {
  groups: TaxonomyGroup[];
  showCategories: boolean;
  onToggleShow: () => void;
  toggleCategory: (groupId: string, itemId: string) => void;
  removeCategory: (groupId: string, itemId: string) => void;
  toggleAllInGroup: (groupId: string, enable: boolean) => void;
  addingTo: string | null;
  onSetAddingTo: (v: string | null) => void;
  newCatName: string;
  onNewCatNameChange: (v: string) => void;
  newCatDesc: string;
  onNewCatDescChange: (v: string) => void;
  onAddCustomCategory: () => void;
  onAddGroup: (name: string, description: string) => void;
  onRemoveGroup: (groupId: string) => void;
}

export function CategoryConfig({
  groups,
  showCategories,
  onToggleShow,
  toggleCategory,
  removeCategory,
  toggleAllInGroup,
  addingTo,
  onSetAddingTo,
  newCatName,
  onNewCatNameChange,
  newCatDesc,
  onNewCatDescChange,
  onAddCustomCategory,
  onAddGroup,
  onRemoveGroup,
}: CategoryConfigProps) {
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");

  function handleAddGroup() {
    if (!newGroupName.trim()) return;
    onAddGroup(newGroupName.trim(), newGroupDesc.trim());
    setNewGroupName("");
    setNewGroupDesc("");
    setAddingGroup(false);
  }

  return (
    <div>
      <button
        onClick={onToggleShow}
        className="flex items-center gap-2 text-sm font-medium text-[var(--undp-black)] mb-3 hover:text-[var(--undp-blue)] transition-colors w-full py-2"
      >
        <span className="flex-1 text-left">
          {showCategories ? "Hide category details" : "Edit categories"}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform shrink-0 ${showCategories ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {showCategories && (
        <div className="space-y-3">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              toggleCategory={toggleCategory}
              removeCategory={removeCategory}
              toggleAllInGroup={toggleAllInGroup}
              addingTo={addingTo}
              onSetAddingTo={onSetAddingTo}
              newCatName={newCatName}
              onNewCatNameChange={onNewCatNameChange}
              newCatDesc={newCatDesc}
              onNewCatDescChange={onNewCatDescChange}
              onAddCustomCategory={onAddCustomCategory}
              onRemoveGroup={group.isCustomGroup ? onRemoveGroup : undefined}
            />
          ))}

          {/* Add new taxonomy group */}
          {addingGroup ? (
            <div className="border-2 border-dashed border-violet-300 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-[var(--undp-black)]">New Classification Group</p>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name (e.g. SDG Targets, Custom Themes)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)]"
              />
              <input
                type="text"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                placeholder="Brief description of what this group classifies"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)]"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddGroup}
                  disabled={!newGroupName.trim()}
                  className="px-4 py-1.5 bg-[var(--undp-blue)] text-white text-sm rounded-lg disabled:opacity-40"
                >
                  Create group
                </button>
                <button
                  onClick={() => { setAddingGroup(false); setNewGroupName(""); setNewGroupDesc(""); }}
                  className="px-4 py-1.5 text-sm text-[var(--undp-gray)]"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[11px] text-[var(--undp-gray)]">
                After creating the group, use &ldquo;Edit&rdquo; to add individual categories within it.
              </p>
            </div>
          ) : (
            <button
              onClick={() => setAddingGroup(true)}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 text-sm text-[var(--undp-gray)] hover:border-[var(--undp-blue)] hover:text-[var(--undp-blue)] transition-colors"
            >
              + Add new classification group
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GroupCard({
  group,
  toggleCategory,
  removeCategory,
  toggleAllInGroup,
  addingTo,
  onSetAddingTo,
  newCatName,
  onNewCatNameChange,
  newCatDesc,
  onNewCatDescChange,
  onAddCustomCategory,
  onRemoveGroup,
}: {
  group: TaxonomyGroup;
  toggleCategory: (groupId: string, itemId: string) => void;
  removeCategory: (groupId: string, itemId: string) => void;
  toggleAllInGroup: (groupId: string, enable: boolean) => void;
  addingTo: string | null;
  onSetAddingTo: (v: string | null) => void;
  newCatName: string;
  onNewCatNameChange: (v: string) => void;
  newCatDesc: string;
  onNewCatDescChange: (v: string) => void;
  onAddCustomCategory: () => void;
  onRemoveGroup?: (groupId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = group.items.filter((c) => c.enabled).length;
  const allEnabled = activeCount === group.items.length;
  const colors = COLOR_MAP[group.color];

  return (
    <div className={`border rounded-xl overflow-hidden ${activeCount === 0 ? "border-gray-200 opacity-60" : colors.border}`}>
      {/* Header */}
      <div className={`px-4 py-3 ${activeCount > 0 ? colors.bg : "bg-gray-50"}`}>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--undp-black)]">{group.name}</p>
            <p className="text-xs text-[var(--undp-gray)] mt-0.5">
              {group.items.length > 0
                ? `${activeCount} of ${group.items.length} enabled`
                : "No categories yet — click Edit to add"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {group.items.length > 0 && (
              <button
                type="button"
                onClick={() => toggleAllInGroup(group.id, !allEnabled)}
                className="px-2.5 py-1 text-[10px] font-medium rounded border border-gray-300 text-[var(--undp-gray)] hover:bg-white"
              >
                {allEnabled ? "Disable all" : "Enable all"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="px-2.5 py-1 text-[10px] font-medium rounded border border-gray-300 text-[var(--undp-gray)] hover:bg-white"
            >
              {expanded ? "Collapse" : "Edit"}
            </button>
            {onRemoveGroup && (
              <button
                type="button"
                onClick={() => onRemoveGroup(group.id)}
                className="px-2 py-1 text-[10px] text-gray-400 hover:text-red-500"
                title="Remove group"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {group.description && (
          <p className="text-[11px] text-[var(--undp-gray)] mt-1.5 leading-snug">
            {group.description}
          </p>
        )}
      </div>

      {/* Expanded category list */}
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {group.items.map((cat) => (
            <label
              key={cat.id}
              className="flex items-start gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={cat.enabled}
                onChange={() => toggleCategory(group.id, cat.id)}
                className="mt-0.5 rounded border-gray-300 text-[var(--undp-blue)] focus:ring-[var(--undp-blue)]"
              />
              <div className="flex-1 min-w-0">
                <span className={cat.enabled ? "text-[var(--undp-black)]" : "text-gray-400 line-through"}>
                  {cat.name}
                </span>
                {cat.description && (
                  <p className="text-[11px] text-[var(--undp-gray)] mt-0.5 leading-snug">
                    {cat.description}
                  </p>
                )}
                {cat.isCustom && (
                  <button
                    onClick={(e) => { e.preventDefault(); removeCategory(group.id, cat.id); }}
                    className="text-[10px] text-gray-400 hover:text-red-500 mt-0.5"
                  >
                    Remove
                  </button>
                )}
              </div>
            </label>
          ))}

          {/* Add custom category within group */}
          <div className="px-4 py-2.5">
            {addingTo === group.id ? (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <input type="text" value={newCatName} onChange={(e) => onNewCatNameChange(e.target.value)}
                    placeholder="Name" className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[var(--undp-blue)]" />
                </div>
                <div className="flex-1">
                  <input type="text" value={newCatDesc} onChange={(e) => onNewCatDescChange(e.target.value)}
                    placeholder="Description (optional)" className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[var(--undp-blue)]" />
                </div>
                <button onClick={onAddCustomCategory} disabled={!newCatName.trim()}
                  className="px-3 py-1.5 bg-[var(--undp-blue)] text-white text-xs rounded disabled:opacity-40">Add</button>
                <button onClick={() => { onSetAddingTo(null); onNewCatNameChange(""); onNewCatDescChange(""); }}
                  className="px-2 py-1.5 text-xs text-[var(--undp-gray)]">Cancel</button>
              </div>
            ) : (
              <button onClick={() => onSetAddingTo(group.id)} className="text-xs text-[var(--undp-blue)] hover:underline">
                + Add category
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
