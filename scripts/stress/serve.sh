#!/bin/bash
# Production build + server on :3100, pointed at TEST (a dev server's per-route compile times make
# load numbers meaningless). The build needs a bigger heap than Node's 4 GB default; next/font's
# Google Fonts fetch is occasionally flaky, so the build retries.
#   scripts/stress/serve.sh build    # ~4 min
#   scripts/stress/serve.sh start    # foreground; Ctrl-C to stop
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
case "$1" in
  build) export NODE_OPTIONS=--max-old-space-size=9216
         for n in 1 2 3; do npx next build && exit 0; sleep 5; done; exit 1 ;;
  start) export NODE_OPTIONS=--max-old-space-size=4096; exec npx next start -p 3100 ;;
  *) echo "usage: serve.sh build|start"; exit 2 ;;
esac
