'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CHAT_TEMPLATES, PROVIDER_QUICK_REPLIES } from '@/lib/chat/templates'
import ConnectionCare from '@/components/connections/ConnectionCare'
import { FanBadge } from '@/components/social/FanBadge'
import { Tooltip, HelpTip } from '@/components/ui/Tooltip'
import { IntimaLoader } from '@/components/shared/IntimaLoader'
import { formatCompactPrice, coinsWithNgn, ngnForCoins } from '@/lib/utils/helpers'
import { serviceTypeLabel } from '@/lib/connections/serviceType'
import { ArrowLeft, Send, Sparkles, Phone, Lock, Timer, X, Image as ImageIcon } from '@/lib/icons'
import { useSheetDrag } from '@/lib/hooks/useSheetDrag'
import { reencodeImage } from '@/lib/uploads/reencode'
import { showToast } from '@/lib/toast'
import {
  isPrivateMediaPath,
  noteMediaUnlocked,
  resolveMediaUrls,
  useMediaUrl,
  MediaGalleryOverlay,
} from '@/components/chat/MediaImage'

interface Msg {
  id: string
  sender_id: string
  body: string
  created_at: string
  media_url?: string | null
  media_type?: string | null
  ppv_price_coins?: number | null
  unlocked_by?: string[]
  expires_at?: string | null
  view_once?: boolean | null
  read_at?: string | null
}

