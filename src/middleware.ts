import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images.
     * This ensures the auth session is refreshed on every navigation.
     *
     * `ico` is in the extension list, not just the literal favicon.ico:
     * without it, any icon served under a different name (e.g. a
     * cache-busted favicon-v6.ico) fell through to auth and answered a
     * logged-out browser with a 307 to /login instead of an image.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
