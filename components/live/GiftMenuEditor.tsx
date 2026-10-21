'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { scanForLeaks, leakWarning } from '@/lib/moderation/contactCheck'
import { Gift } from '@/lib/icons'
import { HelpTip } from '@/components/ui/Tooltip'

interface MenuGift {
  id: string
  name: string
  emoji: string
  coin_cost: number
}

/**
 * The companion's gift menu editor (go-live console, setup phase).
 * She pins one short reaction line per gift ("send The Rose and I
 * blow you a kiss"); viewers see up to three in the gift panel.
 * Saves go through POST /api/live/gift-menu, which leak-scans every
 * line server-side; the client scan here is only fast feedback.
 */
export function GiftMenuEditor() {
  const supabase = createClient()
  const [gifts, setGifts] = useState<MenuGift[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (live) setLoading(false)
        return
      }
      const [{ data: catalog }, { data: profile }] = await Promise.all([
        supabase
          .from('gift_catalog')
          .select('id, name, emoji, coin_cost')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('profiles').select('gift_menu').eq('id', user.id).maybeSingle(),
      ])
      if (!live) return
      setGifts((catalog ?? []) as MenuGift[])
      const menu = (profile?.gift_menu ?? {}) as Record<string, string>
      setDrafts(Object.fromEntries(Object.entries(menu).filter(([, v]) => typeof v === 'string')))
      setLoading(false)
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    if (saving) return
    setError('')
    setMsg('')
    const menu: Record<string, string> = {}
    for (const [slug, value] of Object.entries(drafts)) {
      const line = value.trim().slice(0, 60)
      if (!line) continue
      const scan = scanForLeaks(line)
      if (!scan.clean) {
        setError(leakWarning(scan.leaks))
        return
      }
      menu[slug] = line
    }
    setSaving(true)
    try {
      const res = await fetch('/api/live/gift-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not save your gift menu')
      setMsg('Saved. Viewers see your menu in the gift panel.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your gift menu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 rounded-3xl border border-neutral-200/80 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-charcoal">
        <Gift className="h-5 w-5 text-primary" aria-hidden /> Your gift menu
        <HelpTip text="Pin a short reaction to any gift: what you will do on camera when it lands. Viewers see your menu inside the gift panel, and a gift with a promise attached gets sent far more than a bare emoji." />
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Tell viewers what each gift gets from you on camera. A gift with a promise attached gets sent
        far more than a bare emoji. Leave a line empty to unpin that gift.
      </p>
      {loading ? (
        <p className="mt-4 text-sm text-neutral-400">Loading gifts...</p>
      ) : (
        <>
          <div className="mt-4 space-y-2.5">
            {gifts.map((g) => (
              <div key={g.id} className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-center text-2xl leading-none">{g.emoji}</span>
                <span className="hidden w-28 shrink-0 sm:block">
                  <span className="block truncate text-sm font-medium text-charcoal">{g.name}</span>
                  <span className="block text-xs text-neutral-400">{g.coin_cost.toLocaleString()} coins</span>
                </span>
                <input
                  value={drafts[g.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                  placeholder="e.g. I blow you a kiss"
                  maxLength={60}
                  aria-label={`Your reaction for ${g.name}`}
                  className="min-h-[44px] min-w-0 flex-1 rounded-2xl border border-neutral-200 px-4 py-2.5 text-base outline-none focus:border-primary md:text-sm"
                />
              </div>
            ))}
          </div>
          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
          {msg && <p className="mt-3 text-sm font-medium text-emerald-600">{msg}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-full bg-charcoal py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save gift menu'}
          </button>
        </>
      )}
    </div>
  )
}
