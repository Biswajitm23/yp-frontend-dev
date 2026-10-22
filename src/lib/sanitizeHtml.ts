import DOMPurify from "dompurify";

/**
 * Should this inline-style property be dropped from admin rich-text (WYSIWYG
 * Web Builder) content? The editor hardcodes a font family and colours that
 * clash with the app's own font and light/dark theme, so we remove:
 *   - `font-family` (but NOT font-size / font-weight / font-style),
 *   - the text `color`,
 *   - every `background*` property.
 *
 * We match against the element's *parsed* declarations rather than removing the
 * `background` shorthand by name: setting `background: red` expands in the CSSOM
 * into its longhands (`background-image`, `background-position`, …), and
 * removing the shorthand doesn't reliably clear those longhands across engines.
 * Everything else — text-align, spacing, lists, headings, images, tables — is
 * preserved so the output matches the editor exactly, minus fonts/colours.
 */
function isStrippedStyleProp(prop: string): boolean {
  const p = prop.toLowerCase();
  return p === "font-family" || p === "color" || p.startsWith("background");
}

export interface SanitizeDescriptionOptions {
  /** Extra attributes to allow through DOMPurify (e.g. link `target`/`rel`). */
  addAttr?: string[];
}

/**
 * Sanitize admin-authored description HTML and strip the font/colour styling we
 * never want to inherit from the editor (see {@link isStrippedStyleProp}).
 * Both inline `style` declarations and the legacy presentational attributes
 * WYSIWYG Web Builder can emit (`<font face|color>`, `bgcolor`) are removed.
 *
 * SSR-safe: DOMPurify needs a DOM, so it returns "" on the server. Callers that
 * render this via `dangerouslySetInnerHTML` should already be client
 * components (or guard for the empty string).
 */
export function sanitizeDescriptionHtml(
  html?: string | null,
  options?: SanitizeDescriptionOptions,
): string {
  if (!html?.trim()) return "";
  if (typeof window === "undefined") return "";

  const stripStyling = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;

    // Inline styles: drop the font/colour/background declarations, then remove
    // the `style` attribute entirely if nothing else is left so markup stays
    // clean. Collect names first — removeProperty mutates the live list.
    if (node.style?.length) {
      const toRemove: string[] = [];
      for (let i = 0; i < node.style.length; i++) {
        const prop = node.style[i];
        if (isStrippedStyleProp(prop)) toRemove.push(prop);
      }
      for (const prop of toRemove) node.style.removeProperty(prop);
      if (!node.getAttribute("style")?.trim()) node.removeAttribute("style");
    }

    // Legacy presentational attributes (old-school <font> / bgcolor markup).
    node.removeAttribute("face"); // font-family equivalent
    node.removeAttribute("color"); // <font color>
    node.removeAttribute("bgcolor"); // background equivalent
  };

  DOMPurify.addHook("afterSanitizeAttributes", stripStyling);
  try {
    return DOMPurify.sanitize(
      html,
      options?.addAttr ? { ADD_ATTR: options.addAttr } : {},
    );
  } finally {
    // Always remove our hook so this never leaks into unrelated sanitize calls.
    DOMPurify.removeHook("afterSanitizeAttributes");
  }
}
