import { Extension } from "@tiptap/core";

export const INDENT_STEP_PX = 24;
const MAX_INDENT = 6;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      /** Indents the paragraph, or nests the list item, at the cursor. */
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

/**
 * Paragraph indent, stored as `padding-left` (not margin: the email/PDF spacing
 * pass rewrites a paragraph's margin). Inside a list the same buttons nest and
 * un-nest the item instead.
 */
export const Indent = Extension.create({
  name: "indent",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const px = parseInt((el as HTMLElement).style.paddingLeft, 10);
              return Number.isFinite(px) && px > 0 ? Math.min(MAX_INDENT, Math.round(px / INDENT_STEP_PX)) : 0;
            },
            renderHTML: (a) => (a.indent ? { style: `padding-left:${a.indent * INDENT_STEP_PX}px` } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    const step = (delta: number) => () => ({ editor, commands }: { editor: import("@tiptap/core").Editor; commands: import("@tiptap/core").SingleCommands }) => {
      if (editor.isActive("listItem")) {
        return delta > 0 ? commands.sinkListItem("listItem") : commands.liftListItem("listItem");
      }
      const current = Number(editor.getAttributes("paragraph").indent) || 0;
      const next = Math.max(0, Math.min(MAX_INDENT, current + delta));
      return next === current ? false : commands.updateAttributes("paragraph", { indent: next });
    };
    return { indent: step(1), outdent: step(-1) };
  },
});
