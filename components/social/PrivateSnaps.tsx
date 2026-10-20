'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reencodeImage } from '@/lib/uploads/reencode';
import { Camera, Loader2, Lock, PictureInPicture2, Play, Trash2, X } from '@/lib/icons';
import { SubscribeCard } from '@/components/social/SubscribeCard';
import { useDock } from '@/components/dock/FloatingDock';

const BUCKET = 'private-snaps';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const DEFAULT_COLLECTION = 'Private snaps';

interface SnapItem {
  id: string;
  mediaType: 'image' | 'video';
  caption: string | null;
  collection: string;
  createdAt: string;
  url: string;
  /** Owner only: where this snap sits in the human review. */
  reviewStatus?: string;
  rejectReason?: string | null;
  durationSeconds?: number | null;
}

interface SnapCollection {
  name: string;
  count: number;
}

interface StandingLite {
  canEarn: boolean;
  blockedBy: string | null;
  countingContents: number;
  pendingCount: number;
  checks: {
    key: string;
    label: string;
    passed: boolean;
    current: string;
    target: string;
  }[];
  thresholds: { minContents: number; minVideoSeconds: number };
}

interface SnapsResponse {
  isOwner: boolean;
  isSubscriber: boolean;
  fanPriceCoins: number | null;
  totalCount: number;
  collections: SnapCollection[];
  snaps?: SnapItem[];
  standing?: StandingLite;
}

/** Read a video file's duration in seconds before it uploads, so a
 * too-short video is refused on the phone, not after a round trip. */
async function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    const done = (val: number | null) => {
      URL.revokeObjectURL(url);
      resolve(val);
    };
    const timer = window.setTimeout(() => done(null), 6000);
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    v.src = url;
  });
}

