'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Star } from '@/lib/icons'

interface LeaderRow {
  userId: string
  name: string
  coins: number
  level: number
}

/** In-stream gift leaderboard: top gifters this session, live-updated. */
export function GiftLeaderboard({ sessionId }: { sessionId: string }) {
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
        .from('profiles').select('id, display_name').in('id', ids)
      const { data: stats } = await supabase
        .from('gifter_stats').select('user_id, level').in('user_id', ids)
      const levelBy: Record<string, number> = {}
      for (const s of (stats ?? []) as any[]) levelBy[s.user_id] = s.level
      const names: Record<string, string> = {}
      for (const p of (profs ?? []) as any[]) names[p.id] = p.display_name ?? 'Someone'
      if (live) {
        setRows(ids
          .map((id) => ({ userId: id, name: names[id] ?? 'Someone', coins: totals[id], level: levelBy[id] ?? 1 }))
          .sort((a, b) => b.coins - a.coins)
          .slice(0, 5))
      }
    }
    load()
    const ch = supabase
      .channel(`lb-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_transactions', filter: `session_id=eq.${sessionId}` }, load)
      .subscribe()
    return () => { live = false; supabase.removeChannel(ch) }
  }, [sessionId])

  if (rows.length === 0) return null
  return (
    <div className="pointer-events-none absolute left-3 top-24 z-20 w-44 rounded-2xl bg-black/45 p-2.5 backdrop-blur-sm">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-gold">
        <Star className="h-3 w-3" /> Top gifters
      </p>
      <div className="mt-1.5 space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.userId} className="flex items-center justify-between text-[11px] text-white">
            <span className="flex items-center gap-1.5 truncate">
              <span className={`font-bold ${i === 0 ? 'text-gold' : 'text-white/60'}`}>{i + 1}.</span>
              <span className="truncate">{r.name}</span>
              <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white">Lv{r.level}</span>
            </span>
            <span className="shrink-0 font-mono text-white/80">{r.coins.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
