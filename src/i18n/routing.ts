import { defineRouting } from "next-intl/routing";

// Single source of truth for supported locales. Add new locales here as
// translation files (`messages/<code>.json`) are completed; everything else
// (middleware matcher, language switcher visibility, generateStaticParams)
// derives from this list automatically.
export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  // 'as-needed' keeps existing English URLs bare (`/dashboard`, `/panama`); only
  // non-default locales carry a prefix (`/es/...`). Bare `/` serves English
  // directly with no redirect, so current Azure links and bookmarks keep working.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
