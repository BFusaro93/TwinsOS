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
    pathname.startsWith("/help/") || // public, indexable product guides
    pathname === "/compare" ||
    pathname.startsWith("/compare/") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/llms.txt";

  // A client-portal login is an ordinary Supabase user, so the signed-in check
  // below passes for them and nothing else stopped a customer from opening the
  // staff app. RLS still holds — they only ever saw their OWN client's rows —
  // but the shell rendered and populated, and because the identity in the
  // client-side store is whatever was cached, it could show a staff name and
  // "Admin" beside a customer's data. Signing into the portal in a browser
  // already signed into the CRM is exactly how that happens.
  //
  // Portal users have no profiles row (that is what every CRM RLS policy keys
  // on), so one indexed primary-key lookup separates them from staff. Only
  // done for staff areas, so the portal and public pages pay nothing.
  // Every URL the staff app serves — the (crm), (dashboard), (home),
  // (photos), (reports), (settings) and (tools) route groups, plus /internal.
  // The customer's own surface is /portal, which is deliberately absent.
  const STAFF_PREFIXES = [
    "/crm", "/settings", "/dashboards", "/home", "/photos", "/tools",
    "/equipt", "/cmms", "/po", "/vendors", "/operations", "/docs",
    "/support", "/internal",
  ];
  const isStaffArea = STAFF_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (user && isStaffArea) {
    const { data: staffProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!staffProfile) {
      const portalUrl = request.nextUrl.clone();
      portalUrl.pathname = "/portal";
      portalUrl.search = "";
      return NextResponse.redirect(portalUrl);
    }
  }

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
