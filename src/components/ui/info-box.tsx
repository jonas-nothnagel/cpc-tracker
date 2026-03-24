"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";

interface InfoBoxProps {
  children: ReactNode;
}

/**
 * Collapsible info/help popover triggered by an (i) icon.
 * Uses <span> instead of <button> so it can safely nest inside headings
 * that are already within clickable elements.
 * Closes on outside click or Escape.
 */
export function InfoBox({ children }: InfoBoxProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center ml-2 align-middle">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); } }}
        className={`w-5 h-5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center transition-colors cursor-pointer select-none ${
          open
            ? "bg-[var(--undp-blue)] text-white"
            : "bg-gray-200 text-[var(--undp-gray)] hover:bg-[var(--undp-blue)]/10 hover:text-[var(--undp-blue)]"
        }`}
        aria-label="Show explanation"
        aria-expanded={open}
      >
        i
      </span>
      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-40 bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3.5 w-80 text-sm font-normal text-[var(--undp-black)] leading-relaxed"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </span>
  );
}
