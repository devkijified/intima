'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BookOpen } from '@/lib/icons'

/**
 * Retention hook on the map home: if an episode dropped in the last 7
 * days, a pill invites a read. Dismissible (per episode, localStorage).
 */
export function ComicRibbon() {
  const [ep, setEp] = useState<{ id: string; episode_no: number; title: string } | null>(null)

  useEffect(() => {
    let live = true
    const supabase = createClient()
    supabase.from('comic_episodes')
      .select('id, episode_no, title, published_at')
      .eq('status', 'published')
      .gte('published_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!live || !data) return
        try {
          if (localStorage.getItem('comic_dismissed') === data.id) return
        } catch { /* ignore */ }
        setEp(data as any)
      })
    return () => { live = false }
  }, [])

  if (!ep) return null
  return (
    <div className="pointer-events-auto flex items-center justify-center px-3">
      <Link
        href={`/comics/${ep.id}`}
        className="glass-dark flex items-center gap-2 rounded-full py-2 pl-3 pr-4 text-white animate-pop-in active:scale-[0.97] transition-transform"
      >
        <BookOpen className="h-4 w-4 text-gold" />
        <span className="text-[13px] font-medium">
          New comic episode — <span className="font-semibold">{ep.title}</span>
        </span>
        <button
          aria-label="Dismiss"
          onClick={(e) => {
            e.preventDefault()
            try { localStorage.setItem('comic_dismissed', ep.id) } catch { /* ignore */ }
            setEp(null)
          }}
          className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[11px] text-white/80"
        >
          ×
        </button>
      </Link>
    </div>
  )
}
