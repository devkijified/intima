'use client'

import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'

/**
 * The pre-join preview: while a live feed slide is on screen,
 * this plays the room's actual video, muted, before the viewer
 * commits to joining, the way TikTok's feed lets you see what
 * is on first. It connects with a preview token (identity
 * marked #preview, no publish rights), so nobody in the room
 * is told anyone arrived and the viewer count does not move.
 * Tapping Watch drops the preview and joins for real.
 *
 * Only mounted for the active slide, and it disconnects when
 * the tab hides, so previews never stack up or eat data in
 * the background. Any failure simply leaves the cover photo.
 */
export function LivePreviewVideo({
  sessionId,
  hostId,
}: {
  sessionId: string
  hostId: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [live, setLive] = useState(false)
  const [pageHidden, setPageHidden] = useState(false)

  useEffect(() => {
    const onVis = () => setPageHidden(document.visibilityState === 'hidden')
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (pageHidden) return
    let cancelled = false
    let room: Room | null = null

    const attachHost = () => {
      if (!room) return
      room.remoteParticipants.forEach((p) => {
        if (p.identity !== hostId) return
        p.videoTrackPublications.forEach((pub) => {
          if (pub.track && videoRef.current) {
            pub.track.attach(videoRef.current)
            setLive(true)
          }
        })
      })
    }

    async function start() {
      try {
        const res = await fetch('/api/live/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, role: 'viewer', preview: true }),
        })
        if (!res.ok) return // gated room: the cover and the Join button carry it
        const { token, url } = (await res.json()) as { token: string; url: string }
        if (cancelled) return
        room = new Room({ adaptiveStream: true, dynacast: true })
        room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
          if (track.kind === Track.Kind.Audio) {
            // A preview is silent by design, and unsubscribing
            // keeps it light on data too.
            pub.setSubscribed(false)
            return
          }
          if (track.kind === Track.Kind.Video && participant.identity === hostId && videoRef.current) {
            track.attach(videoRef.current)
            setLive(true)
          }
        })
        await room.connect(url, token)
        if (cancelled) return
        attachHost() // the host was already publishing when we arrived
      } catch {
        /* the cover stays; joining is unaffected */
      }
    }

    void start()
    return () => {
      cancelled = true
      setLive(false)
      void room?.disconnect()
    }
  }, [sessionId, hostId, pageHidden])

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${live ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}
