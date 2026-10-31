import { Mark, mergeAttributes } from "@tiptap/core";
import { matchRichTextFont } from "@/lib/rich-text-fonts";

export interface TextStyleAttrs {
  color?: string | null;
  backgroundColor?: string | null;
  fontSize?: string | null;
  fontFamily?: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textStyle: {
      /** Merges the given values into the selection's text style; null clears that one value. */
      setTextStyle: (patch: TextStyleAttrs) => ReturnType;
    };
  }
}

/** Inline text styling (colour, highlight, size, font) stored as one `<span style="…">`. */
export const TextStyle = Mark.create({
  name: "textStyle",

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.color || null,
        renderHTML: (a) => (a.color ? { style: `color:${a.color}` } : {}),
      },
      backgroundColor: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.backgroundColor || null,
        renderHTML: (a) => (a.backgroundColor ? { style: `background-color:${a.backgroundColor}` } : {}),
      },
      fontSize: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
        renderHTML: (a) => (a.fontSize ? { style: `font-size:${a.fontSize}` } : {}),
      },
      fontFamily: {
        default: null,
        parseHTML: (el) => matchRichTextFont((el as HTMLElement).style.fontFamily)?.label ?? null,
        renderHTML: (a) => {
          const font = matchRichTextFont(a.fontFamily);
          return font ? { style: `font-family:${font.css}` } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span",
        getAttrs: (el) => {
          const s = (el as HTMLElement).style;
          return s.color || s.backgroundColor || s.fontSize || s.fontFamily ? {} : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextStyle:
        (patch) =>
        ({ editor, chain }) => {
          const current = editor.getAttributes(this.name) as TextStyleAttrs;
          const next = { ...current, ...patch };
          const empty = !next.color && !next.backgroundColor && !next.fontSize && !next.fontFamily;
          return empty ? chain().unsetMark(this.name).run() : chain().setMark(this.name, next).run();
        },
    };
  },
});
