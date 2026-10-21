'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Trophy, XCircle } from '@/lib/icons'
import { coinsWithNgn, ngnForCoins } from '@/lib/utils/helpers'

interface AdminContest {
  id: string
  title: string
  theme: string
  prize_coins: number
  prize_split: number[]
  starts_at: string
  ends_at: string
  status: string
  created_at: string
}

interface PendingEntry {
  id: string
  contestId: string
  contestTitle: string
  providerName: string
  providerUsername: string | null
  imageUrl: string
  caption: string
  createdAt: string
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminPerksPage() {
  const [contests, setContests] = useState<AdminContest[]>([])
  const [pending, setPending] = useState<PendingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  const [title, setTitle] = useState('')
  const [theme, setTheme] = useState('')
  const [prize, setPrize] = useState('1000')
  const [split, setSplit] = useState('100')
  const [starts, setStarts] = useState(() => toLocalInput(new Date()))
  const [ends, setEnds] = useState(() => toLocalInput(new Date(Date.now() + 7 * 24 * 3600 * 1000)))

  async function load() {
    const res = await fetch('/api/admin/perks')
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      setContests(d.contests ?? [])
      setPending(d.pendingEntries ?? [])
      setError('')
    } else {
      setError(d.error ?? 'Could not load Perks.')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function post(payload: Record<string, unknown>, okMsg: string) {
    setBusy(JSON.stringify(payload).slice(0, 40))
    setMsg('')
    const res = await fetch('/api/admin/perks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await res.json().catch(() => ({}))
    setBusy('')
    if (res.ok) {
      setMsg(d.winners ? `Paid: ${d.winners.map((w: { place: number; coins: number }) => `#${w.place} ${coinsWithNgn(w.coins)}`).join(', ')}` : okMsg)
      void load()
    } else {
      setMsg(d.error ?? 'That did not save.')
    }
  }

  async function create() {
    const splitNums = split.split(/[^0-9]+/).filter(Boolean).map((n) => parseInt(n, 10))
    await post(
      {
        action: 'create',
        title: title.trim(),
        theme: theme.trim(),
        prizeCoins: parseInt(prize.replace(/[^0-9]/g, ''), 10) || 0,
        prizeSplit: splitNums,
        startsAt: new Date(starts).toISOString(),
        endsAt: new Date(ends).toISOString(),
      },
      'Contest created.',
    )
    setTitle('')
    setTheme('')
  }

  const inputCls =
    'min-h-[44px] w-full rounded-2xl bg-cream px-4 py-3 text-base md:text-sm text-charcoal outline-none ring-1 ring-black/[0.06] placeholder:text-neutral-400 focus:ring-primary/40'

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-neutral-500 hover:text-primary">
        <ArrowLeft aria-hidden className="h-4 w-4" /> Admin
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-muted">
          <Trophy aria-hidden className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Perks contests</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Create a contest, approve entries, close it, pay the winners in coins.
          </p>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {msg && <p className="mt-4 rounded-2xl bg-cream p-3 text-sm text-neutral-700">{msg}</p>}

      <div className="card-luxe mt-5 p-4">
        <p className="text-sm font-semibold text-charcoal">New contest</p>
        <div className="mt-3 grid gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Best Smile in Lagos" maxLength={120} className={inputCls} />
          <textarea value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Theme or brief shown to everyone" maxLength={600} rows={2} className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-neutral-500">
              Prize (coins)
              <input value={prize} onChange={(e) => setPrize(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={`${inputCls} mt-1`} />
              {Number(prize) > 0 && (
                <span className="mt-1 block font-normal text-neutral-400">That is {ngnForCoins(Number(prize))} in naira.</span>
              )}
            </label>
            <label className="text-xs text-neutral-500">
              Split by place (%), e.g. 60 25 15
              <input value={split} onChange={(e) => setSplit(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs text-neutral-500">
              Starts
              <input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs text-neutral-500">
              Ends
              <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
          </div>
          <button
            type="button"
            onClick={create}
            disabled={!!busy || !title.trim()}
            className="btn-luxe flex h-11 items-center justify-center text-sm disabled:opacity-50"
          >
            Create contest
          </button>
        </div>
      </div>

      <h2 className="mt-8 font-display text-xl font-semibold text-charcoal">Entries waiting for review</h2>
      {loading ? (
        <p className="mt-3 text-sm text-neutral-400">Loading...</p>
      ) : pending.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">No entries waiting for review.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {pending.map((e) => (
            <div key={e.id} className="card-luxe p-4">
              <div className="relative h-56 overflow-hidden rounded-2xl bg-neutral-100">
                <img src={e.imageUrl} alt="" className="h-full w-full object-contain" />
              </div>
              <p className="mt-3 text-sm font-semibold text-charcoal">
                {e.providerName}
                {e.providerUsername && <span className="ml-2 font-normal text-neutral-400">@{e.providerUsername}</span>}
              </p>
              <p className="text-xs text-neutral-500">{e.contestTitle}</p>
              {e.caption && <p className="mt-1 text-sm text-neutral-600">{e.caption}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => post({ action: 'entry', entryId: e.id, decision: 'approved' }, 'Entry approved.')}
                  className="btn-luxe flex min-h-[44px] items-center gap-1.5 px-4 text-sm disabled:opacity-50"
                >
                  <CheckCircle2 aria-hidden className="h-4 w-4" /> Approve
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => post({ action: 'entry', entryId: e.id, decision: 'rejected' }, 'Entry rejected.')}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-red-600 ring-1 ring-red-200 disabled:opacity-50"
                >
                  <XCircle aria-hidden className="h-4 w-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8 font-display text-xl font-semibold text-charcoal">Contests</h2>
      <div className="mt-3 space-y-3">
        {contests.map((c) => (
          <div key={c.id} className="card-luxe flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-charcoal">{c.title}</p>
              <p className="text-xs text-neutral-500">
                {coinsWithNgn(c.prize_coins)} · split {(c.prize_split ?? []).join(' / ')} · status {c.status} ·{' '}
                {new Date(c.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to{' '}
                {new Date(c.ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </p>
            </div>
            {c.status === 'open' && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => post({ action: 'close', contestId: c.id }, 'Contest closed. Voting and entries are off.')}
                className="btn-soft min-h-[44px] px-4 py-2.5 text-[13px] disabled:opacity-50"
              >
                Close
              </button>
            )}
            {c.status === 'closed' && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => post({ action: 'pay', contestId: c.id }, 'Winners paid.')}
                className="btn-luxe min-h-[44px] px-4 py-2.5 text-[13px] disabled:opacity-50"
              >
                Pay winners
              </button>
            )}
            {c.status === 'paid' && <span className="text-xs font-semibold text-emerald-600">PAID</span>}
          </div>
        ))}
        {!loading && contests.length === 0 && (
          <p className="text-sm text-neutral-400">No contests yet. Create the first one above.</p>
        )}
      </div>
    </div>
  )
}
