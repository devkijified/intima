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
  List,
  Loader2,
  Map as MapIcon,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MAP_CITIES } from '@/lib/map/mockProviders';
import { fetchMapProviders, type MapProvider } from '@/lib/map/providers';
import { ProviderSheet } from './ProviderSheet';
import { FilterSheet } from './FilterSheet';
import { ProviderListCard, ProviderListSkeleton } from './ProviderListCard';
import { useCall } from '@/components/calls/CallProvider';
import { RequestConnectionModal } from '@/components/connections/RequestConnectionModal';

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LAGOS_CENTER: [number, number] = [3.3792, 6.5244];

export interface Filters {
  verifiedOnly: boolean;
  availableNow: boolean;
  city: string;
  /** Max short-time rate in naira. null = Any budget. */
  budget: number | null;
  /** Selected service catalog ids. Empty = no service filter. AND logic. */
  services: string[];
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

interface MapLibreLib {
  Map: new (options: Record<string, unknown>) => MLMap;
  Marker: new (options: Record<string, unknown>) => MLMarker;
}

/**
 * maplibre-gl 3.x ships its main entry as a UMD bundle, and the bundler's
 * interop shape for dynamic import() is not stable: we have seen the
 * namespace arrive as { default } where default itself needed unwrapping.
 * Try every plausible nesting, validate the constructors we actually use,
 * and report the full structure when nothing validates so the failure is
 * debuggable from the phone alone.
 */
async function loadMapLibre(): Promise<{ lib: MapLibreLib | null; keys: string }> {
  const ns = (await import('maplibre-gl')) as unknown as Record<string, unknown>;
  const shapes: Array<{ label: string; value: unknown }> = [
    { label: 'ns', value: ns },
    { label: 'ns.default', value: ns?.default },
    { label: 'ns.default.default', value: (ns?.default as any)?.default },
  ];
  for (const shape of shapes) {
    const v = shape.value as Record<string, unknown> | null;
    if (v && typeof v.Map === 'function' && typeof v.Marker === 'function') {
      return { lib: v as unknown as MapLibreLib, keys: `ok:${shape.label}` };
    }
  }
  const describe = (v: unknown): string => {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'function') return 'function';
    if (typeof v !== 'object') return typeof v;
    const o = v as Record<string, unknown>;
    const ks = Object.keys(o);
    return `{${ks.slice(0, 6).join(',')}${ks.length > 6 ? ',…' : ''}} Map=${typeof o.Map} Marker=${typeof o.Marker}`;
  };
  const keys = shapes.map((s) => `${s.label}=${describe(s.value)}`).join(' | ');
  return { lib: null, keys };
}

