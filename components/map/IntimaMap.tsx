'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  Loader2,
  MapPin,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MAP_CITIES } from '@/lib/map/mockProviders';
import { fetchMapProviders, type MapProvider } from '@/lib/map/providers';
import { ProviderSheet } from './ProviderSheet';
import { useCall } from '@/components/calls/CallProvider';
import { RequestConnectionModal } from '@/components/connections/RequestConnectionModal';
import { formatPrice } from '@/lib/utils/helpers';

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LAGOS_CENTER: [number, number] = [3.3792, 6.5244];

interface Filters {
  verifiedOnly: boolean;
  availableNow: boolean;
  city: string;
}

interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const CHECK_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

/** Escape for use inside an HTML attribute in the pin markup. */
function escAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function markerElement(provider: MapProvider, onSelect: (p: MapProvider) => void): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'intima-pin';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${escAttr(provider.displayName)} in ${escAttr(provider.area)}`);
  el.innerHTML =
    `<div style="position:relative;cursor:pointer;transition:transform .15s ease">` +
    // Photo fully visible: no blur, no cover overlays. Burgundy ring for every pin.
    `<img src="${escAttr(provider.avatar)}" alt="" loading="lazy" ` +
    `style="width:48px;height:48px;border-radius:9999px;object-fit:cover;background:#222;` +
    `border:3px solid #AC244D;box-shadow:0 4px 14px rgba(0,0,0,.45)"/>` +
    // Verified is an explicit icon badge overlapping the pin corner, not a ring color.
    (provider.verified
      ? `<span title="Verified" style="position:absolute;top:-5px;right:-5px;width:22px;height:22px;` +
        `border-radius:9999px;background:#AC244D;border:2px solid #fff;` +
        `display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4)">` +
        CHECK_SVG +
        `</span>`
      : '') +
    (provider.available
      ? `<span style="position:absolute;bottom:0px;right:0px;width:13px;height:13px;` +
        `background:#22c55e;border-radius:9999px;border:2px solid #fff"></span>`
      : '') +
    `</div>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelect(provider);
  });
  el.addEventListener('mouseenter', () => {
    const inner = el.firstElementChild as HTMLElement | null;
    if (inner) inner.style.transform = 'scale(1.15)';
  });
  el.addEventListener('mouseleave', () => {
    const inner = el.firstElementChild as HTMLElement | null;
    if (inner) inner.style.transform = 'scale(1)';
  });
  return el;
}

/**
 * The Intima landing experience: a full-screen, guest-accessible discovery
 * map. See first, order second. Guests browse everything; signup happens at
 * order time (request connection or call), never before.
 */
export default function IntimaMap() {
  const router = useRouter();
  const { startCall } = useCall();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<MLMarker[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [providers, setProviders] = useState<MapProvider[]>([]);
  const [providersReady, setProvidersReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [selected, setSelected] = useState<MapProvider | null>(null);
  const [connectionTarget, setConnectionTarget] = useState<MapProvider | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [filters, setFilters] = useState<Filters>({
    verifiedOnly: false,
    availableNow: false,
    city: '',
  });

  const showToast = (t: ToastState) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Auth state: guests browse freely; CTAs adapt.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Providers: public DB view first, mock fallback.
  useEffect(() => {
    let cancelled = false;
    fetchMapProviders().then((list) => {
      if (!cancelled) {
        setProviders(list);
        setProvidersReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () =>
      providers.filter(
        (p) =>
          (!filters.verifiedOnly || p.verified) &&
          (!filters.availableNow || p.available) &&
          (!filters.city || p.city === filters.city),
      ),
    [providers, filters],
  );

  // Initialise the map once. maplibre-gl is imported lazily so a failed
  // download degrades to the honest fallback list instead of a crash.
  useEffect(() => {
    let cancelled = false;
    let map: MLMap | null = null;

    async function init() {
      try {
        const maplibre = await import('maplibre-gl');
        if (cancelled || !containerRef.current) return;
        map = new maplibre.Map({
          container: containerRef.current,
          style: CARTO_DARK,
          center: LAGOS_CENTER,
          zoom: 11,
          attributionControl: true,
        });
        map.on('load', () => {
          if (!cancelled) {
            mapRef.current = map;
            setMapReady(true);
          }
        });
        map.on('error', () => {
          if (!cancelled) setMapFailed(true);
        });
      } catch {
        if (!cancelled) setMapFailed(true);
      }
    }

    init();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Rebuild pins whenever the filtered set changes.
  useEffect(() => {
    if (!mapReady || !mapRef.current || mapFailed) return;
    let cancelled = false;

    async function renderPins() {
      const maplibre = await import('maplibre-gl');
      if (cancelled || !mapRef.current) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = filtered.map((p) =>
        new maplibre.Marker({ element: markerElement(p, setSelected) })
          .setLngLat([p.lng, p.lat])
          .addTo(mapRef.current as MLMap),
      );
    }

    renderPins();
    return () => {
      cancelled = true;
    };
  }, [filtered, mapReady, mapFailed]);

  const toggle = (key: 'verifiedOnly' | 'availableNow') =>
    setFilters((f) => ({ ...f, [key]: !f[key] }));

  const goSignup = () => router.push('/signup?next=/');

  // Primary CTA: see, then order. Guests sign up at order time.
  const handleRequestConnection = (p: MapProvider) => {
    if (!session) {
      goSignup();
      return;
    }
    if (!p.userId) {
      showToast({ message: 'Preview profile. Real connections open at launch.' });
      return;
    }
    setSelected(null);
    setConnectionTarget(p);
  };

  const handleVoiceCall = (p: MapProvider) => {
    if (!session) {
      showToast({
        message: 'Create an account to call',
        actionLabel: 'Sign up',
        onAction: goSignup,
      });
      return;
    }
    if (!p.userId) {
      showToast({ message: 'Preview profile. Calls open at launch.' });
      return;
    }
    void startCall(p.userId, p.displayName, 'voice', p.avatar);
  };

  const handleVideoCall = (p: MapProvider) => {
    if (!session) {
      showToast({
        message: 'Create an account to call',
        actionLabel: 'Sign up',
        onAction: goSignup,
      });
      return;
    }
    if (!p.userId) {
      showToast({ message: 'Preview profile. Calls open at launch.' });
      return;
    }
    void startCall(p.userId, p.displayName, 'video', p.avatar);
  };

  const handleViewProfile = (p: MapProvider) => {
    if (!p.userId) return;
    if (!session) {
      router.push(`/signup?next=/models/${p.userId}`);
      return;
    }
    router.push(`/models/${p.userId}`);
  };

  // Call buttons stay enabled for guests (they route to signup with a
  // notice). They disable only for logged-in users on preview pins.
  const callsDisabled = !!session && !!selected && !selected.userId;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#111118]" style={{ height: '100dvh' }}>
      <div ref={containerRef} className="absolute inset-0" />
      {!mapReady && !mapFailed && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#111118] text-neutral-400">
          <Loader2 className="h-8 w-8 animate-spin text-[#AC244D]" />
          <p className="text-sm">Loading the map…</p>
        </div>
      )}

      {/* Slim floating header: wordmark, city select, auth actions. No marketing copy. */}
      <div className="absolute left-0 right-0 top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-full bg-black/55 py-1.5 pl-4 pr-1.5 backdrop-blur-md">
            <span className="font-serif text-xl tracking-tight text-white">Intima</span>
            <div className="relative">
              <select
                value={filters.city}
                onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
                aria-label="Choose city"
                className="appearance-none rounded-full bg-white/10 py-1.5 pl-3 pr-8 text-sm font-medium text-white outline-none"
              >
                <option value="" className="text-charcoal">
                  All cities
                </option>
                {MAP_CITIES.map((c) => (
                  <option key={c} value={c} className="text-charcoal">
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {session ? (
              <Link
                href="/dashboard"
                className="rounded-full bg-[#AC244D] px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors hover:bg-[#8F1D40]"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-black/75"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-[#AC244D] px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors hover:bg-[#8F1D40]"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Filter chips */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => toggle('verifiedOnly')}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium backdrop-blur-md transition-colors ${
              filters.verifiedOnly
                ? 'bg-[#AC244D] text-white shadow-lg'
                : 'bg-black/55 text-white hover:bg-black/75'
            }`}
          >
            <BadgeCheck className="h-4 w-4" />
            Verified only
          </button>
          <button
            onClick={() => toggle('availableNow')}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium backdrop-blur-md transition-colors ${
              filters.availableNow
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-black/55 text-white hover:bg-black/75'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-green-400" />
            Available now
          </button>
          {providersReady && (
            <span className="ml-auto rounded-full bg-black/45 px-2.5 py-1 text-xs text-white/85 backdrop-blur-sm">
              {filtered.length} nearby
            </span>
          )}
        </div>
      </div>

      {/* Legend */}
      {mapReady && !mapFailed && (
        <div className="absolute bottom-4 left-3 z-10 rounded-xl bg-black/60 px-3 py-2 text-xs text-white backdrop-blur-sm">
          <p className="flex items-center gap-2">
            <BadgeCheck className="h-3.5 w-3.5" />
            Verified
          </p>
          <p className="mt-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            Available now
          </p>
        </div>
      )}

      {/* Honest fallback: full-screen list when tiles fail. */}
      {mapFailed && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-cream px-4 pb-8 pt-36">
          <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              The live map could not load on this connection, so here are the
              companions as a list instead. Nothing is broken, the map simply
              needs a stronger connection.
            </p>
          </div>
          <ul className="divide-y divide-neutral-100 rounded-2xl bg-white px-4">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelected(p)}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <img
                    src={p.avatar}
                    alt={p.displayName}
                    loading="lazy"
                    className="h-14 w-14 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium text-charcoal">
                      {p.age !== null ? `${p.displayName}, ${p.age}` : p.displayName}
                      {p.verified && (
                        <BadgeCheck className="h-4 w-4 fill-[#AC244D] text-white" />
                      )}
                    </p>
                    <p className="flex items-center gap-1 text-sm text-neutral-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {p.area}, {p.city}
                      {p.ratePerHour !== null && ` · ${formatPrice(p.ratePerHour)}/hr`}
                    </p>
                  </div>
                  {p.available && (
                    <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                      Available
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {providersReady && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-500">
              No companions match these filters right now.
            </p>
          )}
        </div>
      )}

      <ProviderSheet
        provider={selected}
        onClose={() => setSelected(null)}
        onViewProfile={handleViewProfile}
        onRequestConnection={handleRequestConnection}
        onVoiceCall={handleVoiceCall}
        onVideoCall={handleVideoCall}
        callsDisabled={callsDisabled}
        callsDisabledNote="Available after verification launch"
        showViewProfile={!!selected?.userId}
      />

      {connectionTarget && connectionTarget.userId && (
        <RequestConnectionModal
          providerId={connectionTarget.userId}
          providerName={connectionTarget.displayName}
          providerAvatarUrl={connectionTarget.avatar}
          onClose={() => setConnectionTarget(null)}
          onConnected={() => {
            setConnectionTarget(null);
            showToast({ message: 'You are connected. Chat and calls are unlocked.' });
          }}
        />
      )}

      {toast && (
        <div className="absolute inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-charcoal/95 py-2.5 pl-5 pr-2.5 text-sm text-white shadow-2xl backdrop-blur-md">
            <span>{toast.message}</span>
            {toast.actionLabel && (
              <button
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
                className="rounded-full bg-[#AC244D] px-4 py-1.5 font-medium transition-colors hover:bg-[#8F1D40]"
              >
                {toast.actionLabel}
              </button>
            )}
            <button onClick={() => setToast(null)} aria-label="Dismiss">
              <X className="h-4 w-4 text-white/70" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
