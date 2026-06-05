import { defineRouting } from "next-intl/routing";

// Single source of truth for supported locales. Add new locales here as
// translation files (`messages/<code>.json`) are completed; everything else
// (middleware matcher, language switcher visibility, generateStaticParams)
// derives from this list automatically.
export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  // 'always' keeps URLs explicit (`/en/...`) so additional locales are purely
  // additive when they ship — existing English URLs never change shape.
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
