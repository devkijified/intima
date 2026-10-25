'use client'

import { useMemo, useState } from 'react'
import { Clock, Search } from '@/lib/icons'
import { EMOJI_CATEGORIES, noteEmojiUsed, recentEmojis, searchEmojis } from '@/lib/chat/emojis'
import { cn } from '@/lib/utils/helpers'

/**
 * The shared emoji panel: WhatsApp's layout (recent first, then
 * the familiar categories in WhatsApp's order, search on top), used
 * by the chat composer, the reaction picker, and the live room.
 * `dark` restyles it for the live room's black glass surfaces.
 */
export default function EmojiPicker({
  onPick,
  dark = false,
  autoFocusSearch = false,
}: {
  onPick: (glyph: string) => void
  dark?: boolean
  autoFocusSearch?: boolean
}) {
  const [tab, setTab] = useState<string>('recent')
  const [query, setQuery] = useState('')
  const recents = useMemo(() => recentEmojis(), [])
  const results = useMemo(() => searchEmojis(query), [query])

  const activeCat = EMOJI_CATEGORIES.find((c) => c.id === tab) ?? EMOJI_CATEGORIES[0]
  const glyphs = query.trim()
    ? results
    : tab === 'recent'
      ? recents.length > 0
        ? recents
        : EMOJI_CATEGORIES[0].glyphs
      : activeCat.glyphs

  const pick = (g: string) => {
    noteEmojiUsed(g)
    onPick(g)
  }

  return (
    <div
      className={cn(
        'flex h-[300px] flex-col overflow-hidden rounded-3xl shadow-2xl ring-1',
        dark ? 'bg-[#14141c] ring-white/10' : 'bg-white ring-black/5',
      )}
    >
      <div className={cn('flex items-center gap-2 px-3 pb-1 pt-2.5', dark ? 'text-white' : 'text-charcoal')}>
        <Search aria-hidden className={cn('h-4 w-4 shrink-0', dark ? 'text-white/50' : 'text-neutral-400')} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji"
          autoFocus={autoFocusSearch}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-sm outline-none',
            dark ? 'placeholder:text-white/40' : 'placeholder:text-neutral-400',
          )}
        />
      </div>
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto px-2 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => { setTab('recent'); setQuery('') }}
          aria-label="Recent emoji"
          aria-pressed={tab === 'recent' && !query}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            tab === 'recent' && !query
              ? dark ? 'bg-white/15 text-white' : 'bg-cream text-charcoal'
              : dark ? 'text-white/55' : 'text-neutral-400',
          )}
        >
          <Clock className="h-[18px] w-[18px]" />
        </button>
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { setTab(c.id); setQuery('') }}
            aria-label={c.label}
            aria-pressed={tab === c.id && !query}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[19px] leading-none',
              tab === c.id && !query ? (dark ? 'bg-white/15' : 'bg-cream') : 'opacity-60',
            )}
          >
            {c.glyphs[0]}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!query.trim() && (
          <p className={cn('px-1.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide', dark ? 'text-white/40' : 'text-neutral-400')}>
            {tab === 'recent' ? (recents.length > 0 ? 'Recent' : EMOJI_CATEGORIES[0].label) : activeCat.label}
          </p>
        )}
        {query.trim() && glyphs.length === 0 ? (
          <p className={cn('px-2 py-6 text-center text-sm', dark ? 'text-white/50' : 'text-neutral-500')}>
            No emoji matches &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {glyphs.map((g, i) => (
              <button
                key={`${g}-${i}`}
                type="button"
                onClick={() => pick(g)}
                aria-label={`Emoji ${g}`}
                className={cn(
                  'flex h-10 items-center justify-center rounded-xl text-[24px] leading-none transition-transform active:scale-90',
                  dark ? 'hover:bg-white/10' : 'hover:bg-cream',
                )}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
