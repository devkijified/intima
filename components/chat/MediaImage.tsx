'use client'

import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'

/**
 * Media URL resolution for private chat media (migration 052).
 *
 * messages.media_url holds either a legacy public URL (starts
 * with http, rendered as before) or a storage path inside the
 * private 'chat-media' bucket. Paths are never rendered directly:
 * the thread asks POST /api/chat/media-urls for signed URLs, and
 * the server only mints one for the sender, for free media, or
 * for a viewer who unlocked the PPV message. A locked message the
 * viewer has not paid for gets no URL, so the network payload and
 * the DOM contain nothing usable.
 *
 * resolveMediaUrls covers a whole batch (thread load); useMediaUrl
 * is the per component hook and shares one cache, so each message
 * triggers at most one request. When an unlock is recorded the
 * message id lands in unlockedLocally and the next request for it
 * is allowed to succeed, so callers bump a retry counter to
 * re-resolve after unlocking.
 */

const SIGNED_TTL_MS = 55 * 60 * 1000

const cache = new Map<string, { url: string; at: number }>()
const pending = new Map<string, Promise<string | null>>()
const unlockedLocally = new Set<string>()

export function isPrivateMediaPath(mediaUrl?: string | null): boolean {
  return !!mediaUrl && !mediaUrl.startsWith('http')
}

export function noteMediaUnlocked(messageId: string) {
  unlockedLocally.add(messageId)
}

async function requestSigned(messageId: string): Promise<string | null> {
  try {
    const res = await fetch('/api/chat/media-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds: [messageId] }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { urls?: Record<string, string> }
    const url = j.urls?.[messageId]
    if (url) {
      cache.set(messageId, { url, at: Date.now() })
      return url
    }
  } catch {
    // Offline or route unavailable: the media stays unrendered.
  }
  return null
}

function fetchOne(messageId: string, force: boolean): Promise<string | null> {
  const hit = cache.get(messageId)
  if (!force && hit && Date.now() - hit.at < SIGNED_TTL_MS) {
    return Promise.resolve(hit.url)
  }
  const inFlight = pending.get(messageId)
  if (inFlight && !force) return inFlight
  const p = requestSigned(messageId).finally(() => {
    if (pending.get(messageId) === p) pending.delete(messageId)
  })
  pending.set(messageId, p)
  return p
}

/** Batch resolve for thread load. Returns message id to signed URL. */
export async function resolveMediaUrls(
  messageIds: string[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const need: string[] = []
  for (const id of messageIds) {
    const hit = cache.get(id)
    if (hit && Date.now() - hit.at < SIGNED_TTL_MS) out[id] = hit.url
    else need.push(id)
  }
  for (let i = 0; i < need.length; i += 50) {
    const chunk = need.slice(i, i + 50)
    try {
      const res = await fetch('/api/chat/media-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: chunk }),
      })
      if (!res.ok) continue
      const j = (await res.json()) as { urls?: Record<string, string> }
      for (const [id, url] of Object.entries(j.urls ?? {})) {
        cache.set(id, { url, at: Date.now() })
        out[id] = url
      }
    } catch {
      // Leave unresolved ids out; components retry on their own.
    }
  }
  return out
}

/**
 * Resolve the display URL for one message's media. Pass the raw
 * messages.media_url value: legacy URLs come back untouched, paths
 * resolve through the signed URL endpoint. retryKey forces one
 * more attempt (bump it after an unlock or a view-once open).
 */
export function useMediaUrl(
  messageId: string,
  mediaUrl?: string | null,
  retryKey = 0
): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    mediaUrl && mediaUrl.startsWith('http') ? mediaUrl : null
  )
  useEffect(() => {
    if (!mediaUrl) {
      setUrl(null)
      return
    }
    if (mediaUrl.startsWith('http')) {
      setUrl(mediaUrl)
      return
    }
    let live = true
    void fetchOne(messageId, retryKey > 0).then((u) => {
      if (live && u) setUrl(u)
    })
    return () => {
      live = false
    }
  }, [messageId, mediaUrl, retryKey])
  return url
}

export interface GalleryMsg {
  id: string
  media_url?: string | null
  media_type?: string | null
}

function GallerySlide({ msg }: { msg: GalleryMsg }) {
  const url = useMediaUrl(msg.id, msg.media_url)
  if (!url) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-white/60">
        Loading media…
      </div>
    )
  }
  if (msg.media_type === 'video') {
    return <video src={url} controls autoPlay className="max-h-[76vh] w-full rounded-2xl object-contain" />
  }
  return (
    <img src={url} alt="" className="max-h-[76vh] w-full rounded-2xl object-contain" draggable={false} />
  )
}

