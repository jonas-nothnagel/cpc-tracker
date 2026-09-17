import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

// Conservative CSP. `'unsafe-inline'` is required for Next's inline hydration
// scripts and Tailwind styles (a nonce-based CSP is a future hardening); dev
// additionally needs `'unsafe-eval'` and a websocket for HMR/Turbopack.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Only takes effect over HTTPS; browsers ignore it on plain-http dev responses.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// For files this app frames itself (see headers() below): same origin may
// embed them, nobody else.
const framedFileHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy.replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The "How it works" page (src/app/[locale]/methodology) shows the
      // walkthrough from public/ in a same-origin iframe. The strict defaults
      // above forbid framing outright, so these files get a same-origin
      // exception; a later rule overrides the earlier one for the same key.
      // Only the files that are framed are listed: the printable brief opens
      // in a new tab and keeps the defaults.
      { source: "/:file(methodology-experience.*\\.html)", headers: framedFileHeaders },
    ];
  },
};

export default withNextIntl(nextConfig);
