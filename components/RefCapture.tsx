'use client'

import { useEffect } from 'react'
import { captureRefFromUrl } from '@/lib/links'

/** Mounted once at the root: remembers who sent this visitor (dynamic-link ref). */
export default function RefCapture() {
  useEffect(() => {
    captureRefFromUrl()
  }, [])
  return null
}
