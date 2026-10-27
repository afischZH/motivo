/**
 * POST /api/waitlist/unsubscribe: from the unsubscribe page (JSON body) and
 * as RFC 8058 one-click endpoint of the e-mail's List-Unsubscribe header
 * (token in the query). No GET: link scanners must not unsubscribe anybody.
 */
import { waitlistDeps } from "@/lib/waitlist/deps";
import { handleUnsubscribe } from "@/lib/waitlist/handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleUnsubscribe(request, waitlistDeps());
}
