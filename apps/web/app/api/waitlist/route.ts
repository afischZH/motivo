/** POST /api/waitlist: Founders waitlist sign-up (double opt-in). See lib/waitlist/handlers.ts. */
import { waitlistDeps } from "@/lib/waitlist/deps";
import { handleSignup } from "@/lib/waitlist/handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleSignup(request, waitlistDeps());
}
