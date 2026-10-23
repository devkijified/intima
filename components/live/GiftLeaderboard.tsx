'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCompactCount, ngnForCoins } from '@/lib/utils/helpers'
import { Crown, People, Star } from '@/lib/icons'

interface LeaderRow {
  userId: string
  name: string
  coins: number
  level: number
  avatar: string | null
}

/** Live-updated gift leaderboard rows for one session. The realtime
 * channel topic carries a per-instance key: supabase returns the SAME
 * channel object for a repeated topic, so two instances sharing one
 * topic would crash the room when the second adds its listener. */
function useGiftLeaders(sessionId: string, topicKey: string) {
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
    const ch = supabase
      .channel(`lb-${sessionId}-${topicKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_transactions', filter: `session_id=eq.${sessionId}` }, load)
      .subscribe()
    return () => { live = false; supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, topicKey])

  return rows
}

function AvatarDisc({ row, size = 'md', ring = false }: { row: LeaderRow; size?: 'sm' | 'md'; ring?: boolean }) {
  const cls = size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-8 w-8 text-xs'
  if (row.avatar) {
    return <img src={row.avatar} alt="" className={`${cls} shrink-0 rounded-full object-cover ${ring ? 'ring-1 ring-gold' : ''}`} draggable={false} />
  }
  return (
    <span className={`flex ${cls} shrink-0 items-center justify-center rounded-full font-bold ${ring ? 'bg-gold text-charcoal' : 'bg-primary text-white'}`}>
      {row.name[0]?.toUpperCase() ?? 'S'}
    </span>
  )
}

/** Desktop rail variant: the static top-3 block in the chat rail. */
export function GiftLeaderboard({ sessionId }: { sessionId: string }) {
  const rows = useGiftLeaders(sessionId, 'rail')
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

/** The TikTok-style audience pill at the top of the mobile stage:
 * people icon + watching count + the current top gifter's avatar.
 * One slim row no matter how many gifters there are, so it never
 * obstructs the stream; the full lists live in the audience sheet. */
export function LeaderboardPill({
  sessionId,
  viewerCount,
  onOpen,
}: {
  sessionId: string
  viewerCount: number
  onOpen: () => void
}) {
  const rows = useGiftLeaders(sessionId, 'pill')
  const leader = rows[0]
  return (
    <button
      onClick={onOpen}
      aria-label="See top gifters and who is watching"
      className="flex items-center gap-1.5 rounded-full bg-black/50 py-1.5 pl-2.5 pr-3 text-white backdrop-blur-sm transition-transform active:scale-95"
    >
      <People className="h-4 w-4" aria-hidden />
      <span className="text-xs font-bold">{formatCompactCount(Math.max(viewerCount, 1))}</span>
      {leader && (
        <>
          <span className="h-3 w-px bg-white/25" aria-hidden />
          {leader.avatar ? (
            <img src={leader.avatar} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-gold" draggable={false} />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[9px] font-bold text-charcoal">
              {leader.name[0]?.toUpperCase() ?? 'S'}
            </span>
          )}
          <Crown className="h-3.5 w-3.5 text-gold" aria-hidden />
        </>
      )}
    </button>
  )
}

/** Full leaderboard for the audience sheet: every top gifter with
 * rank, avatar, level, and exact coins with the naira twin. */
export function LeaderboardList({ sessionId }: { sessionId: string }) {
  const rows = useGiftLeaders(sessionId, 'sheet')
  if (rows.length === 0) {
    return <p className="px-2 py-6 text-center text-sm text-white/50">No gifts yet in this stream. The first gift takes the crown.</p>
  }
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={r.userId} className={`flex items-center justify-between gap-2 rounded-2xl px-3 py-2 ${i === 0 ? 'bg-gold/15 ring-1 ring-gold/50' : ''}`}>
          <span className="flex min-w-0 items-center gap-2.5">
            {i === 0 ? (
              <Crown className="h-4 w-4 shrink-0 text-gold" aria-hidden />
            ) : (
              <span className="w-4 shrink-0 text-center text-xs font-bold text-white/50">{i + 1}</span>
            )}
            <AvatarDisc row={r} ring={i === 0} />
            <span className={`truncate text-sm ${i === 0 ? 'font-bold text-gold' : 'text-white'}`}>{r.name}</span>
            <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white">Lv{r.level}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block font-mono text-sm ${i === 0 ? 'font-bold text-gold' : 'text-white/85'}`}>{r.coins.toLocaleString()}</span>
            <span className="block text-[10px] text-white/45">≈ {ngnForCoins(r.coins)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
