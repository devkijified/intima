'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { reencodeImage } from '@/lib/uploads/reencode'
import { BadgeCheck, Clock, ShieldCheck, XCircle, Camera, IdCard, PenLine } from '@/lib/icons'
import { HelpTip } from '@/components/ui/Tooltip'

type VStatus = 'unverified' | 'pending' | 'verified' | 'rejected'

interface Submission {
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  review_notes: string | null
}

const ID_TYPES = ['NIN slip', 'International passport', "Driver's licence", "Voter's card"]

/**
 * Verification, the Tryst way: two proofs, human review, nothing public.
 * 1. A photo of your government ID.
 * 2. A selfie holding that ID.
 * 3. A selfie holding a paper sign with "Intima" and today's date.
 * Documents live in the private verification-docs bucket; only admins
 * can open them, through short-lived signed links.
 */
export default function VerificationPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string>('client')
  const [status, setStatus] = useState<VStatus>('unverified')
  const [latest, setLatest] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)

  const [idType, setIdType] = useState(ID_TYPES[0])
  const [files, setFiles] = useState<{ idDoc: File | null; idSelfie: File | null; signSelfie: File | null }>({
    idDoc: null, idSelfie: null, signSelfie: null,
  })
  const [previews, setPreviews] = useState<{ idDoc: string; idSelfie: string; signSelfie: string }>({
    idDoc: '', idSelfie: '', signSelfie: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      if (!live) return
      setUserId(user.id)
      const { data: profile } = await supabase.from('profiles')
        .select('role, verification_status').eq('id', user.id).maybeSingle()
      if (!live) return
      if (profile) {
        setRole(profile.role)
        setStatus((profile.verification_status as VStatus) ?? 'unverified')
      }
      const { data: subs } = await supabase.from('verifications')
        .select('status, submitted_at, review_notes')
        .eq('provider_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
      if (live && subs && subs.length > 0) setLatest(subs[0] as Submission)
      setLoading(false)
    })()
    return () => { live = false }
  }, [])

  const pick = (key: keyof typeof files) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFiles((prev) => ({ ...prev, [key]: f }))
    setPreviews((prev) => ({ ...prev, [key]: URL.createObjectURL(f) }))
  }

  async function uploadOne(file: File, kind: string): Promise<string> {
    // Re-encode before upload, like every other image surface: the
    // canvas redraw strips EXIF (including location) and caps the
    // document at 1600px on its longest side, still clear to review.
    const blob = await reencodeImage(file)
    const ext = blob.type === 'image/png'
      ? 'png'
      : blob.type === 'image/jpeg'
        ? 'jpg'
        : (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${userId}/${kind}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('verification-docs').upload(path, blob, {
      contentType: blob.type || file.type || 'image/jpeg',
      upsert: true,
    })
    if (error) throw error
    return path
  }

  async function submit() {
    if (!userId) return
    if (!files.idDoc || !files.idSelfie || !files.signSelfie) {
      setError('All three photos are needed: your ID, a selfie holding it, and the sign selfie.')
      return
    }
    setBusy(true); setError('')
    try {
      const [idDoc, idSelfie, signSelfie] = await Promise.all([
        uploadOne(files.idDoc, 'id'),
        uploadOne(files.idSelfie, 'id-selfie'),
        uploadOne(files.signSelfie, 'sign-selfie'),
      ])
      const { error: insErr } = await supabase.from('verifications').insert({
        provider_id: userId,
        id_document_url: idDoc,
        selfie_url: idSelfie,
        sign_selfie_url: signSelfie,
        id_type: idType,
        status: 'pending',
      })
      if (insErr) throw insErr
      await supabase.from('profiles').update({ verification_status: 'pending' }).eq('id', userId)
      setStatus('pending')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong uploading. Please try again.')
    }
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-neutral-300" />
        <p className="mt-3 font-display text-2xl font-semibold text-charcoal">Sign in to verify</p>
        <Link href="/login?next=/verification" className="btn-luxe mt-6 inline-flex min-h-[44px] items-center justify-center px-6 py-2.5 text-sm">Sign in</Link>
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-6 animate-rise-in">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-muted">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </span>
        <div>
          <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">Verification</h1>
          <HelpTip text="We ask for a government ID and a selfie holding it to confirm you are a real adult and the photos are yours. Our team checks that the faces match. Once approved, your profile gets the verified badge and you can receive connections and go live." />
          </div>
          <p className="text-sm text-neutral-500">
            {role === 'model' ? 'Verified companions get the badge and clients trust.' : 'Verified clients unlock companions who only meet verified clients.'}
          </p>
        </div>
      </div>

      {/* Current state */}
      {status === 'verified' && (
        <div className="card-luxe mt-6 flex items-start gap-3 p-5">
          <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-charcoal">You are verified</p>
            <p className="mt-1 text-sm text-neutral-500">Your badge shows on your profile. Nothing you submitted is public.</p>
          </div>
        </div>
      )}
      {status === 'pending' && !done && (
        <div className="card-luxe mt-6 flex items-start gap-3 p-5">
          <Clock className="mt-0.5 h-6 w-6 shrink-0 text-gold" />
          <div>
            <p className="font-semibold text-charcoal">Under review</p>
            <p className="mt-1 text-sm text-neutral-500">
              Submitted {latest ? new Date(latest.submitted_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long' }) : ''}. Reviews usually take 1 to 2 days. We will notify you here.
            </p>
          </div>
        </div>
      )}
      {done && (
        <div className="card-luxe mt-6 flex items-start gap-3 border-emerald-100 bg-emerald-50/60 p-5">
          <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-charcoal">Submitted for review</p>
            <p className="mt-1 text-sm text-neutral-500">Reviews usually take 1 to 2 days. Your status will update here.</p>
          </div>
        </div>
      )}
      {status === 'rejected' && latest && (
        <div className="card-luxe mt-6 flex items-start gap-3 border-red-100 bg-red-50/60 p-5">
          <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-500" />
          <div>
            <p className="font-semibold text-charcoal">Not approved</p>
            <p className="mt-1 text-sm text-neutral-600">{latest.review_notes || 'The photos were not clear enough. Please retake them and submit again.'}</p>
          </div>
        </div>
      )}

      {/* Submission form (shown when unverified or rejected) */}
      {(status === 'unverified' || status === 'rejected') && !done && (
        <div className="mt-6 space-y-4">
          <div className="card-luxe p-5">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Your ID type</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ID_TYPES.map((t) => (
                <button key={t} onClick={() => setIdType(t)}
                  className={`inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 text-[13px] font-medium transition-all active:scale-95 ${idType === t ? 'bg-primary text-white shadow-cta' : 'bg-cream text-neutral-600 ring-1 ring-black/[0.06]'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <UploadCard
            icon={<IdCard className="h-5 w-5 text-primary" />}
            title="1. Photo of your ID"
            hint="The full ID, flat and clear. No fingers covering details."
            preview={previews.idDoc}
            onPick={pick('idDoc')}
          />
          <UploadCard
            icon={<Camera className="h-5 w-5 text-primary" />}
            title="2. Selfie holding your ID"
            hint="Your face and the ID in one photo, both readable."
            preview={previews.idSelfie}
            onPick={pick('idSelfie')}
          />
          <UploadCard
            icon={<PenLine className="h-5 w-5 text-primary" />}
            title="3. Selfie with a handwritten sign"
            hint={`Write "Intima" and today's date (${today}) on paper, hold it up, and take a selfie. This proves your photos are really you.`}
            preview={previews.signSelfie}
            onPick={pick('signSelfie')}
          />

          {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          <button onClick={submit} disabled={busy} className="btn-luxe w-full py-3.5 text-[15px] disabled:opacity-50">
            {busy ? 'Uploading…' : 'Submit for review'}
          </button>
          <p className="text-center text-xs leading-relaxed text-neutral-400">
            Your documents are stored privately and only ever opened by the review team. They are never shown on your profile.
          </p>
        </div>
      )}
    </div>
  )
}

function UploadCard({
  icon, title, hint, preview, onPick,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  preview: string
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="card-luxe p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-muted">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-charcoal">{title}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">{hint}</p>
        </div>
      </div>
      {preview && (
        <img src={preview} alt="" className="mt-3 max-h-44 w-full rounded-2xl object-cover" />
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <button onClick={() => ref.current?.click()} className="btn-soft mt-3 inline-flex min-h-[44px] w-full items-center justify-center py-2.5 text-sm">
        {preview ? 'Retake photo' : 'Choose photo'}
      </button>
    </div>
  )
}
