'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { reencodeImage } from '@/lib/uploads/reencode'
import { Camera, Loader2, Trash2 } from '@/lib/icons'

const BUCKET = 'profile-photos'
const MAX_BYTES = 10 * 1024 * 1024

function extForBlob(blob: Blob, fallbackName: string): string {
  if (blob.type === 'image/png') return 'png'
  if (blob.type === 'image/jpeg') return 'jpg'
  if (blob.type === 'image/webp') return 'webp'
  if (blob.type === 'image/gif') return 'gif'
  return (fallbackName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
}

async function uploadPhoto(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  if (file.size > MAX_BYTES) throw new Error('That photo is too large. Please keep each photo under 10MB.')
  const supabase = createClient()
  // Re-encode before upload: this strips EXIF (including location) and
  // caps the image at 1600px on its longest side. The size and type
  // guards above apply to the original file, as picked.
  const blob = await reencodeImage(file)
  const ext = extForBlob(blob, file.name)
  const path = `${userId}/photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

function storagePathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + marker.length))
}

async function deletePhoto(url: string) {
  const path = storagePathFromUrl(url)
  if (!path) return
  const supabase = createClient()
  await supabase.storage.from(BUCKET).remove([path])
}

/** Single main-photo picker: preview, upload from the device, remove. */
export function AvatarUploader({
  userId,
  value,
  onChange,
  size = 'lg',
}: {
  userId: string | null
  value: string
  onChange: (url: string) => void
  size?: 'lg' | 'sm'
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !userId) return
    setBusy(true)
    setError('')
    try {
      const url = await uploadPhoto(userId, file)
      if (value) void deletePhoto(value)
      onChange(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    }
    setBusy(false)
  }

  const box = size === 'lg' ? 'h-40 w-full' : 'h-20 w-20'

  return (
    <div>
      {value ? (
        <div className="relative">
          <img src={value} alt="" className={`${box} rounded-2xl object-cover`} />
          <button
            type="button"
            onClick={() => { void deletePhoto(value); onChange('') }}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white"
            aria-label="Remove photo"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy || !userId}
          className={`flex ${box} flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 bg-cream/60 text-neutral-500 disabled:opacity-50`}
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
          <span className="text-xs font-medium">{busy ? 'Uploading…' : 'Tap to add your photo'}</span>
        </button>
      )}
      {value && (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="btn-soft mt-2 w-full py-2 text-xs disabled:opacity-50">
          {busy ? 'Uploading…' : 'Change photo'}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}

/** Multi-photo gallery: grid of photos, add many at once, remove any. */
export function GalleryUploader({
  userId,
  value,
  onChange,
  max = 9,
}: {
  userId: string | null
  value: string[]
  onChange: (urls: string[]) => void
  max?: number
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0 || !userId) return
    const room = max - value.length
    if (room <= 0) { setError(`You can add up to ${max} gallery photos.`); return }
    setBusy(true)
    setError('')
    try {
      const urls: string[] = []
      for (const file of files.slice(0, room)) {
        urls.push(await uploadPhoto(userId, file))
      }
      onChange([...value, ...urls])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    }
    setBusy(false)
  }

  function remove(url: string) {
    void deletePhoto(url)
    onChange(value.filter((u) => u !== url))
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {value.map((url) => (
          <div key={url} className="relative">
            <img src={url} alt="" className="h-24 w-full rounded-xl object-cover" />
            <button
              type="button"
              onClick={() => remove(url)}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label="Remove photo"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            disabled={busy || !userId}
            className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-neutral-200 bg-cream/60 text-neutral-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            <span className="text-[11px] font-medium">{busy ? 'Uploading…' : 'Add photos'}</span>
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
