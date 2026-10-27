/** GET /api/waitlist/count: whether the waitlist is on and how many confirmed it (cached 60 s). */
import { waitlistDeps } from "@/lib/waitlist/deps";
import { handleCount } from "@/lib/waitlist/handlers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleCount(waitlistDeps());
}