/**
 * Full screen chat media gallery: swipe (or use the arrows) to
 * move through every openable photo in the conversation, the
 * WhatsApp habit. The caller decides which messages belong in
 * the gallery: anything locked stays out entirely, so the
 * server's signed URL gate is never even approached for it.
 * Landing on an item is reported through onIndex, which is
 * where the caller records the view (that recording is what
 * makes an item's open count, view-once included).
 */
export function MediaGalleryOverlay({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: GalleryMsg[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const indexRef = useRef(index)
  indexRef.current = index
  const countRef = useRef(items.length)
  countRef.current = items.length
  const onIndexRef = useRef(onIndex)
  onIndexRef.current = onIndex
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const lastSwipeAtRef = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      else if (e.key === 'ArrowRight') {
        onIndexRef.current(Math.min(countRef.current - 1, indexRef.current + 1))
      } else if (e.key === 'ArrowLeft') {
        onIndexRef.current(Math.max(0, indexRef.current - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Native touch listeners, the lightbox lesson: React
  // synthetic touch props proved unreliable under real touch.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let startX = 0
    let tracking = false
    const onStart = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      if (!t) {
        tracking = false
        return
      }
      startX = t.clientX
      tracking = true
    }
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - startX
      if (Math.abs(dx) < 45) return
      lastSwipeAtRef.current = Date.now()
      if (dx < 0) onIndexRef.current(Math.min(countRef.current - 1, indexRef.current + 1))
      else onIndexRef.current(Math.max(0, indexRef.current - 1))
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchend', onEnd)
    }
  }, [])

  const safeIndex = Math.min(Math.max(0, index), items.length - 1)
  const msg = items[safeIndex]
  if (!msg) return null

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[80] flex touch-none flex-col items-center justify-center bg-black/95"
      onClick={() => {
        // A swipe ends in a synthesized click: never let it close.
        if (Date.now() - lastSwipeAtRef.current < 350) return
        onClose()
      }}
    >
      <Tooltip label="Close" wrapperClassName="absolute right-4 top-4 z-10">
        <button
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-lg text-white"
        >
          ×
        </button>
      </Tooltip>
      {items.length > 1 && (
        <span className="absolute left-4 top-4 rounded-full bg-white/15 px-3 py-2 text-xs font-semibold text-white">
          {safeIndex + 1} / {items.length}
        </span>
      )}
      <div className="max-h-[82vh] w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
        <GallerySlide key={msg.id} msg={msg} />
      </div>
      {items.length > 1 && (
        <>
          <button
            aria-label="Previous photo"
            disabled={safeIndex === 0}
            onClick={(e) => {
              e.stopPropagation()
              onIndex(safeIndex - 1)
            }}
            className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-xl text-white disabled:opacity-30"
          >
            ‹
          </button>
          <button
            aria-label="Next photo"
            disabled={safeIndex === items.length - 1}
            onClick={(e) => {
              e.stopPropagation()
              onIndex(safeIndex + 1)
            }}
            className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-xl text-white disabled:opacity-30"
          >
            ›
          </button>
        </>
      )}
      <p className="px-6 pb-5 text-center text-[11px] text-white/50">
        We discourage screenshots, but no app can fully prevent them.
      </p>
    </div>
  )
}

/** Full screen chat media viewer (opened from the thread). */
export function MediaViewerOverlay({
  msg,
  onClose,
}: {
  msg: { id: string; media_url?: string | null; media_type?: string | null }
  onClose: () => void
}) {
  const url = useMediaUrl(msg.id, msg.media_url)
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/95"
      onClick={onClose}
    >
      <Tooltip label="Close" wrapperClassName="absolute right-4 top-4">
        <button
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-lg text-white"
        >
          ×
        </button>
      </Tooltip>
      <div className="max-h-[82vh] w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <div className="flex h-56 items-center justify-center text-sm text-white/60">
            Loading media…
          </div>
        ) : msg.media_type === 'video' ? (
          <video src={url} controls autoPlay className="max-h-[76vh] w-full rounded-2xl object-contain" />
        ) : (
          <img src={url} alt="" className="max-h-[76vh] w-full rounded-2xl object-contain" draggable={false} />
        )}
      </div>
      <p className="px-6 pb-5 text-center text-[11px] text-white/50">
        We discourage screenshots, but no app can fully prevent them.
      </p>
    </div>
  )
}
