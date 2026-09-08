import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

// Serves the favicon per browser: the brand's dark green tile to Chromium
// and Firefox, a white tile to Safari.
//
// Safari's tab strip and Favorites bar draw a light contrast outline around
// any favicon too dark to read against the dark tab bar. Measured edge
// luminance against a ~50 tab bar: the green tile sits at 66 (icons that
// render clean are far above — Amazon 124, AmEx 109), the white tile at 255.
// A static <link> can't serve one file to Safari and another to Chrome, so
// the branch has to happen here.
//
// Reads bytes rather than redirecting so a browser never caches a redirect
// to one variant's URL and keeps it after the UA changes.

// UA-dependent, so it must never be statically rendered or cached as one body.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WHITE = "icon-white.ico";
const GREEN = "icon-green.ico";

// Chromium and Firefox both put "Safari" in their UA strings, so real Safari
// is identified by the absence of every other engine's marker rather than by
// the presence of "Safari". Anything unrecognised (or an empty UA) falls
// through to the white tile: it is the variant that is safe everywhere, so an
// unknown client gets a correct-looking icon rather than a possible ring.
function pickVariant(ua: string): string {
  const isChromiumOrFirefox = /(?:Chrome|Chromium|CriOS|Edg|EdgiOS|EdgA|OPR|Firefox|FxiOS)\//.test(ua);
  return isChromiumOrFirefox ? GREEN : WHITE;
}

export async function GET(request: NextRequest) {
  const file = pickVariant(request.headers.get("user-agent") ?? "");

  try {
    const bytes = await readFile(path.join(process.cwd(), "public", file));
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/x-icon",
        // Without Vary, a shared cache could hand one browser's variant to
        // every other browser.
        Vary: "User-Agent",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    // Both variants also exist as plain static files, so if the bundled read
    // ever fails the icon degrades to a redirect instead of a broken image.
    return NextResponse.redirect(new URL(`/${file}`, request.url));
  }
}
