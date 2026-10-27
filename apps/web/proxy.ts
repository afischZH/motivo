import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { canonicalRedirect } from "./i18n/legacy";
import { routing } from "./i18n/routing";
import { securityHeaders } from "./lib/security-headers";

const intlMiddleware = createMiddleware(routing);

const SECURITY_HEADERS = securityHeaders({ dev: process.env.NODE_ENV === "development" });

/**
 * OpenNext on Cloudflare returns proxy redirects without the next.config
 * `headers()`, so redirects get the security headers here. Other responses
 * get them from next.config.ts; setting them twice would duplicate values.
 */
function withSecurityHeaders(response: Response): Response {
  if (response.status >= 300 && response.status < 400) {
    for (const { key, value } of SECURITY_HEADERS) response.headers.set(key, value);
  }
  return response;
}

// Next 16 renamed `middleware` to `proxy`. Old tool ids and foreign slugs get
// one permanent redirect to the localized URL first; next-intl then handles
// locale detection (cookie, then Accept-Language, default "de"), localized
// pathnames and redirects.
export default function proxy(request: NextRequest) {
  const target = canonicalRedirect(request.nextUrl.pathname);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return withSecurityHeaders(NextResponse.redirect(url, 308));
  }
  return withSecurityHeaders(intlMiddleware(request));
}

export const config = {
  // Skip API routes, Next internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