function markerElement(provider: MapProvider, onSelect: (p: MapProvider) => void): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'intima-pin';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${escAttr(provider.displayName)} in ${escAttr(provider.area)}`);
  el.innerHTML =
    `<div style="position:relative;cursor:pointer;transition:transform .15s ease">` +
    // Photo pin, Instagram-story style: white ring, soft shadow, photo fully visible.
    `<img src="${escAttr(provider.avatar)}" alt="" loading="lazy" ` +
    `style="width:54px;height:54px;border-radius:9999px;object-fit:cover;background:#222;` +
    `border:2.5px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.45)"/>` +
    // Verified is an explicit burgundy badge overlapping the pin corner.
    (provider.verified
      ? `<span title="Verified" style="position:absolute;bottom:-2px;right:-2px;width:22px;height:22px;` +
        `border-radius:9999px;background:#AC244D;border:2px solid #fff;` +
        `display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4)">` +
        CHECK_SVG +
        `</span>`
      : '') +
    // Available: green dot with a soft pulse ring, top-right.
    (provider.available
      ? `<span style="position:absolute;top:-1px;right:-1px;width:15px;height:15px;` +
        `background:#22c55e;border-radius:9999px;border:2.5px solid #fff;` +
        `box-shadow:0 0 0 3px rgba(34,197,94,.35)"></span>`
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

const EMPTY_FILTERS: Filters = {
  verifiedOnly: false,
  availableNow: false,
  city: '',
  budget: null,
  services: [],
};

/**
 * The Intima landing experience: full-screen, guest-accessible discovery.
 * See first, order second. Guests browse everything; signup happens at
 * order time (request connection or call), never before.
 *
 * Two first-class views share every filter: the map, and a rich list.
 * Selection is synced: both open the same bottom sheet.
 */
export default function IntimaMap() {
  const router = useRouter();
  const { startCall } = useCall();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<MLMarker[]>([]);
  /** Resolved maplibre exports, shared by init and pin rendering. */
  const libRef = useRef<MapLibreLib | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [providers, setProviders] = useState<MapProvider[]>([]);
  const [providersReady, setProvidersReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  /** Why the map fell back, shown under Technical details in the fallback. */
  const [mapFailReason, setMapFailReason] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selected, setSelected] = useState<MapProvider | null>(null);
  const [connectionTarget, setConnectionTarget] = useState<MapProvider | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

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
          (!filters.city || p.city === filters.city) &&
          // Pins with no listed short-time rate stay visible under every
          // budget: an unlisted rate is not proof of an unaffordable one,
          // and the sheet says "Rates not listed yet" so the client knows.
          (filters.budget === null ||
            p.rateShortTime === null ||
            p.rateShortTime <= filters.budget) &&
          // Services use AND logic: she must offer everything selected.
          (filters.services.length === 0 ||
            filters.services.every((s) => p.services.includes(s))),
      ),
    [providers, filters],
  );

  // Initialise the map once. maplibre-gl is imported lazily so a failed
  // download degrades to the honest fallback list instead of a crash.
  // Every failure path records a reason, surfaced under Technical details
  // in the fallback so a real device can report what actually broke.
  useEffect(() => {
    let cancelled = false;
    let map: MLMap | null = null;
    let bundleTimer: ReturnType<typeof setTimeout> | undefined;
    let styleTimer: ReturnType<typeof setTimeout> | undefined;

    const failMap = (reason: string) => {
      if (cancelled) return;
      setMapFailReason(reason);
      setMapFailed(true);
    };

    async function init() {
      try {
        // Stage 1: the maplibre bundle itself. If it cannot download in
        // 45s the connection is truly dead → list fallback.
        bundleTimer = setTimeout(() => {
          if (!cancelled && !map)
            failMap('maplibre bundle download timed out after 45s');
        }, 45000);
        const { lib, keys } = await loadMapLibre();
        clearTimeout(bundleTimer);
        if (cancelled || !containerRef.current) return;
        if (!lib) {
          failMap(`maplibre exports unusable (namespace keys: ${keys || 'none'})`);
          return;
        }
        libRef.current = lib;
        try {
          map = new lib.Map({
            container: containerRef.current,
            style: CARTO_DARK,
            center: LAGOS_CENTER,
            zoom: 11,
            attributionControl: true,
          });
        } catch (err) {
          failMap(
            `map init threw: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        map.on('load', () => {
          if (!cancelled) {
            if (styleTimer) clearTimeout(styleTimer);
            mapRef.current = map;
            setMapReady(true);
          }
        });
        // MapLibre fires 'error' for transient tile/sprite/font hiccups as
        // well as fatal style failures. Only the latter kills the map: once
        // the style has loaded (mapRef set), failed tiles are retried by the
        // renderer and the map stays up. On flaky connections a single slow
        // tile must not nuke the whole map into the list fallback.
        map.on('error', (e) => {
          if (cancelled || mapRef.current) return;
          const detail =
            e && typeof e === 'object' && 'error' in e
              ? (e as { error?: { message?: string; status?: number } }).error
              : undefined;
          failMap(
            `style error before load: ${detail?.message ?? 'unknown'}${
              detail?.status ? ` (status ${detail.status})` : ''
            }`,
          );
        });
        // Stage 2: the style itself. A generous 60s for slow connections —
        // a slow map shows the loading state, only a dead one falls back.
        styleTimer = setTimeout(() => {
          if (!cancelled && !mapRef.current)
            failMap('style did not reach load within 60s');
        }, 60000);
      } catch (err) {
        failMap(
          `bundle import threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    init();
    return () => {
      cancelled = true;
      if (bundleTimer) clearTimeout(bundleTimer);
      if (styleTimer) clearTimeout(styleTimer);
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
      const lib = libRef.current;
      if (cancelled || !mapRef.current || !lib) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = filtered.map((p) =>
        new lib.Marker({ element: markerElement(p, setSelected) })
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

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  /** Active budget + service filters, shown as a badge on the Filters button. */
  const sheetFilterCount =
    (filters.budget !== null ? 1 : 0) + filters.services.length;

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

  // A dead map forces the list; the toggle hides to avoid a dead control.
  const showList = view === 'list' || mapFailed;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#111118]" style={{ height: '100dvh' }}>
      <div ref={containerRef} className="absolute inset-0" />
      {!mapReady && !mapFailed && view === 'map' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#111118] text-neutral-400">
          <Loader2 className="h-8 w-8 animate-spin text-[#AC244D]" />
          <p className="text-sm">Loading the map…</p>
        </div>
      )}

      {/* Slim floating header: wordmark, city select, auth actions. No marketing copy. */}
      <div className="absolute left-0 right-0 top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-full bg-black/55 py-1.5 pl-4 pr-1.5 backdrop-blur-md ring-1 ring-white/10">
            <span className="font-display text-xl font-semibold tracking-tight text-white">Intima</span>
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
                className="rounded-full bg-[#AC244D] px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:bg-[#8F1D40] active:scale-95"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 backdrop-blur-md transition-all hover:bg-black/75 active:scale-95"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-[#AC244D] px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:bg-[#8F1D40] active:scale-95"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Single filter bar: view toggle, quick toggles, filters sheet. */}
        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {!mapFailed && (
            <div
              className="flex shrink-0 items-center rounded-full bg-black/55 p-1 ring-1 ring-white/10 backdrop-blur-md"
              role="tablist"
              aria-label="Discovery view"
            >
              {(
                [
                  { value: 'map', label: 'Map', Icon: MapIcon },
                  { value: 'list', label: 'List', Icon: List },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={view === value}
                  onClick={() => setView(value)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95 ${
                    view === value
                      ? 'bg-white text-charcoal shadow'
                      : 'text-white/75 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => toggle('verifiedOnly')}
            aria-pressed={filters.verifiedOnly}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium backdrop-blur-md transition-all active:scale-95 ${
              filters.verifiedOnly
                ? 'bg-[#AC244D] text-white shadow-lg'
                : 'bg-black/55 text-white ring-1 ring-white/10 hover:bg-black/75'
            }`}
          >
            <BadgeCheck className="h-4 w-4" />
            Verified
          </button>
          <button
            onClick={() => toggle('availableNow')}
            aria-pressed={filters.availableNow}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium backdrop-blur-md transition-all active:scale-95 ${
              filters.availableNow
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-black/55 text-white ring-1 ring-white/10 hover:bg-black/75'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-green-400" />
            Available
          </button>
          <button
            onClick={() => setFilterOpen(true)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium backdrop-blur-md transition-all active:scale-95 ${
              sheetFilterCount > 0
                ? 'bg-[#C9A84C] text-charcoal shadow-lg'
                : 'bg-black/55 text-white ring-1 ring-white/10 hover:bg-black/75'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {sheetFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-charcoal px-1 text-[11px] font-bold text-white">
                {sheetFilterCount}
              </span>
            )}
          </button>
          {providersReady && (
            <span className="ml-auto shrink-0 rounded-full bg-black/45 px-2.5 py-1 text-xs text-white/85 backdrop-blur-sm">
              {filtered.length} nearby
            </span>
          )}
        </div>
      </div>

      {/* Legend */}
      {mapReady && !mapFailed && view === 'map' && (
        <div className="absolute bottom-4 left-3 z-10 rounded-xl bg-black/60 px-3 py-2 text-xs text-white ring-1 ring-white/10 backdrop-blur-sm">
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

      {/* First-class list view. Also the graceful fallback when tiles fail. */}
      {showList && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-cream px-4 pb-10 pt-[124px]">
          {mapFailed && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p>
                  The live map could not load on this connection, so here are
                  the companions as a list instead. Nothing is broken, the map
                  simply needs a stronger connection.
                </p>
                <details className="mt-2 text-xs text-amber-700/80">
                  <summary className="cursor-pointer underline">
                    Technical details
                  </summary>
                  <p className="mt-1 break-all font-mono">
                    {mapFailReason ?? 'no reason recorded'}
                  </p>
                  <p className="mt-1 font-mono">
                    build{' '}
                    {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
                      'local'}
                  </p>
                </details>
              </div>
            </div>
          )}
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="font-display text-[22px] font-semibold tracking-tight text-charcoal">
              Companions
            </h2>
            {providersReady && (
              <p className="text-xs font-medium text-neutral-500">
                {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              </p>
            )}
          </div>
          {!providersReady ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2, 3].map((i) => (
                <ProviderListSkeleton key={i} />
              ))}
            </ul>
          ) : filtered.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtered.map((p) => (
                <ProviderListCard key={p.id} provider={p} onSelect={setSelected} />
              ))}
            </ul>
          ) : (
            <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-black/[0.04]">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#AC244D]/10">
                <SearchX className="h-6 w-6 text-[#AC244D]" />
              </div>
              <h3 className="font-display text-lg font-semibold text-charcoal">
                No providers match
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                Try widening your budget or clearing a filter.
              </p>
              <button
                onClick={clearFilters}
                className="mt-4 rounded-full bg-[#AC244D] px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#8F1D40] active:scale-95"
              >
                Clear filters
              </button>
            </div>
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

      <FilterSheet
        open={filterOpen}
        filters={filters}
        onChange={setFilters}
        resultCount={filtered.length}
        onClose={() => setFilterOpen(false)}
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
                className="rounded-full bg-[#AC244D] px-4 py-1.5 font-medium transition-all hover:bg-[#8F1D40] active:scale-95"
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
