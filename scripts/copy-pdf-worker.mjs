// Keeps public/pdf.worker.min.mjs in sync with the installed pdfjs-dist.
// The worker is served as a plain static file: routing it through the Next
// bundler (transpilePackages) made SWC inject `@swc/helpers` imports that a
// web worker cannot resolve ("Setting up fake worker failed").
import { copyFileSync, existsSync } from "node:fs";
const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
if (existsSync(src)) copyFileSync(src, "public/pdf.worker.min.mjs");
