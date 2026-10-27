import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { canonicalRedirect } from "./i18n/legacy";
import { routing } from "./i18n/routing";
import { isLocalHost, securityHeaders } from "./lib/security-headers";
import { externalServices, telemetryEnv } from "./lib/telemetry/config";

const intlMiddleware = createMiddleware(routing);

const OPTIONS = {
  dev: process.env.NODE_ENV === "development",
  services: externalServices(telemetryEnv()),
};
const SECURITY_HEADERS = securityHeaders(OPTIONS);
// Same override as localHostHeaderRule() in next.config.ts.
const LOCAL_SECURITY_HEADERS = securityHeaders({ ...OPTIONS, local: true });

/**
 * OpenNext on Cloudflare returns proxy redirects without the next.config
 * `headers()`, so redirects get the security headers here. Other responses
 * get them from next.config.ts; setting them twice would duplicate values.
 */
function withSecurityHeaders(request: NextRequest, response: Response): Response {
  if (response.status >= 300 && response.status < 400) {
    const headers = isLocalHost(request.headers.get("host"))
      ? LOCAL_SECURITY_HEADERS
      : SECURITY_HEADERS;
    for (const { key, value } of headers) response.headers.set(key, value);
  }
  return response;
}

// Next 16 renamed `middleware` to `proxy`. Old tool ids and foreign slugs get
// one permanent redirect to the localized URL first; next-intl then handles
// locale detection (Accept-Language, default "de"; no cookie), localized
// pathnames and redirects.
export default function proxy(request: NextRequest) {
  const target = canonicalRedirect(request.nextUrl.pathname);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return withSecurityHeaders(request, NextResponse.redirect(url, 308));
  }
  return withSecurityHeaders(request, intlMiddleware(request));
}

export const config = {
  // Skip API routes, Next internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
