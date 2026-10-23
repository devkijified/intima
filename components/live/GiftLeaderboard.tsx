'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ngnForCoins } from '@/lib/utils/helpers'
import { Crown, Star } from '@/lib/icons'

interface LeaderRow {
  userId: string
  name: string
  coins: number
  level: number
  avatar: string | null
}

/** In-stream gift leaderboard: top gifters this session, live-updated.
 * The overlay variant floats over the stage on mobile (top 5); the
 * rail variant is the static top-3 block pinned in the desktop
 * chat rail. */
export function GiftLeaderboard({
  sessionId,
  variant = 'overlay',
}: {
  sessionId: string
  variant?: 'overlay' | 'rail'
}) {
  const [rows, setRows] = useState<LeaderRow[]>([])
  const supabase = createClient()

  useEffect(() => {
    let live = true
    const load = async () => {
      const { data: txs } = await supabase
        .from('gift_transactions')
        .select('sender_id, coin_cost')
        .eq('session_id', sessionId)
      if (!txs) return
      const totals: Record<string, number> = {}
      for (const t of txs as any[]) totals[t.sender_id] = (totals[t.sender_id] ?? 0) + t.coin_cost
      const ids = Object.keys(totals)
      if (ids.length === 0) { if (live) setRows([]); return }
      const { data: profs } = await supabase
        .from('profiles').select('id, display_name, avatar_url').in('id', ids)
      const { data: stats } = await supabase
        .from('gifter_stats').select('user_id, level').in('user_id', ids)
      const levelBy: Record<string, number> = {}
      for (const s of (stats ?? []) as any[]) levelBy[s.user_id] = s.level
      const names: Record<string, string> = {}
      const avatars: Record<string, string | null> = {}
      for (const p of (profs ?? []) as any[]) { names[p.id] = p.display_name ?? 'Someone'; avatars[p.id] = p.avatar_url ?? null }
      if (live) {
        setRows(ids
          .map((id) => ({ userId: id, name: names[id] ?? 'Someone', coins: totals[id], level: levelBy[id] ?? 1, avatar: avatars[id] ?? null }))
          .sort((a, b) => b.coins - a.coins)
          .slice(0, 10))
      }
    }
    load()
    // The topic carries the variant: the room renders this component
    // twice (mobile overlay + desktop rail), and supabase returns the
    // SAME channel object for a repeated topic, so a second instance
    // adding a postgres_changes listener after the first subscribed
    // throws and crashes the whole room page.
    const ch = supabase
      .channel(`lb-${sessionId}-${variant}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_transactions', filter: `session_id=eq.${sessionId}` }, load)
      .subscribe()
    return () => { live = false; supabase.removeChannel(ch) }
  }, [sessionId])

  if (variant === 'rail') {
    return (
      <div>
        <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-gold">
          <Star className="h-3 w-3" aria-hidden /> Top gifters
        </p>
        {rows.length === 0 ? (
          <p className="mt-2 text-xs text-white/40">No gifts yet. The first gift takes the top spot.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {rows.slice(0, 3).map((r, i) => (
              <div key={r.userId} className="flex items-center justify-between text-xs text-white">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={`font-bold ${i === 0 ? 'text-gold' : 'text-white/60'}`}>{i + 1}.</span>
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white">Lv{r.level}</span>
                </span>
                <span className="shrink-0 font-mono text-white/80">
                  {r.coins.toLocaleString()}
                  <span className="ml-1.5 font-sans text-[10px] font-normal text-white/45">≈ {ngnForCoins(r.coins)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (rows.length === 0) return null
  return (
    <div className="pointer-events-none absolute left-3 top-24 z-20 w-48 rounded-2xl bg-black/55 p-2.5 shadow-lg shadow-black/40 ring-1 ring-gold/40 backdrop-blur-sm lg:hidden">
      <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-gold">
        <Crown className="h-3.5 w-3.5" aria-hidden /> Top gifters
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.slice(0, 5).map((r, i) => (
          <div key={r.userId} className={`flex items-center justify-between gap-1.5 text-[11px] text-white ${i === 0 ? 'rounded-xl bg-gold/15 px-1.5 py-1 ring-1 ring-gold/50' : 'px-1.5'}`}>
            <span className="flex min-w-0 items-center gap-1.5">
              {i === 0 ? (
                <Crown className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
              ) : (
                <span className="w-3.5 shrink-0 text-center font-bold text-white/60">{i + 1}</span>
              )}
              {r.avatar ? (
                <img src={r.avatar} alt="" className={`h-5 w-5 shrink-0 rounded-full object-cover ${i === 0 ? 'ring-1 ring-gold' : ''}`} draggable={false} />
              ) : (
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${i === 0 ? 'bg-gold text-charcoal' : 'bg-primary'}`}>
                  {r.name[0]?.toUpperCase() ?? 'S'}
                </span>
              )}
              <span className={`truncate ${i === 0 ? 'font-bold text-gold' : ''}`}>{r.name}</span>
              <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white">Lv{r.level}</span>
            </span>
            <span className={`shrink-0 font-mono ${i === 0 ? 'font-bold text-gold' : 'text-white/80'}`}>{r.coins.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
