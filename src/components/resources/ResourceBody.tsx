'use client'

import { useMemo } from 'react'
import { sanitizeDescriptionHtml } from '@/lib/sanitizeHtml'
import styles from '@/moduleCss/resources.module.css'
import htmlStyles from '@/moduleCss/Renderhtmlcontent.module.css'

interface ResourceBodyProps {
  body: string | null
}

const ResourceBody = ({ body }: ResourceBodyProps) => {
  // Shared sanitizer: strips the editor's font-family/color/background styling
  // so the app font + theme rules win, while keeping all other formatting.
  const sanitized = useMemo(() => sanitizeDescriptionHtml(body), [body])

  if (!body || !sanitized.trim()) return null

  return (
    <article id="resource-article" className={styles.detail_main}>
      <div
        className={`ql-render ${styles.detail_body} ${htmlStyles.htmlContent}`}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    </article>
  )
}

export default ResourceBody
