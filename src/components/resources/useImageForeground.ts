'use client'

import { useEffect, useState } from 'react'

// Same-origin proxy for storage images. The bucket sends no CORS headers, so a
// direct <img> can't be read on a <canvas> without tainting it (getImageData
// throws). Routing the SAMPLE load through our own origin keeps the canvas
// readable. The visible thumbnail still loads directly (this is a second, tiny
// load used only to pick a legible overlay color).
const proxied = (u: string) => `/api/resource-file?url=${encodeURIComponent(u)}`

export interface ImageForeground {
  /** Readable foreground color: near-black on light images, white on dark ones. */
  color: string
  /** True when the sampled region is light (overlays should go dark). */
  isLight: boolean
}

/**
 * Samples the CENTRE of `url` (where an overlay badge sits) and returns a
 * foreground color that stays legible against it. Returns `null` until the
 * sample completes — or if it fails — so callers fall back to a static color.
 */
export function useImageForeground(
  url: string | null | undefined
): ImageForeground | null {
  const [fg, setFg] = useState<ImageForeground | null>(null)

  useEffect(() => {
    setFg(null)
    if (!url) return
    let cancelled = false

    const img = new window.Image()
    img.onload = () => {
      if (cancelled) return
      try {
        const S = 32
        const canvas = document.createElement('canvas')
        canvas.width = S
        canvas.height = S
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(img, 0, 0, S, S)
        // Central ~40% region — the area behind the centered badge.
        const a = Math.floor(S * 0.3)
        const side = Math.ceil(S * 0.4)
        const { data } = ctx.getImageData(a, a, side, side)
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          n++
        }
        if (n === 0) return
        r /= n
        g /= n
        b /= n
        // Perceptual (relative) luminance, 0–1.
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        const isLight = lum > 0.55
        if (!cancelled) {
          setFg({ color: isLight ? '#111827' : '#ffffff', isLight })
        }
      } catch {
        // Tainted canvas / decode failure → leave null; caller uses fallback.
      }
    }
    // Load failure → keep the fallback color.
    img.onerror = () => {}
    img.src = proxied(url)

    return () => {
      cancelled = true
    }
  }, [url])

  return fg
}
