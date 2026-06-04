import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Next 16 renamed `middleware.ts` to `proxy.ts`. Behavior is unchanged: the
// matcher excludes API routes, Next internals, Vercel internals, and any path
// containing a dot (static files like /undp-logo.png) so they are never
// locale-prefixed.
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
