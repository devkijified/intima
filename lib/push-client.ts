'use client'

// Client-side Web Push subscription helpers.

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'available'

// iOS Safari only supports Web Push for web apps added to the Home
// Screen (iOS 16.4+, Apple restriction). Desktop and Android browsers
// get push without any install.
export function isIos(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true
  // iPadOS 13+ reports as Macintosh; detect via touch points.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
  } catch { /* ignore */ }
  return (navigator as unknown as { standalone?: boolean }).standalone === true
}

// True when push cannot work yet on this device: an iPhone/iPad running
// in the browser instead of the installed Home Screen app.
export function iosNeedsInstall(): boolean {
  return isIos() && !isStandalone()
}

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'subscribed' : 'available'
  } catch {
    return 'unsupported'
  }
}

export type PushSubscribeReason = 'ok' | 'unsupported' | 'no-key' | 'denied' | 'failed'

export async function subscribePush(): Promise<{ ok: boolean; reason: PushSubscribeReason }> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, reason: 'unsupported' }
    }
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    // Missing VAPID key = server was deployed without push configured.
    // Say so honestly instead of failing silently.
    if (!vapid) return { ok: false, reason: 'no-key' }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: 'denied' }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    })
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
    return res.ok ? { ok: true, reason: 'ok' } : { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

export async function unsubscribePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe().catch(() => {})
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {})
    }
  } catch {
    // Best effort.
  }
}