interface Counterpart {
  id: string
  display_name: string | null
  avatar_url: string | null
  whatsapp_number: string | null
  isProvider: boolean
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** WhatsApp-style day separators between message groups. */
function dayKey(iso: string): string {
  return new Date(iso).toDateString()
}
function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (d.toDateString() === new Date().toDateString()) return 'Today'
  const y = new Date(Date.now() - 24 * 3600 * 1000)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Upload one chat media file into the private 'chat-media' bucket
 * (migration 052), under the sender's own folder. Images are
 * re-encoded first (EXIF stripped, capped size), like profile
 * photos. Returns the storage path stored on the message plus a
 * local object URL for the sender's own immediate render.
 *
 * The bucket deliberately has NO select policy (052), so the
 * client cannot mint signed URLs for it: an earlier version of
 * this helper tried, the sign call failed with a 400, and every
 * chat upload died AFTER the file had landed. Signed URLs come
 * from POST /api/chat/media-urls on the normal resolve path; the
 * object URL covers only this session's instant preview.
 */
async function uploadChatMedia(file: File): Promise<{ path: string; previewUrl: string }> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('not signed in')
  const isVideo = file.type.startsWith('video/')
  const blob: Blob = isVideo ? file : await reencodeImage(file)
  const ext = isVideo
    ? (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
    : blob.type === 'image/png'
      ? 'png'
      : 'jpg'
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
  const { error } = await supabase.storage.from('chat-media').upload(path, blob, {
    contentType: blob.type || file.type,
    upsert: false,
  })
  if (error) throw error
  return { path, previewUrl: URL.createObjectURL(blob) }
}

export default function ThreadPage() {
  const { id: connectionId } = useParams<{ id: string }>()
  const router = useRouter()
  const [me, setMe] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [other, setOther] = useState<Counterpart | null>(null)
  const [otherRating, setOtherRating] = useState<{ avg: number; count: number } | null>(null)
  const [connInfo, setConnInfo] = useState<{ feeNgn: number | null; feeState: string | null; disputeDeadline: string | null; serviceType: string | null; offerNgn: number | null } | null>(null)
  const [intakeAnswers, setIntakeAnswers] = useState<{ q: string; a: string }[]>([])
  const [viewerIsProvider, setViewerIsProvider] = useState(false)
  const [otherIsFan, setOtherIsFan] = useState(false)
  const [showIntake, setShowIntake] = useState(false)
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showPpv, setShowPpv] = useState(false)
  const [disappearing, setDisappearing] = useState(false)
  const [ppvPrice, setPpvPrice] = useState('100')
  const [ppvPreview, setPpvPreview] = useState<string | null>(null)
  const [ppvViewOnce, setPpvViewOnce] = useState(false)
  const [templateTab, setTemplateTab] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // WhatsApp-style composer: the typing pill grows with the text
  // up to a cap, then scrolls inside itself.
  useEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [input])

  // Media privacy (migration 044): who has viewed shared media.
  const [mediaViews, setMediaViews] = useState<{ message_id: string; viewer_id: string }[]>([])
  // The media gallery: every openable photo in the thread, in
  // order, with the position currently on screen. viewerMsg is
  // derived from these two, so the screenshot guard and the
  // overlay both key off whatever is actually being looked at.
  const [viewerItems, setViewerItems] = useState<Msg[]>([])
  const [viewerIndex, setViewerIndex] = useState(0)
  const viewerMsg = viewerItems[viewerIndex] ?? null
  const closeViewer = () => {
    setViewerItems([])
    setViewerIndex(0)
  }
  const [screenshotNotice, setScreenshotNotice] = useState(false)

  // Private chat media (migration 052): signed URLs resolved for
  // messages whose media_url is a chat-media storage path, keyed
  // by message id. Locked media the viewer has not unlocked never
  // appears here: the server refuses to mint one.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [sendingMedia, setSendingMedia] = useState(false)
  const [ppvPath, setPpvPath] = useState<string | null>(null)
  const mediaFileRef = useRef<HTMLInputElement>(null)
  const ppvFileRef = useRef<HTMLInputElement>(null)
  const ppvFileTypeRef = useRef('')
  const uploadUrlRef = useRef<string | null>(null)
  // Bottom sheets for templates and locked media: the app-wide
  // sheet pattern (drag handle, pull to dismiss), never boxed
  // cards floating over the thread.
  const templatesSheet = useSheetDrag(() => setShowTemplates(false))
  const ppvSheet = useSheetDrag(() => setShowPpv(false))

  // Record that I viewed their media. Best effort: the primary key
  // makes repeats harmless, and duplicate errors are ignored.
  const recordMediaView = async (msg: Msg) => {
    if (!me || msg.sender_id === me || !msg.media_url) return
    setMediaViews((prev) =>
      prev.some((v) => v.message_id === msg.id && v.viewer_id === me)
        ? prev
        : [...prev, { message_id: msg.id, viewer_id: me }]
    )
    try {
      await createClient()
        .from('media_views')
        .insert({ message_id: msg.id, viewer_id: me })
    } catch {
      // Duplicate or offline: the local state already reflects the view.
    }
  }

  // Opening media in the viewer counts as the view (this is also the
  // single allowed open for view-once media).
  const openMediaViewer = (msg: Msg) => {
    void recordMediaView(msg)
    // Opening the viewer is the sanctioned view for view-once
    // media, including a paid message the viewer just unlocked:
    // the signed URL endpoint may mint for this open.
    noteMediaUnlocked(msg.id)
    // The gallery is every photo in this conversation that is
    // open to me, in thread order, so swiping moves through the
    // conversation's media the way WhatsApp does. Locked items
    // are excluded outright (the server mints them no URL in
    // any case), regular videos stay inline in the thread, and
    // view-once items I have already opened are gone for good.
    const items = msgs.filter((m) => {
      if (!m.media_url) return false
      const mineM = m.sender_id === me
      const openM = mineM || (m.unlocked_by ?? []).includes(me ?? '') || (m.ppv_price_coins ?? 0) <= 0
      if (!openM) return false
      if (
        !mineM &&
        m.view_once &&
        mediaViews.some((v) => v.message_id === m.id && v.viewer_id === me)
      ) {
        return false
      }
      return m.view_once ? true : m.media_type !== 'video'
    })
    // The tapped item opened from a bubble that judged it open,
    // so it belongs in the gallery even if the list filter and
    // the bubble disagree for a moment (a just-recorded unlock).
    const withMsg = items.some((m) => m.id === msg.id)
      ? items
      : [...items, msg].sort((a, b) => a.created_at.localeCompare(b.created_at))
    setViewerItems(withMsg)
    setViewerIndex(Math.max(0, withMsg.findIndex((m) => m.id === msg.id)))
  }

  // Moving inside the gallery. Landing on an item is its view:
  // the view is recorded, and the signed URL endpoint may mint
  // for it. Leaving a view-once item that is not mine consumes
  // it: it drops out of the gallery, exactly as it drops out of
  // the thread once opened.
  const handleViewerIndex = (next: number) => {
    const target = viewerItems[next]
    if (!target) return
    void recordMediaView(target)
    noteMediaUnlocked(target.id)
    const current = viewerItems[viewerIndex]
    if (current && current.id !== target.id && current.view_once && current.sender_id !== me) {
      const remaining = viewerItems.filter((m) => m.id !== current.id)
      setViewerItems(remaining)
      setViewerIndex(Math.max(0, remaining.findIndex((m) => m.id === target.id)))
      return
    }
    setViewerIndex(next)
  }

  // Screenshot deterrent while the viewer is open: a PrintScreen
  // keypress or the window losing focus closes the viewer and leaves
  // a notice in the thread. This deters casual captures only; the
  // viewer footer says so honestly.
  useEffect(() => {
    if (!viewerMsg) return
    const flagAttempt = () => {
      closeViewer()
      setScreenshotNotice(true)
      setTimeout(() => setScreenshotNotice(false), 5000)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') flagAttempt()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', flagAttempt)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', flagAttempt)
    }
  }, [viewerMsg])

  useEffect(() => {
    let live = true
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      if (live) setMe(user.id)

      const { data: conn } = await supabase
        .from('connections')
        .select('id, client_id, provider_id, status, fee_ngn, fee_state, dispute_deadline, intake_answers, service_type, proposed_rate_ngn')
        .eq('id', connectionId)
        .single()
      if (!conn || (conn.client_id !== user.id && conn.provider_id !== user.id)) {
        router.replace('/messages'); return
      }
      if (live) {
        setActive(conn.status === 'active')
        setConnInfo({
          feeNgn: conn.fee_ngn ?? null,
          feeState: conn.fee_state ?? null,
          disputeDeadline: conn.dispute_deadline ?? null,
          serviceType: (conn as { service_type?: string | null }).service_type ?? null,
          offerNgn: (conn as { proposed_rate_ngn?: number | null }).proposed_rate_ngn ?? null,
        })
        setViewerIsProvider(conn.provider_id === user.id)
        const rawAnswers = (conn as { intake_answers?: unknown }).intake_answers
        setIntakeAnswers(
          Array.isArray(rawAnswers)
            ? rawAnswers
                .filter(
                  (x): x is { q: string; a: string } =>
                    !!x && typeof x === 'object' && typeof (x as { q?: unknown }).q === 'string' && typeof (x as { a?: unknown }).a === 'string'
                )
                .slice(0, 3)
            : []
        )
      }

      const otherId = conn.client_id === user.id ? conn.provider_id : conn.client_id

      // Fan badge: when the viewer is the provider, check whether the
      // client has an effective fan club subscription to her.
      if (conn.provider_id === user.id) {
        try {
          const res = await fetch(
            `/api/subscriptions/subscribers?provider_id=${encodeURIComponent(user.id)}`
          )
          if (res.ok) {
            const j = await res.json()
            if (live && Array.isArray(j.subscriberIds) && j.subscriberIds.includes(otherId)) {
              setOtherIsFan(true)
            }
          }
        } catch { /* badge is best effort */ }
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, whatsapp_number, role')
        .eq('id', otherId)
        .single()
      if (live && prof) {
        setOther({
          id: otherId,
          display_name: prof.display_name,
          avatar_url: prof.avatar_url,
          // WhatsApp only revealed on an ACTIVE (paid) connection.
          whatsapp_number: conn.status === 'active' ? (prof.whatsapp_number ?? null) : null,
          isProvider: prof.role === 'model',
        })
      }

      // Their published rating, so both sides see who they are dealing
      // with (the Bybit habit). RLS only returns published reviews.
      const { data: theirReviews } = await supabase
        .from('reviews')
        .select('rating')
        .eq('reviewee_id', otherId)
        .eq('status', 'published')
      if (live && theirReviews && theirReviews.length > 0) {
        const avg = theirReviews.reduce((s, r) => s + (r.rating ?? 0), 0) / theirReviews.length
        setOtherRating({ avg: Math.round(avg * 10) / 10, count: theirReviews.length })
      }

      const { data: history } = await supabase
        .from('messages')
        .select('id, sender_id, body, created_at, media_url, media_type, ppv_price_coins, unlocked_by, view_once, read_at')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: true })
      const fresh = (history ?? []).filter((m: any) => !m.expires_at || new Date(m.expires_at).getTime() > Date.now())
      if (live) { setMsgs(fresh as Msg[]); setLoading(false) }

      // Media view state for this thread: drives my view-once blur
      // and the sender side Seen labels. RLS returns only rows I am
      // allowed to see (my own views, plus views of my media).
      // Resolve signed URLs for private chat media in one batch.
      // The server only mints for media I may actually view, so a
      // locked PPV message stays URL-less here by design.
      const privateIds = (fresh as Msg[])
        .filter((m) => isPrivateMediaPath(m.media_url))
        .map((m) => m.id)
      if (privateIds.length > 0) {
        const urls = await resolveMediaUrls(privateIds)
        if (live) setSignedUrls((prev) => ({ ...prev, ...urls }))
      }

      const mediaIds = (fresh as Msg[]).filter((m) => m.media_url).map((m) => m.id)
      if (mediaIds.length > 0) {
        const { data: views } = await supabase
          .from('media_views')
          .select('message_id, viewer_id')
          .in('message_id', mediaIds)
        if (live && views) {
          setMediaViews(views as { message_id: string; viewer_id: string }[])
        }
      }
      // Mark their messages as read (best effort; read_at drives unread badges).
      supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('connection_id', connectionId)
        .neq('sender_id', user.id)
        .is('read_at', null)
        .then(() => {})

      // Realtime: new messages in this thread, plus read flips so
      // the sender's Seen lands live.
      const channel = supabase
        .channel(`thread-${connectionId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `connection_id=eq.${connectionId}` },
          (payload) => {
            const m = payload.new as Msg
            if (m.expires_at && new Date(m.expires_at).getTime() <= Date.now()) return
            // Private media paths never travel through realtime to
            // the other side: the receiving component resolves its
            // own signed URL from the id alone, and the server
            // refuses when the media is locked and unpaid.
            if (isPrivateMediaPath(m.media_url) && m.sender_id !== user.id) m.media_url = null
            if (m.sender_id !== user.id) {
              // The thread is open on my screen: this message is
              // read the moment it lands. Mark it (policy 085 lets
              // a party update read_at on messages sent to them)
              // so the badges agree with what I am looking at.
              m.read_at = new Date().toISOString()
              supabase
                .from('messages')
                .update({ read_at: m.read_at })
                .eq('id', m.id)
                .is('read_at', null)
                .then(() => {})
            }
            if (live) setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `connection_id=eq.${connectionId}` },
          (payload) => {
            const m = payload.new as Msg
            if (live) {
              setMsgs((prev) =>
                prev.map((x) => (x.id === m.id ? { ...x, read_at: m.read_at ?? x.read_at } : x))
              )
            }
          }
        )
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    })()
    return () => { live = false }
  }, [connectionId, router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  // Photos and videos grow their bubbles when they finish
  // loading, after the scroll above has already run, which
  // left the newest bubble's tail clipped under the composer.
  // While the reader is at (or near) the bottom, re-pin on
  // every media load.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onLoad = (e: Event) => {
      const t = e.target as HTMLElement | null
      if (!t || (t.tagName !== 'IMG' && t.tagName !== 'VIDEO')) return
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 180
      if (nearBottom) bottomRef.current?.scrollIntoView()
    }
    el.addEventListener('load', onLoad, true)
    return () => el.removeEventListener('load', onLoad, true)
  }, [])

  const send = async (body: string) => {
    const text = body.trim()
    if (!text || !me || sending || !active) return
    setSending(true)
    const supabase = createClient()
    const { data: row, error } = await supabase.from('messages').insert({
      connection_id: connectionId,
      sender_id: me,
      body: text.slice(0, 1000),
      ...(disappearing ? { expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString() } : {}),
    }).select('id, sender_id, body, created_at, media_url, media_type, ppv_price_coins, unlocked_by, view_once, read_at').single()
    setSending(false)
    if (!error) {
      // Show the message immediately from the insert result. Relying on
      // the realtime echo alone made sends look lost (the echo can lag
      // or miss), which invited duplicate retries. The realtime handler
      // dedupes by id, so appending here is safe.
      if (row) {
        const m = row as Msg
        setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      }
      setInput('')
      setShowTemplates(false)
      // Push the other side (best effort): a message nobody hears about
      // until they happen to open the app is a message half delivered.
      if (other?.id) {
        void fetch('/api/push/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_ids: [other.id],
            type: 'booking_message',
            title: 'New message',
            body: text.slice(0, 80),
            link: `/messages/${connectionId}`,
          }),
        }).catch(() => {})
      }
    }
  }

  // Send a free photo or video: upload to the private bucket,
  // then insert the message with the storage path.
  const uploadAndSendMedia = async (file: File) => {
    if (!me || uploading || !active) return
    if (file.size > 50 * 1024 * 1024) {
      showToast('That file is too large. Please keep media under 50MB.')
      return
    }
    setUploading(true)
    try {
      const { path, previewUrl } = await uploadChatMedia(file)
      const supabase = createClient()
      const { data: row, error } = await supabase
        .from('messages')
        .insert({
          connection_id: connectionId,
          sender_id: me,
          body: file.type.startsWith('video/') ? 'Video' : 'Photo',
          media_url: path,
          media_type: file.type.startsWith('video/') ? 'video' : 'image',
          ...(disappearing
            ? { expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }
            : {}),
        })
        .select('id, sender_id, body, created_at, media_url, media_type, ppv_price_coins, unlocked_by, view_once, read_at')
        .single()
      if (!error && row) {
        const m = row as Msg
        // Own upload: show it at once with the local preview URL
        // instead of waiting for a resolution round trip. The
        // server-minted signed URL takes over on the next resolve.
        setSignedUrls((prev) => ({ ...prev, [m.id]: previewUrl }))
        setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
        if (other?.id) {
          void fetch('/api/push/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_ids: [other.id],
              type: 'booking_message',
              title: 'New media',
              body: 'You received media in your chat.',
              link: `/messages/${connectionId}`,
            }),
          }).catch(() => {})
        }
      }
    } catch {
      showToast('Upload failed. Please try again.')
    }
    setUploading(false)
  }

  // Upload a file as the PPV attachment: it lands in the private
  // bucket and the panel holds its path until Send locked.
  const uploadPpvFile = async (file: File) => {
    if (!me || uploading) return
    if (file.size > 50 * 1024 * 1024) {
      showToast('That file is too large. Please keep media under 50MB.')
      return
    }
    setUploading(true)
    try {
      const { path, previewUrl } = await uploadChatMedia(file)
      ppvFileTypeRef.current = file.type
      uploadUrlRef.current = previewUrl
      setPpvPreview(previewUrl)
      setPpvPath(path)
    } catch {
      showToast('Upload failed. Please try again.')
    }
    setUploading(false)
  }

  // Send the locked message with the uploaded private file. There
  // is deliberately no paste-a-URL path: locked media lives in the
  // private bucket, so nothing about it can leak or hotlink.
  const sendPpv = async () => {
    const price = parseInt(ppvPrice, 10)
    if (!price || price <= 0 || !me || sendingMedia) return
    const path = ppvPath
    if (!path) return
    setSendingMedia(true)
    const isVideo = ppvFileTypeRef.current.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(path)
    const { data: row, error } = await createClient()
      .from('messages')
      .insert({
        connection_id: connectionId,
        sender_id: me,
        body: 'Locked media',
        media_url: path,
        media_type: isVideo ? 'video' : 'image',
        ppv_price_coins: price,
        view_once: ppvViewOnce,
      })
      .select('id, sender_id, body, created_at, media_url, media_type, ppv_price_coins, unlocked_by, view_once, read_at')
      .single()
    setSendingMedia(false)
    if (!error) {
      if (row) {
        const m = row as Msg
        if (uploadUrlRef.current) {
          const upUrl = uploadUrlRef.current
          setSignedUrls((prev) => ({ ...prev, [m.id]: upUrl }))
        }
        setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      }
      uploadUrlRef.current = null
      setPpvPreview(null)
      setPpvViewOnce(false)
      setPpvPath(null)
      setShowPpv(false)
      if (other?.id) {
        void fetch('/api/push/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_ids: [other.id],
            type: 'booking_message',
            title: 'New locked media',
            body: 'You received locked media in your chat.',
            link: `/messages/${connectionId}`,
          }),
        }).catch(() => {})
      }
    }
  }

  const templates = CHAT_TEMPLATES
  // Provider quick replies belong to whoever is THIS connection's
  // provider, decided by the connection row, never by the other
  // person's account role.
  const quickReplies = viewerIsProvider ? PROVIDER_QUICK_REPLIES : null

  return (
    // Full screen on mobile, WhatsApp style: the thread covers
    // the whole viewport edge to edge, so no shell background
    // band sits under the composer. Desktop keeps the in-shell
    // column it has always had.
    <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-[#efe7db] lg:relative lg:inset-auto lg:z-auto lg:-mx-6 lg:-my-8 lg:h-full lg:min-h-0">
      {/* Header */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-neutral-100 bg-white px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <Tooltip label="Back" side="bottom" align="start">
          <button onClick={() => router.back()} aria-label="Back" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-cream">
            <ArrowLeft className="h-5 w-5 text-charcoal" />
          </button>
        </Tooltip>
        {other?.avatar_url ? (
          <img src={other.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cream font-display text-neutral-400">
            {(other?.display_name?.[0] ?? '?').toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-charcoal">
            {other?.display_name ?? 'Member'}
            {otherIsFan && <FanBadge className="ml-1.5" />}
          </p>
          <p className={`text-xs ${!loading && active ? 'text-emerald-600' : 'text-neutral-400'}`}>
            {loading ? 'Loading…' : active ? 'Connection active' : 'Connection not active'}
            {otherRating && (
              <span className="text-neutral-500"> · ★ {otherRating.avg} ({otherRating.count} review{otherRating.count === 1 ? '' : 's'})</span>
            )}
          </p>
        </div>
        {other?.whatsapp_number && (
          <a
            href={`https://wa.me/${other.whatsapp_number.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15"
          >
            <Phone className="h-5 w-5 text-[#128C4B]" />
          </a>
        )}
      </div>

      {/* Fee protection + double-blind reviews */}
      {active && connInfo && (
        <ConnectionCare
          connectionId={connectionId}
          feeState={connInfo.feeState}
          disputeDeadline={connInfo.disputeDeadline}
          feeNgn={connInfo.feeNgn}
          otherName={other?.display_name ?? 'them'}
          viewerIsClient={!viewerIsProvider}
        />
      )}

      {/* What they want, plus screening answers: providers only, so
          she can see the intent and screen before chatting */}
      {viewerIsProvider && (intakeAnswers.length > 0 || serviceTypeLabel(connInfo?.serviceType) !== null || connInfo?.offerNgn != null) && (
        <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col items-center px-3 pt-2">
          <button
            onClick={() => setShowIntake((v) => !v)}
            className="flex w-fit max-w-full items-center gap-2 rounded-lg bg-white/90 px-2.5 py-1.5 shadow-sm"
            aria-expanded={showIntake}
          >
            <span className="text-xs font-semibold text-charcoal">
              {intakeAnswers.length > 0 ? 'Client answers' : 'Their request'}
            </span>
            <span className="text-xs font-semibold text-primary">{showIntake ? 'Hide' : 'View'}</span>
          </button>
          {showIntake && (
            <div className="mt-1.5 w-full space-y-2.5 rounded-2xl bg-white px-4 py-3 shadow-sm">
              {(serviceTypeLabel(connInfo?.serviceType) !== null || connInfo?.offerNgn != null) && (
                <div className="rounded-xl bg-primary/5 px-3 py-2.5">
                  <p className="text-sm text-charcoal">
                    {serviceTypeLabel(connInfo?.serviceType) !== null && (
                      <>Wants: <strong>{serviceTypeLabel(connInfo?.serviceType)}</strong></>
                    )}
                    {connInfo?.offerNgn != null && (
                      <>
                        {serviceTypeLabel(connInfo?.serviceType) !== null ? ' · ' : ''}
                        Offer: <strong>{formatCompactPrice(connInfo.offerNgn)}</strong>
                      </>
                    )}
                  </p>
                </div>
              )}
              {intakeAnswers.map((item, i) => (
                <div key={i} className="rounded-xl bg-cream/70 px-3 py-2.5">
                  <p className="text-xs font-semibold text-neutral-500">{item.q}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-charcoal">{item.a}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages: WhatsApp layout. Warm beige ground, white
          bubbles in, burgundy bubbles out, day pills between
          days, time inside the bubble. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div data-page-loader className="flex h-full items-center justify-center">
            <IntimaLoader size="lg" />
          </div>
        ) : msgs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-display text-lg font-semibold text-charcoal">Say hello</p>
            <p className="mt-1 max-w-xs text-sm text-neutral-500">
              Pick a template below to start the conversation. Keep it respectful.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
            {msgs.map((m, i) => {
              const mine = m.sender_id === me
              const showDay = i === 0 || dayKey(msgs[i - 1].created_at) !== dayKey(m.created_at)
              // Read state is read_at (policy 085 made marking
              // possible at last); media views still count for
              // legacy rows that predate receipts.
              const seen =
                mine &&
                (!!m.read_at ||
                  (!!m.media_url &&
                    mediaViews.some((v) => v.message_id === m.id && v.viewer_id !== me)))
              // A media message with no real caption hugs its
              // media, WhatsApp style: a thin frame, no padded
              // card around the photo.
              const mediaOnly =
                !!m.media_url &&
                (!m.body.trim() ||
                  m.body === 'Locked media' ||
                  m.body === 'Photo' ||
                  m.body === 'Video')
              return (
                <Fragment key={m.id}>
                  {showDay && (
                    <div className="flex justify-center py-1.5">
                      <span className="rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-medium text-neutral-500 shadow-sm">
                        {dayLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={
                        mediaOnly
                          ? `w-[78%] max-w-[290px] overflow-hidden rounded-xl p-[3px] shadow-sm ${
                              mine ? 'rounded-tr-sm bg-primary text-white' : 'rounded-tl-sm bg-white text-charcoal'
                            }`
                          : `max-w-[82%] rounded-xl px-2.5 pb-1.5 pt-2 text-[15px] leading-relaxed shadow-sm ${
                              mine
                                ? 'rounded-tr-sm bg-primary text-white'
                                : 'rounded-tl-sm bg-white text-charcoal'
                            }`
                      }
                    >
                      {!mediaOnly && m.body.trim() && m.body !== 'Locked media' ? (
                        <p className="whitespace-pre-wrap px-1">{m.body}</p>
                      ) : null}
                      {m.media_url && (
                        <div className={mediaOnly ? '' : 'mt-2'}>
                          <PpvMedia
                            msg={m}
                            me={me}
                            hasViewed={mediaViews.some((v) => v.message_id === m.id && v.viewer_id === me)}
                            onOpen={openMediaViewer}
                            onViewed={recordMediaView}
                            signedUrl={signedUrls[m.id]}
                          />
                        </div>
                      )}
                      <p className={`text-right text-[11px] leading-none ${mediaOnly ? 'px-1.5 pb-1 pt-1' : 'mt-0.5 px-1'} ${mine ? 'text-white/70' : 'text-neutral-400'}`}>
                        {fmtTime(m.created_at)}
                        {seen && <span className="font-semibold text-sky-200"> · Seen</span>}
                      </p>
                    </div>
                  </div>
                </Fragment>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {screenshotNotice && (
        <div className="shrink-0 border-t border-amber-100 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-700">
          Screenshot attempt detected. Shared media is private between you two.
        </div>
      )}

      {/* Templates sheet (Lagos Life style phrases): a bottom
          sheet like every other sheet in the app, not a boxed card
          over the thread. Tapping a phrase sends it and the sheet
          closes (send() handles that). */}
      {showTemplates && active && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/50" onPointerDown={() => setShowTemplates(false)} />
          <div
            ref={templatesSheet.sheetRef}
            className="absolute inset-x-0 bottom-0 flex max-h-[72%] flex-col rounded-t-3xl bg-white shadow-2xl"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div {...templatesSheet.handleProps} className="shrink-0 cursor-grab touch-none px-4 pb-1 pt-2.5 active:cursor-grabbing">
              <div className="mx-auto h-1.5 w-11 rounded-full bg-neutral-300" />
              <div className="mt-2.5 flex items-center justify-between">
                <p className="font-display text-base font-semibold text-charcoal">Templates</p>
                <button
                  type="button"
                  aria-label="Close templates"
                  onClick={() => setShowTemplates(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-cream text-neutral-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-2 pt-1">
              {templates.map((g, i) => (
                <button
                  key={g.id}
                  onClick={() => setTemplateTab(i)}
                  className={`flex min-h-[40px] shrink-0 items-center rounded-full px-4 py-1.5 text-xs font-semibold ${
                    templateTab === i ? 'bg-charcoal text-white' : 'bg-cream text-neutral-600'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              <div className="divide-y divide-neutral-100">
                {templates[templateTab].phrases.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    disabled={sending}
                    className="flex min-h-[52px] w-full items-center px-3 py-2.5 text-left text-[15px] text-charcoal transition-colors active:bg-cream disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
              {quickReplies && (
                <>
                  <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Quick replies
                  </p>
                  <div className="divide-y divide-neutral-100">
                    {quickReplies.map((p) => (
                      <button
                        key={p}
                        onClick={() => send(p)}
                        disabled={sending}
                        className="flex min-h-[52px] w-full items-center px-3 py-2.5 text-left text-[15px] text-charcoal transition-colors active:bg-cream disabled:opacity-50"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Locked media sheet: the app-standard bottom sheet.
          Pick, preview, price, send. Files live in the private
          bucket only, so there is no paste-a-URL path. */}
      {showPpv && active && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/50" onPointerDown={() => setShowPpv(false)} />
          <div
            ref={ppvSheet.sheetRef}
            className="absolute inset-x-0 bottom-0 flex max-h-[80%] flex-col overflow-y-auto rounded-t-3xl bg-white shadow-2xl"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div {...ppvSheet.handleProps} className="shrink-0 cursor-grab touch-none px-4 pb-1 pt-2.5 active:cursor-grabbing">
              <div className="mx-auto h-1.5 w-11 rounded-full bg-neutral-300" />
              <div className="mt-2.5 flex items-center justify-between">
                <p className="flex items-center gap-1.5 font-display text-base font-semibold text-charcoal">
                  Send locked media
                  <HelpTip text="Locked media stays hidden until the other person pays your price in coins, once. Mark it view once and it can only be opened a single time before it disappears." />
                </p>
                <button
                  type="button"
                  aria-label="Close locked media"
                  onClick={() => setShowPpv(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-cream text-neutral-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-3 px-4 pt-2">
              {ppvPath ? (
                <div>
                  {ppvPreview && ppvFileTypeRef.current.startsWith('video/') ? (
                    <video src={ppvPreview} className="h-44 w-full rounded-2xl object-cover" muted playsInline />
                  ) : ppvPreview ? (
                    <img src={ppvPreview} alt="" className="h-44 w-full rounded-2xl object-cover" draggable={false} />
                  ) : (
                    <div className="flex h-44 w-full items-center justify-center rounded-2xl bg-cream text-sm font-medium text-neutral-500">
                      {ppvPath.split('/').pop()}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{ppvPath.split('/').pop()}</span>
                    <button
                      onClick={() => {
                        setPpvPath(null)
                        setPpvPreview(null)
                        uploadUrlRef.current = null
                      }}
                      className="shrink-0 text-sm font-semibold text-primary"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => ppvFileRef.current?.click()}
                  disabled={uploading}
                  className="flex min-h-[104px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl bg-cream text-charcoal disabled:opacity-50"
                >
                  <ImageIcon className="h-6 w-6 text-neutral-500" />
                  <span className="text-sm font-semibold">{uploading ? 'Uploading…' : 'Choose a photo or video'}</span>
                  <span className="px-6 text-center text-[11px] leading-snug text-neutral-500">
                    It stays private until the client unlocks it
                  </span>
                </button>
              )}
              <div className="flex items-center gap-3">
                <div className="w-32 shrink-0">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400" htmlFor="ppv-price">
                    Price in coins
                  </label>
                  <input
                    id="ppv-price"
                    value={ppvPrice}
                    onChange={(e) => setPpvPrice(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="100"
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl bg-cream px-3 py-2.5 text-base text-charcoal outline-none focus:ring-2 focus:ring-gold/60 md:text-sm"
                  />
                </div>
                <p className="pt-4 text-xs leading-snug text-neutral-500">
                  {Number(ppvPrice) > 0
                    ? <>Unlock price: <span className="font-semibold text-charcoal">{coinsWithNgn(Number(ppvPrice))}</span></>
                    : 'Set the price the client pays to open it.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPpvViewOnce((v) => !v)}
                aria-pressed={ppvViewOnce}
                className="flex min-h-[48px] items-center justify-between gap-3 py-1 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold text-charcoal">View once</span>
                  <span className="block text-xs text-neutral-500">It disappears after the client opens it once</span>
                </span>
                <span className={`flex h-7 w-12 shrink-0 items-center rounded-full px-1 transition-colors ${ppvViewOnce ? 'justify-end bg-primary' : 'justify-start bg-neutral-200'}`}>
                  <span className="h-5 w-5 rounded-full bg-white shadow" />
                </span>
              </button>
              <button
                onClick={sendPpv}
                disabled={sendingMedia || uploading || !ppvPath}
                className="min-h-[50px] w-full rounded-full bg-gold px-4 py-3 text-sm font-bold text-charcoal disabled:opacity-50"
              >
                {sendingMedia ? 'Sending…' : 'Send locked'}
              </button>
              <p className="text-center text-[11px] leading-snug text-neutral-500">
                Clients pay coins to view. You keep your share automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hidden pickers for the attach button and the PPV panel */}
      <input
        ref={mediaFileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void uploadAndSendMedia(f)
        }}
      />
      <input
        ref={ppvFileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void uploadPpvFile(f)
        }}
      />

      {/* Composer: the WhatsApp bar. One white typing pill with
          the actions inside it, and a round send button beside
          it, floating on the chat background. */}
      <div className="shrink-0 px-3 pb-3 pt-1">
        {!loading && !active && (
          <p className="mx-auto mb-2 w-fit max-w-full rounded-full bg-amber-100 px-3.5 py-1.5 text-center text-xs font-medium text-amber-800">
            This connection is not active. Chat unlocks after payment.
          </p>
        )}
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <div className="flex min-w-0 flex-1 items-end rounded-[26px] bg-white px-1 py-1 shadow-sm ring-1 ring-black/[0.04]">
            <button
              onClick={() => setShowTemplates((v) => !v)}
              disabled={!active}
              aria-label="Message templates"
              className={`flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full transition-colors ${
                showTemplates ? 'bg-gold/20' : 'hover:bg-cream'
              } disabled:opacity-40`}
            >
              <Sparkles className="h-5 w-5 text-gold" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              placeholder={active ? 'Message' : 'Chat locked'}
              disabled={!active || sending}
              maxLength={1000}
              rows={1}
              className="max-h-[120px] min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2.5 text-base leading-snug text-charcoal outline-none placeholder:text-neutral-400 disabled:opacity-50 md:text-sm"
            />
            <button
              onClick={() => setDisappearing((v) => !v)}
              aria-label="Disappearing messages"
              title="Disappearing messages (24h)"
              className={`flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full transition-colors ${disappearing ? 'bg-primary/15' : 'hover:bg-cream'} disabled:opacity-40`}
            >
              <Timer className={`h-[18px] w-[18px] ${disappearing ? 'text-primary' : 'text-neutral-500'}`} />
            </button>
            <button
              onClick={() => mediaFileRef.current?.click()}
              disabled={!active || uploading}
              aria-label="Attach a photo or video"
              className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full transition-colors hover:bg-cream disabled:opacity-40"
            >
              <ImageIcon className="h-5 w-5 text-neutral-500" />
            </button>
            {viewerIsProvider && active && (
              <button
                onClick={() => setShowPpv((v) => !v)}
                aria-label="Send locked media"
                className={`flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full transition-colors ${showPpv ? 'bg-gold/25' : 'hover:bg-gold/10'}`}
              >
                <Lock className="h-[18px] w-[18px] text-gold" />
              </button>
            )}
          </div>
          <button
            onClick={() => send(input)}
            disabled={!active || sending || !input.trim()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-md transition-opacity disabled:opacity-40"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        {disappearing && active && (
          <p className="mt-1.5 text-center text-[11px] font-medium text-neutral-500">
            Disappearing messages on: what you send vanishes after 24 hours
          </p>
        )}
      </div>

      {/* Media viewer overlay: the one place shared media opens big.
          PrintScreen or a window blur closes it (see effect above).
          Private media renders through the signed URL overlay, so
          the raw value on the message is never a usable address. */}
      {viewerMsg && viewerMsg.media_url && (
        <MediaGalleryOverlay
          items={viewerItems}
          index={viewerIndex}
          onIndex={handleViewerIndex}
          onClose={closeViewer}
        />
      )}
    </div>
  )
}

/** Locked media in chat: unlock with coins via the server. */
function PpvMedia({
  msg,
  me,
  hasViewed,
  signedUrl,
  onOpen,
  onViewed,
}: {
  msg: Msg
  me: string | null
  hasViewed: boolean
  signedUrl?: string | null
  onOpen: (msg: Msg) => void
  onViewed: (msg: Msg) => void
}) {
  const [busy, setBusy] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [retry, setRetry] = useState(0)
  const price = msg.ppv_price_coins ?? 0
  const isMine = msg.sender_id === me
  const isOpen = isMine || unlocked || (msg.unlocked_by ?? []).includes(me ?? '') || price <= 0

  // Resolve the display URL only once the media is open to me. A
  // locked message is never even asked about, so nothing usable
  // exists in the payload, the DOM, or this component's state.
  // The thread may already hold a signed URL (batch resolve on
  // load, or the upload-time URL for my own sends); the hook
  // covers realtime arrivals and post-unlock retries.
  const resolved = useMediaUrl(msg.id, isOpen ? msg.media_url : null, retry)
  const url = signedUrl ?? resolved

  async function unlock() {
    if (busy) return
    setBusy(true)
    const res = await fetch('/api/chat/ppv/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: msg.id }),
    })
    setBusy(false)
    if (res.ok) {
      setUnlocked(true)
      // The unlock is recorded server-side now, so the signed URL
      // endpoint may mint for this message: note it locally (the
      // viewer exemption below needs it too) and re-resolve.
      noteMediaUnlocked(msg.id)
      setRetry((n) => n + 1)
      // Unlocking is the view for paid media: record it for the
      // sender. View-once media opens in the viewer instead, so the
      // single allowed open is a real look, not just the unlock.
      if (msg.view_once) {
        onOpen(msg)
      } else {
        onViewed(msg)
      }
    } else if (res.status === 402) {
      showToast(`Not enough coins. You need ${coinsWithNgn(price)}. Top up from Coins.`)
    } else {
      showToast('Could not unlock. Please try again.')
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={unlock}
        disabled={busy}
        className="relative block h-44 w-full overflow-hidden rounded-xl bg-neutral-800 text-left"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 backdrop-blur-md">
          <span className="text-sm font-semibold text-white">Locked {msg.media_type === 'video' ? 'video' : 'photo'}</span>
          <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-charcoal">
            {busy ? 'Unlocking…' : `Unlock · ${price.toLocaleString()} coins`}
          </span>
          <span className="text-[11px] font-medium text-white/70">≈ {ngnForCoins(price)}</span>
          <span className="px-6 text-center text-[11px] leading-snug text-white/75">
            {msg.view_once ? 'Pay once to unlock. View once media disappears after you open it.' : 'Pay once to unlock, and it stays open for you.'}
          </span>
        </div>
      </button>
    )
  }

  // View-once, already opened by me: gone for good. No media
  // element at all, so there is nothing left to reopen or scrape.
  // The sender keeps her normal view of her own media below.
  if (!isMine && msg.view_once && hasViewed) {
    return (
      <div className="relative flex h-44 w-full items-center justify-center overflow-hidden rounded-xl bg-neutral-800 px-4 text-center">
        <span className="text-xs font-semibold text-white">
          Already viewed. View once media can only be opened once.
        </span>
      </div>
    )
  }

  // View-once, not opened yet: a deliberate tap is the one open, so
  // loading the thread never burns it. Legacy public media keeps
  // its blurred backdrop; private media shows a plain card, since
  // no URL for it exists on this device until it is opened.
  if (!isMine && msg.view_once && !hasViewed) {
    const legacy = typeof msg.media_url === 'string' && msg.media_url.startsWith('http')
    return (
      <button
        onClick={() => onOpen(msg)}
        className="relative block h-44 w-full overflow-hidden rounded-xl bg-neutral-800 text-left"
      >
        {legacy &&
          (msg.media_type === 'video' ? (
            <video src={msg.media_url!} className="h-full w-full object-cover blur-xl" muted playsInline />
          ) : (
            <img src={msg.media_url!} alt="" className="h-full w-full object-cover blur-xl" draggable={false} />
          ))}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45">
          <span className="text-sm font-semibold text-white">View once</span>
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-charcoal">
            Tap to open
          </span>
        </div>
      </button>
    )
  }

  if (!url) {
    return (
      <div className="flex h-44 w-full items-center justify-center rounded-xl bg-neutral-800">
        <span className="text-xs font-medium text-white/60">Loading media…</span>
      </div>
    )
  }

  if (msg.media_type === 'video') {
    return (
      <video
        src={url}
        controls
        onPlay={() => onViewed(msg)}
        className="max-h-72 w-full rounded-xl object-cover"
      />
    )
  }
  return (
    <img
      src={url}
      alt=""
      onClick={() => onOpen(msg)}
      className="max-h-72 w-full cursor-pointer rounded-xl object-cover"
      draggable={false}
    />
  )
}
