"use client";

/**
 * Landing hero call-to-action (Option A — primary action + country menu).
 *
 * "Analyse your policies" is the single solid primary: the action that fits
 * every visitor, pilot-country or not. The growing pilot list lives behind one
 * quiet "Explore a pilot country" disclosure that opens a short menu, so the
 * hero never reshapes as countries are added (flat scaling). Country entries
 * are navigation links, so this is a disclosure-of-links rather than an
 * application menu/menuitem widget.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface HeroCtaProps {
  /** Live pilot countries — each links to its dashboard. */
  countries: { id: string; name: string }[];
  /** Countries announced as forthcoming — shown greyed and non-clickable.
   *  Empty today; the section renders only when populated. */
  comingSoon: { name: string }[];
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HeroCta({ countries, comingSoon }: HeroCtaProps) {
  const t = useTranslations("landing");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const labelId = useId();

  // Close on Escape (returning focus to the trigger) or on an outside press.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Move focus to the first country link once the menu opens.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
  }, [open]);

  // Arrow / Home / End roving across the country links while the menu is open.
  const moveFocus = (next: (current: number, count: number) => number) => {
    const links = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("a[href]") ?? [],
    );
    if (links.length === 0) return;
    const current = links.indexOf(document.activeElement as HTMLElement);
    links[next(current, links.length)]?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveFocus((i, n) => (i + 1) % n);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus((i, n) => (i - 1 + n) % n);
        break;
      case "Home":
        e.preventDefault();
        moveFocus(() => 0);
        break;
      case "End":
        e.preventDefault();
        moveFocus((_, n) => n - 1);
        break;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {/* Primary action — the one path that fits every visitor. */}
      <Link
        href="/upload"
        className="inline-flex items-center bg-[var(--undp-blue)] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--undp-blue-dark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {t("hero.analyseCta")}
      </Link>

      {/* Country disclosure — quiet, holds steady whether there are 3 or 30. */}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className="inline-flex items-center gap-2 text-base font-medium text-white underline decoration-white/50 underline-offset-4 transition-colors hover:decoration-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t("hero.exploreMenu")}
          <Chevron open={open} />
        </button>

        {open && (
          <div
            ref={menuRef}
            id={menuId}
            aria-labelledby={labelId}
            onKeyDown={onMenuKeyDown}
            className="absolute top-full left-0 z-20 mt-2 w-72 rounded-lg bg-white p-1.5 text-left shadow-[0_18px_40px_-12px_rgba(15,22,30,0.45)]"
          >
            <p
              id={labelId}
              className="px-3 pb-1.5 pt-2 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-[var(--undp-gray)]"
            >
              {t("hero.pilotCountriesHeader")}
            </p>
            <ul className="list-none">
              {countries.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard?country=${c.id}`}
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-2.5 text-sm font-medium text-[var(--undp-black)] transition-colors hover:bg-[var(--undp-light)] focus:bg-[var(--undp-light)] focus:outline-none"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>

            {comingSoon.length > 0 && (
              <>
                <div className="mx-2 my-1.5 h-px bg-gray-200" />
                <ul className="list-none">
                  {comingSoon.map((c) => (
                    <li
                      key={c.name}
                      className="flex items-center justify-between gap-2.5 px-3 py-2.5 text-sm font-medium text-gray-400"
                    >
                      <span>{c.name}</span>
                      <span className="rounded-full border border-gray-300 px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider text-gray-400">
                        {t("hero.comingSoonTag")}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
