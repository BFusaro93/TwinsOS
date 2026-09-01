import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";

/**
 * Refreshes the Supabase auth session on every request and handles redirects
 * for unauthenticated users trying to access protected routes.
 *
 * Call this from src/middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not add any logic between createServerClient and getUser().
  // A simple mistake could make sessions hard to debug.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") || // invite & password-reset links
    pathname.startsWith("/confirm") || // email confirmation / auth token handler
    pathname === "/request" ||
    pathname.startsWith("/request/") || // public maintenance request portal
    pathname.startsWith("/proposal/") || // public estimate/proposal acceptance link
    pathname.startsWith("/invoice/") || // public "view invoice online" / pay-without-login link
    pathname.startsWith("/legal") || // public privacy policy / SMS terms pages
    pathname.startsWith("/forms/") || // public form submission pages (iframe-embeddable)
    pathname.startsWith("/portal/login") || // client portal login
    pathname.startsWith("/portal/register") || // client portal registration
    pathname.startsWith("/api/") || // all API routes handle their own auth
    pathname.startsWith("/.well-known/") || // OAuth discovery metadata, fetched pre-login
    pathname === "/" ||
    pathname === "/pricing" || // public marketing pages
    pathname === "/features" ||
    pathname.startsWith("/features/") ||
    pathname === "/integrations" ||
    pathname === "/contact" ||
    pathname === "/help" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/llms.txt";

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    // Preserve the query string (e.g. `?open=<ticketId>` on an emailed link)
    // — using `pathname` alone here used to drop it, sending a signed-out
    // user who clicked a deep link straight past their destination.
    const target = pathname + request.nextUrl.search;
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("redirectTo", target);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
