import { useMemo } from "react";
import { sanitizeDescriptionHtml } from "@/lib/sanitizeHtml";
import styles from "../../moduleCss/Renderhtmlcontent.module.css";

interface Props {
  html?: string;
  className?: string;
}

export function RenderHtmlContent({ html, className = "" }: Props) {
  // Shared sanitizer: strips the editor's font-family/color/background styling
  // so the app font + light/dark theme win, while keeping all other formatting.
  const sanitizedHtml = useMemo(() => sanitizeDescriptionHtml(html), [html]);

  if (!sanitizedHtml) return null;

  // `ql-render` applies Quill's own content styles (src/styles/quill-content.css)
  // so the editor's HTML renders identically to the admin editor; `htmlContent`
  // layers the app's light/dark text colour on top.
  return (
    <div
      className={`ql-render ${styles.htmlContent} ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}