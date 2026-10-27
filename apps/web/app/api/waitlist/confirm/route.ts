/**
 * POST /api/waitlist/confirm: the button on the confirm page sends the token
 * from the e-mail (JSON body). No GET: link scanners in mail systems open
 * links and must not complete the double opt-in for anybody.
 */
import { waitlistDeps } from "@/lib/waitlist/deps";
import { handleConfirm } from "@/lib/waitlist/handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleConfirm(request, waitlistDeps());
}
