import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { canonicalRedirect } from "./i18n/legacy";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Next 16 renamed `middleware` to `proxy`. Old tool ids and foreign slugs get
// one permanent redirect to the localized URL first; next-intl then handles
// locale detection (cookie, then Accept-Language, default "de"), localized
// pathnames and redirects.
export default function proxy(request: NextRequest) {
  const target = canonicalRedirect(request.nextUrl.pathname);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 308);
  }
  return intlMiddleware(request);
}

export const config = {
  // Skip API routes, Next internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
