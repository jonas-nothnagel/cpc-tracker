import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation primitives. Use these in place of `next/link` /
// `next/navigation` so internal links automatically carry the active locale
// segment.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
