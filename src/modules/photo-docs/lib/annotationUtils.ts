/**
 * Annotation canvas utilities.
 * Fabric.js is loaded dynamically (SSR-safe) — these helpers accept the
 * canvas instance as `any` to avoid importing fabric types at module level.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCanvas = any;

/**
 * Load a Fabric.js canvas from a saved JSON state.
 */
export function loadCanvasFromJson(
  canvas: AnyCanvas,
  json: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve) => {
    canvas.loadFromJSON(json, () => {
      canvas.renderAll();
      resolve();
    });
  });
}

/**
 * Render the Fabric canvas as a PNG Blob suitable for upload.
 */
export function canvasToBlob(canvas: AnyCanvas): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.getElement().toBlob(
      (blob: Blob | null) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/png",
      1.0,
    );
  });
}

/**
 * Configure canvas cursor / mode for the given tool.
 * Arrow / circle / text click handling is done via mouse events in the component.
 */
export function applyTool(
  canvas: AnyCanvas,
  tool: string,
  color: string,
): void {
  canvas.isDrawingMode = tool === "freehand";
  if (tool === "freehand") {
    canvas.freeDrawingBrush.color = color;
    canvas.freeDrawingBrush.width = 4;
  }
  canvas.selection = tool === "select";
  canvas.defaultCursor = tool === "select" ? "default" : "crosshair";
}
