#!/usr/bin/env bash
# Vercel "Ignored Build Step" (wired up via vercel.json -> ignoreCommand).
# Exit 0 = SKIP the build, exit 1 = BUILD.
#
# Preview builds are skipped when nothing the Next.js build reads has changed
# since the last deployed commit on this branch (e.g. migration-only or
# docs-only pushes). Anything uncertain falls through to a normal build.

set -u

# Production (main) always builds.
if [ "${VERCEL_GIT_COMMIT_REF:-}" = "main" ]; then
  echo "main branch: building"
  exit 1
fi

# First deploy of a branch, or the base commit isn't in the clone: build.
BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo "No usable previous deployment SHA: building"
  exit 1
fi

# Everything `next build` can depend on. Keep in sync if new build inputs appear.
if git diff --quiet "$BASE" HEAD -- \
  src public \
  package.json package-lock.json \
  next.config.ts tsconfig.json tailwind.config.ts postcss.config.mjs components.json \
  instrumentation.ts instrumentation-client.ts sentry.server.config.ts sentry.edge.config.ts \
  vercel.json .node-version scripts/vercel-ignore-build.sh; then
  echo "No build-relevant changes since $BASE: skipping"
  exit 0
fi

echo "Build-relevant changes detected: building"
exit 1
