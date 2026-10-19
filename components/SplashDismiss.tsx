'use client'

import { useEffect, useState } from 'react'

const MIN_SHOW_MS = 1200

/**
 * Dismisses the server-rendered splash screen (#app-splash) once the app
 * has mounted. Fades out after a minimum display time so the brand lands.
 */
export function SplashDismiss() {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      const el = document.getElementById('app-splash')
      if (el) {
        el.classList.add('splash-hide')
        setTimeout(() => {
          el.remove()
          setGone(true)
        }, 450)
      } else {
        setGone(true)
      }
    }, MIN_SHOW_MS)
    return () => clearTimeout(t)
  }, [])

  return null
}