interface PrivateSnapsProps {
  providerId: string;
  providerName: string;
  isOwner: boolean;
  /** Render the tab body only when the private tab is selected. The
   * component stays mounted either way so it can report whether the
   * tab button should exist at all. */
  active?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

function extForBlob(blob: Blob, fallbackName: string): string {
  if (blob.type === 'image/png') return 'png';
  if (blob.type === 'image/jpeg') return 'jpg';
  if (blob.type === 'image/webp') return 'webp';
  if (blob.type === 'image/gif') return 'gif';
  return (
    (fallbackName.split('.').pop() || 'jpg')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'jpg'
  );
}

function extForVideo(file: File): string {
  const fromName = (file.name.split('.').pop() || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (fromName) return fromName;
  if (file.type.includes('quicktime')) return 'mov';
  if (file.type.includes('webm')) return 'webm';
  return 'mp4';
}

/**
 * Private snaps tab body for a companion profile. Fetches its own
 * summary from /api/private-snaps (the page's main load never waits
 * on it), reports tab visibility up to the page, and loads the snaps
 * with signed URLs only when the tab is open and the viewer is the
 * owner or an effective fan club subscriber. Everyone else sees
 * locked collection cards and the fan club card.
 */
export function PrivateSnaps({
  providerId,
  providerName,
  isOwner,
  active = true,
  onVisibilityChange,
}: PrivateSnapsProps) {
  const dock = useDock();
  const [summary, setSummary] = useState<SnapsResponse | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [snaps, setSnaps] = useState<SnapItem[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lightbox, setLightbox] = useState<SnapItem | null>(null);

  // Owner add form state.
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [collection, setCollection] = useState('');
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const visibilityRef = useRef(onVisibilityChange);
  visibilityRef.current = onVisibilityChange;

  const fetchSummary = async (): Promise<SnapsResponse | null> => {
    try {
      const res = await fetch(
        `/api/private-snaps?provider_id=${encodeURIComponent(providerId)}`
      );
      if (!res.ok) throw new Error('summary failed');
      const j = (await res.json()) as SnapsResponse;
      setSummary(j);
      setSummaryError(false);
      visibilityRef.current?.(
        j.isOwner || j.totalCount > 0 || j.fanPriceCoins !== null
      );
      return j;
    } catch {
      setSummaryError(true);
      return null;
    }
  };

  const fetchDetail = async () => {
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/private-snaps?provider_id=${encodeURIComponent(providerId)}&detail=1`
      );
      if (!res.ok) throw new Error('detail failed');
      const j = (await res.json()) as SnapsResponse;
      setSummary(j);
      setSnaps(j.snaps ?? []);
    } catch {
      setSnaps([]);
    } finally {
      setDetailLoading(false);
    }
  };

  // Summary on mount: drives tab button visibility for the page.
  useEffect(() => {
    void fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  // Subscribe or cancel anywhere on the profile flips what this tab
  // may show: refetch so the locked and open states stay truthful
  // without a page reload.
  useEffect(() => {
    const onChange = () => {
      setSnaps(null);
      void fetchSummary();
    };
    window.addEventListener('intima:subscription-changed', onChange);
    return () =>
      window.removeEventListener('intima:subscription-changed', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  const canView = summary ? summary.isOwner || summary.isSubscriber : isOwner;

  // Detail (snaps with signed URLs) once the tab opens for a viewer
  // who is allowed to see them.
  useEffect(() => {
    if (active && summary && canView && snaps === null && !detailLoading) {
      void fetchDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, summary, canView]);

  if (!active) return null;

  const ownerView = summary ? summary.isOwner : isOwner;

  async function addSnap() {
    if (!picked || adding) return;
    setAdding(true);
    setFormError('');
    let uploadedPath: string | null = null;
    try {
      const supabase = createClient();
      const isImage = picked.type.startsWith('image/');
      const isVideo = picked.type.startsWith('video/');
      if (!isImage && !isVideo) {
        throw new Error('Please choose a photo or a video file.');
      }
      let data: Blob;
      let contentType: string;
      let ext: string;
      let durationSeconds: number | null = null;
      if (isImage) {
        if (picked.size > MAX_IMAGE_BYTES) {
          throw new Error('That photo is too large. Please keep photos under 10MB.');
        }
        // Re-encode first: strips EXIF (including location) and caps
        // the image at 1600px, same as the public photo uploads.
        data = await reencodeImage(picked);
        contentType = data.type || picked.type || 'image/jpeg';
        ext = extForBlob(data, picked.name);
      } else {
        if (picked.size > MAX_VIDEO_BYTES) {
          throw new Error('That video is too large. Please keep videos under 50MB.');
        }
        const minSeconds = summary?.standing?.thresholds.minVideoSeconds ?? 30;
        durationSeconds = await readVideoDuration(picked);
        if (durationSeconds === null) {
          throw new Error('We could not read that video. Please try another file.');
        }
        if (durationSeconds < minSeconds) {
          throw new Error(
            `That video is ${Math.round(durationSeconds)} seconds. Videos here must be at least ${minSeconds} seconds.`
          );
        }
        data = picked;
        contentType = picked.type || 'video/mp4';
        ext = extForVideo(picked);
      }
      const path = `${providerId}/snap-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, data, { contentType, upsert: false });
      if (upErr) throw upErr;
      uploadedPath = path;

      const res = await fetch('/api/private-snaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: path,
          mediaType: isImage ? 'image' : 'video',
          caption: caption.trim() || undefined,
          collection: collection.trim() || undefined,
          durationSeconds: durationSeconds ?? undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error || 'Could not add the snap. Please try again.');
      }
      setPicked(null);
      setCaption('');
      if (fileRef.current) fileRef.current.value = '';
      setSnaps(null);
      await fetchSummary();
    } catch (err) {
      if (uploadedPath) {
        const supabase = createClient();
        void supabase.storage.from(BUCKET).remove([uploadedPath]);
      }
      setFormError(
        err instanceof Error ? err.message : 'Could not add the snap. Please try again.'
      );
    } finally {
      setAdding(false);
    }
  }

  async function deleteSnap(snap: SnapItem) {
    if (deletingId) return;
    setDeletingId(snap.id);
    try {
      const res = await fetch(
        `/api/private-snaps?id=${encodeURIComponent(snap.id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Could not delete the snap.');
      }
      if (lightbox?.id === snap.id) setLightbox(null);
      setSnaps(null);
      await fetchSummary();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not delete the snap.'
      );
    } finally {
      setDeletingId(null);
    }
  }

  // Loading: summary first, then the detail for viewers. Skeleton
  // tiles either way, never a false empty state.
  if (!summary || (canView && snaps === null)) {
    if (summaryError && !summary) {
      return (
        <p className="py-8 text-center text-sm text-neutral-400">
          Could not load private snaps. Please try again later.
        </p>
      );
    }
    return (
      <div>
        <div className="h-5 w-32 animate-pulse rounded-full bg-neutral-100" />
        <div className="mt-3 grid grid-cols-3 gap-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-[3/4] animate-pulse bg-neutral-100" />
          ))}
        </div>
      </div>
    );
  }

  // Locked state: not the owner and not an effective subscriber.
  if (!canView) {
    return (
      <div>
        <h3 className="font-display text-lg font-semibold text-charcoal">
          Private snaps
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          Fans only. Join the fan club to see these.
        </p>
        {summary.fanPriceCoins !== null ? (
          <SubscribeCard providerId={providerId} providerName={providerName} />
        ) : (
          <p className="mt-3 rounded-2xl bg-cream p-3 text-sm text-neutral-600">
            This fan club is not open yet, so private snaps are not available for
            now.
          </p>
        )}
        {summary.collections.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-400">
            No private snaps yet.
          </p>
        ) : (
          summary.collections.map((c) => (
            <div key={c.name} className="card-luxe mt-3 overflow-hidden">
              <div className="relative flex h-28 items-center justify-center overflow-hidden bg-cream">
                <div className="absolute inset-0 scale-125 bg-gradient-to-br from-primary/70 via-[#6d1f38] to-gold/60 blur-md" />
                <Lock className="relative h-8 w-8 text-white/90" />
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="text-sm font-semibold text-charcoal">{c.name}</span>
                <span className="text-xs text-neutral-500">
                  {c.count} {c.count === 1 ? 'snap' : 'snaps'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // Owner or subscriber: full collections.
  const list = snaps ?? [];
  const grouped: { name: string; items: SnapItem[] }[] = [];
  for (const c of summary.collections) {
    grouped.push({ name: c.name, items: list.filter((s) => s.collection === c.name) });
  }
  for (const s of list) {
    if (!grouped.some((g) => g.name === s.collection)) {
      grouped.push({ name: s.collection, items: list.filter((x) => x.collection === s.collection) });
    }
  }
  const datalistId = `psnap-collections-${providerId}`;

  return (
    <div>
      <h3 className="font-display text-lg font-semibold text-charcoal">
        Private snaps
      </h3>
      <p className="mt-1 text-sm text-neutral-500">
        {ownerView
          ? 'Only your fan club members can see these.'
          : 'For fan club members only. Enjoy.'}
      </p>

      {ownerView && summary.standing && (
        <div className="card-luxe mt-3 p-4">
          {summary.standing.canEarn ? (
            <p className="text-sm font-semibold text-emerald-700">
              Your fan club is open and earning.
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-charcoal">
                Open your fan club
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Fans can subscribe once every step below is done. Every snap is
                reviewed by our team before fans see it, and photos in a set
                count once the set holds at least 5 approved photos.
              </p>
              <ul className="mt-3 space-y-2">
                {summary.standing.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-sm">
                    <span
                      className={
                        c.passed
                          ? 'font-bold text-emerald-600'
                          : 'font-bold text-red-500'
                      }
                    >
                      {c.passed ? '✓' : '✕'}
                    </span>
                    <span className="flex-1 text-charcoal">
                      {c.label}
                      <span className="block text-xs text-neutral-500">
                        {c.current} · needs {c.target}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {summary.standing.pendingCount > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              {summary.standing.pendingCount}{' '}
              {summary.standing.pendingCount === 1 ? 'snap' : 'snaps'} waiting
              for review.
            </p>
          )}
        </div>
      )}

      {ownerView && (
        <div className="card-luxe mt-3 p-4">
          <p className="text-sm font-semibold text-charcoal">Add a private snap</p>
          <p className="mt-1 text-xs text-neutral-500">
            Photos are cleaned of location data before they upload. Videos can be
            up to 50MB, and must run at least 30 seconds. New snaps appear to
            fans after a quick review.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <input
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              placeholder={DEFAULT_COLLECTION}
              list={datalistId}
              maxLength={40}
              className="w-full rounded-2xl bg-cream px-4 py-3 text-sm text-charcoal outline-none ring-1 ring-black/[0.06] placeholder:text-neutral-400 focus:ring-primary/40"
            />
            <datalist id={datalistId}>
              {summary.collections.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (optional)"
              maxLength={300}
              className="w-full rounded-2xl bg-cream px-4 py-3 text-sm text-charcoal outline-none ring-1 ring-black/[0.06] placeholder:text-neutral-400 focus:ring-primary/40"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={adding}
                className="btn-soft flex items-center gap-2 px-4 py-2.5 text-[13px] disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
                {picked ? 'Change file' : 'Choose photo or video'}
              </button>
              {picked && (
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
                  {picked.name}
                </span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                setPicked(e.target.files?.[0] ?? null);
                setFormError('');
              }}
            />
            <button
              type="button"
              onClick={addSnap}
              disabled={adding || !picked}
              className="btn-luxe flex h-11 items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              {adding ? 'Adding...' : 'Add snap'}
            </button>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">
          {ownerView
            ? 'You have not added any private snaps yet.'
            : 'No private snaps yet. New drops land here first.'}
        </p>
      ) : (
        grouped.map((g) => (
          <div key={g.name} className="mt-4">
            <div className="flex items-baseline justify-between">
              <h4 className="text-sm font-semibold text-charcoal">{g.name}</h4>
              <span className="text-xs text-neutral-400">
                {g.items.length} {g.items.length === 1 ? 'snap' : 'snaps'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {g.items.map((snap) => (
                <div key={snap.id} className="relative">
                  <button
                    onClick={() => setLightbox(snap)}
                    className="relative block aspect-[3/4] w-full overflow-hidden bg-neutral-100"
                  >
                    {snap.mediaType === 'image' ? (
                      <img
                        src={snap.url}
                        alt={snap.caption ?? ''}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <>
                        <video
                          src={snap.url}
                          preload="metadata"
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 text-[10px] font-semibold text-white drop-shadow">
                          <Play className="h-2.5 w-2.5 fill-white" />
                        </span>
                        <span className="absolute right-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-medium text-white">
                          VIDEO
                        </span>
                      </>
                    )}
                  </button>
                  {ownerView && snap.reviewStatus === 'pending' && (
                    <span className="absolute bottom-1 right-1 rounded bg-gold px-1.5 py-0.5 text-[9px] font-bold text-charcoal">
                      IN REVIEW
                    </span>
                  )}
                  {ownerView && snap.reviewStatus === 'rejected' && (
                    <span className="absolute bottom-1 right-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      REJECTED
                    </span>
                  )}
                  {ownerView && (
                    <button
                      type="button"
                      onClick={() => void deleteSnap(snap)}
                      disabled={deletingId === snap.id}
                      aria-label="Delete snap"
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-50"
                    >
                      {deletingId === snap.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/95"
          onClick={() => setLightbox(null)}
        >
          <button
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          {lightbox.mediaType === 'video' && (
            <button
              aria-label="Minimize player"
              onClick={(e) => {
                e.stopPropagation();
                dock.showMedia({
                  src: lightbox.url,
                  title: lightbox.collection,
                });
                setLightbox(null);
              }}
              className="absolute right-16 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </button>
          )}
          <div
            className="max-h-full w-full max-w-lg p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.mediaType === 'image' ? (
              <img
                src={lightbox.url}
                alt={lightbox.caption ?? ''}
                className="max-h-[80vh] w-full rounded-2xl object-contain"
                draggable={false}
              />
            ) : (
              <video
                src={lightbox.url}
                controls
                playsInline
                className="max-h-[80vh] w-full rounded-2xl"
              />
            )}
            {lightbox.caption && (
              <p className="mt-3 text-center text-sm text-white/85">
                {lightbox.caption}
              </p>
            )}
            {lightbox.reviewStatus === 'pending' && (
              <p className="mt-2 text-center text-xs font-semibold text-gold">
                In review. Fans will see this once it is approved.
              </p>
            )}
            {lightbox.reviewStatus === 'rejected' && (
              <p className="mt-2 text-center text-xs font-semibold text-red-400">
                Rejected by the review team.
                {lightbox.rejectReason ? ` Reason: ${lightbox.rejectReason}` : ''}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
