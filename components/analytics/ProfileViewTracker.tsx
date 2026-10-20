'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

function newViewerKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* fall through to the manual fallback */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16)
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Records one profile view for the day. Fire and forget: a repeat
 * visit on the same day hits the unique index in migration 039 and
 * the error is ignored on purpose. Skips when the viewer is the
 * provider herself, so her own checks never inflate her numbers.
 */
export function ProfileViewTracker({ providerId }: { providerId: string }) {
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled) return
        if (user && user.id === providerId) return

        let viewerKey: string | null = user?.id ?? null
        if (!viewerKey) {
          try {
            let stored = window.localStorage.getItem('intima_viewer_key')
            if (!stored) {
              stored = newViewerKey()
              window.localStorage.setItem('intima_viewer_key', stored)
            }
            viewerKey = stored
          } catch {
            viewerKey = newViewerKey()
          }
        }
        if (!viewerKey || cancelled) return

        await supabase
          .from('profile_events')
          .insert({ provider_id: providerId, viewer_key: viewerKey, kind: 'view' })
      } catch { /* tracking is best effort only */ }
    })()
    return () => { cancelled = true }
  }, [providerId])

  return null
}
