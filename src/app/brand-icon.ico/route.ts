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

const MARK = "icon-mark.ico";
const GREEN = "icon-green.ico";

// Which variant Safari gets. Currently the green tile, on the chance that
// enlarging the mark (70% -> 80% of the tile) lifts the icon over Safari's
// contrast rule: it takes the mean from 95.8 to 104.7. But the tile's EDGE
// luminance is still 69.9 — barely moved, and under AmEx's 109 — and the
// edge is what the original ring tracked. If the ring is back, flip this to
// MARK: the bare mark on transparency measures mean 168 / edge 255 and is
// confirmed clean, at the cost of the green tile.
const SAFARI_VARIANT = GREEN;

// Chromium and Firefox both put "Safari" in their UA strings, so real Safari
// is identified by the absence of every other engine's marker rather than by
// the presence of "Safari". Anything unrecognised (or an empty UA) falls
// through to Safari's variant rather than Chromium's.
function pickVariant(ua: string): string {
  const isChromiumOrFirefox = /(?:Chrome|Chromium|CriOS|Edg|EdgiOS|EdgA|OPR|Firefox|FxiOS)\//.test(ua);
  return isChromiumOrFirefox ? GREEN : SAFARI_VARIANT;
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
