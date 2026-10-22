'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StoryTray } from '@/components/stories/StoryTray';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  LayoutDashboard,
  LayoutGrid,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Radio,
  SearchX,
  SlidersHorizontal,
  X,
} from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import { useCities } from '@/lib/citiesLive';
import { fetchMapProviders, type MapProvider } from '@/lib/map/providers';
import { ComicRibbon } from '@/components/comics/ComicRibbon';
import { ProviderSheet } from './ProviderSheet';
import { FilterSheet } from './FilterSheet';
import { ProviderListCard, ProviderListSkeleton } from './ProviderListCard';
import { useCall } from '@/components/calls/CallProvider';
import { RequestConnectionModal } from '@/components/connections/RequestConnectionModal';
import { Tooltip } from '@/components/ui/Tooltip';

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/**
 * Primary raster style: OpenStreetMap tiles. OSM sends proper CORS headers
 * (required for WebGL tile rendering) and runs on highly reachable
 * infrastructure. The dark-mode CSS filter keeps our brand.
 * A map that loads beats a prettier map that stays black.
 */
const OSM_RASTER_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};
const LAGOS_CENTER: [number, number] = [3.3792, 6.5244];

/** City centers for map fly-to when the city filter changes. [lng, lat]. */
const CITY_CENTERS: Record<string, [number, number]> = {
  Lagos: [3.3792, 6.5244],
  Abuja: [7.4951, 9.0579],
  'Port Harcourt': [6.9962, 4.7714],
  Ibadan: [3.947, 7.3775],
  Kano: [8.5167, 12.0022],
  Enugu: [7.4951, 6.4584],
};

export interface Filters {
  verifiedOnly: boolean;
  availableNow: boolean;
  negotiableOnly: boolean;
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

/** Compact pin recency, Snap Map style: "2m", "3h", "2d". */
function shortRecency(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 0) return null;
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days}d`;
  return null;
}

function markerElement(provider: MapProvider, onSelect: (p: MapProvider) => void): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'intima-pin';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${escAttr(provider.displayName)} in ${escAttr(provider.area)}`);
  const firstName = escAttr(provider.displayName.split(' ')[0] ?? provider.displayName);
  const recency = shortRecency(provider.lastActiveAt);
  // Deterministic per-pin bob delay, so the figures never bob in sync.
  const hash = (provider.id ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const delay = ((hash % 14) / 10).toFixed(1);
  el.innerHTML =
    `<div style="position:relative;cursor:pointer;display:flex;flex-direction:column;align-items:center;width:76px;transition:transform .15s ease">` +
    // Heat glow behind the figure: warm burgundy halo, stronger for
    // boosted or elite companions, so busy areas glow.
    `<span style="position:absolute;left:50%;top:24px;width:128px;height:128px;transform:translate(-50%,-50%);border-radius:9999px;pointer-events:none;` +
    `background:radial-gradient(circle, ${
      provider.boosted || provider.trustTier === 'elite'
        ? 'rgba(201,168,76,0.50)'
        : 'rgba(172,36,77,0.42)'
    } 0%, transparent 68%)"></span>` +
    // Name + time plate above her head, Snap Map style.
    `<span style="position:relative;z-index:2;background:rgba(8,8,12,0.72);color:#fff;font-size:10px;font-weight:600;line-height:1;` +
    `padding:4px 7px;border-radius:9999px;white-space:nowrap;backdrop-filter:blur(4px);margin-bottom:3px">` +
    `${firstName}${recency ? ` <span style="color:rgba(255,255,255,.65);font-weight:500">· ${recency}</span>` : ''}</span>` +
    // The standing figure: a tall capsule of her photo planted on
    // the ground point, gently bobbing like a Snap Map character.
    `<div style="position:relative;z-index:1;animation:pin-bob 2.8s ease-in-out ${delay}s infinite alternate">` +
    `<img src="${escAttr(provider.avatar)}" alt="" loading="lazy" ` +
    `style="width:46px;height:58px;border-radius:999px;object-fit:cover;object-position:top center;background:#222;display:block;` +
    `border:${provider.trustTier === 'elite' ? '3px solid #C9A84C' : '2.5px solid #fff'};` +
    `box-shadow:0 6px 16px rgba(0,0,0,.5)${provider.boosted ? ', 0 0 0 4px rgba(201,168,76,.55)' : ''}"/>` +
    (provider.verified
      ? `<span title="Verified" style="position:absolute;bottom:1px;right:-4px;width:20px;height:20px;` +
        `border-radius:9999px;background:#AC244D;border:2px solid #fff;` +
        `display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4)">` +
        CHECK_SVG +
        `</span>`
      : '') +
    (provider.available
      ? `<span style="position:absolute;top:0;right:-3px;width:14px;height:14px;` +
        `background:#22c55e;border-radius:9999px;border:2.5px solid #fff;` +
        `box-shadow:0 0 0 3px rgba(34,197,94,.35)"></span>`
      : '') +
    `</div>` +
    // Ground shadow: the plant mark. She stands HERE.
    `<span style="width:38px;height:10px;margin-top:2px;border-radius:50%;pointer-events:none;` +
    `background:radial-gradient(ellipse at center, rgba(0,0,0,.55) 0%, transparent 70%);` +
    `animation:pin-shadow 2.8s ease-in-out ${delay}s infinite alternate"></span>` +
    `</div>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelect(provider);
  });
  el.addEventListener('mouseenter', () => {
    const inner = el.firstElementChild as HTMLElement | null;
    if (inner) inner.style.transform = 'scale(1.12)';
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
  negotiableOnly: false,
  city: '',
  budget: null,
  services: [],
};

const CITY_STORAGE_KEY = 'intima_city';

/** City persists after first pick: users never filter twice. */
function loadInitialCity(): string {
  try {
    return localStorage.getItem(CITY_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

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

  const { cities: liveCities, coordOverrides } = useCities();
  const [session, setSession] = useState<Session | null>(null);
  const [providers, setProviders] = useState<MapProvider[]>([]);
  const [providersReady, setProvidersReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  /** True when the raster fallback style is active (gets the dark CSS filter). */
  const [usingRaster, setUsingRaster] = useState(false);
  /** True when the map has been loading too long without reaching ready:
      show an honest error card instead of a silent black screen. */
  const [mapStalled, setMapStalled] = useState(false);
  /** Why the map fell back, shown under Technical details in the fallback. */
  const [mapFailReason, setMapFailReason] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selected, setSelected] = useState<MapProvider | null>(null);
  const [connectionTarget, setConnectionTarget] = useState<MapProvider | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    city: typeof window !== 'undefined' ? loadInitialCity() : '',
  }));
  const [filterOpen, setFilterOpen] = useState(false);
  /** Bumped to re-run map init without a full page reload. */
  const [mapAttempt, setMapAttempt] = useState(0);

  const retryMap = () => {
    setMapStalled(false);
    setMapFailed(false);
    setMapFailReason(null);
    setMapReady(false);
    setUsingRaster(false);
    setMapAttempt((n) => n + 1);
  };

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
          (!filters.negotiableOnly || p.ratesNegotiable) &&
          (!filters.city ||
            p.city === filters.city ||
            p.travelCities.includes(filters.city) ||
            p.travelMode === 'nationwide' ||
            p.nextTour?.city === filters.city) &&
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
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    let rasterTimer: ReturnType<typeof setTimeout> | undefined;
    let rasterTried = false;

    const failMap = (reason: string) => {
      if (cancelled) return;
      setMapFailReason(reason);
      setMapFailed(true);
    };

    /** Switch to the Wikimedia raster tiles when the CARTO vector style
        is unreachable. A map that loads beats a prettier map that stays
        black. */
    const tryRasterFallback = () => {
      if (cancelled || !map || mapRef.current || rasterTried) return;
      rasterTried = true;
      try {
        map.setStyle(OSM_RASTER_STYLE as any);
        setUsingRaster(true);
      } catch {
        // setStyle failed; the stall timer will surface the error card.
      }
    };

    async function init() {
      try {
        // Stall watch: 25s without reaching ready means tiles are blocked.
        // Show an honest error card with retry and list options instead
        // of a silent black screen.
        stallTimer = setTimeout(() => {
          if (!cancelled) setMapStalled(true);
        }, 25000);
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
        // Primary style: Wikimedia raster tiles. Wikimedia Foundation
        // infrastructure is reachable virtually everywhere, unlike
        // commercial vector CDNs that get filtered on some networks.
        // The dark CSS filter keeps our brand. A map that loads beats
        // a prettier map that stays black.
        const useRasterPrimary = true;
        try {
          map = new lib.Map({
            container: containerRef.current,
            style: useRasterPrimary ? (OSM_RASTER_STYLE as any) : CARTO_DARK,
            center: CITY_CENTERS[loadInitialCity()] ?? LAGOS_CENTER,
            zoom: 11,
            attributionControl: { compact: true } as any,
          });
          if (useRasterPrimary) setUsingRaster(true);
          // Markers are DOM overlays: they do not need the tiles.
          // Release them (and the loading veil) the moment the map
          // object exists instead of waiting for the full load
          // event, which only fires after the first tiles paint.
          // Measured on the rig: first pin fell from about 5.9s to
          // the providers fetch time once this gate moved.
          mapRef.current = map;
          setMapReady(true);
        } catch (err) {
          failMap(
            `map init threw: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        map.on('load', () => {
          if (!cancelled) {
            // The compact attribution control starts EXPANDED
            // (maplibregl-compact-show), a white bar across the
            // bottom of the map. Collapse it to its small info
            // toggle on load: the credit the free tiles require
            // stays one tap away instead of shouting over the map.
            containerRef.current
              ?.querySelector('.maplibregl-ctrl-attrib')
              ?.classList.remove('maplibregl-compact-show');
            // Force a resize after load: if the container wasn't fully laid
            // out at init, tiles only cover part of the viewport.
            map?.resize();
            setTimeout(() => { if (!cancelled) map?.resize(); }, 500);
            if (styleTimer) clearTimeout(styleTimer);
            if (stallTimer) clearTimeout(stallTimer);
            if (rasterTimer) clearTimeout(rasterTimer);
            setMapStalled(false);
            mapRef.current = map;
            setMapReady(true);
          }
        });
        // MapLibre fires 'error' for transient tile/sprite/font hiccups as
        // well as fatal style failures. A style failure before load now
        // tries the raster fallback first; only if that also fails does
        // the map give up. Once the style has loaded (mapRef set), failed
        // tiles are retried by the renderer and the map stays up.
        map.on('error', (e) => {
          if (cancelled || mapRef.current) return;
          if (!rasterTried) {
            tryRasterFallback();
            return;
          }
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
        // Stage 2: the style itself. A generous 60s for slow connections,
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
      if (stallTimer) clearTimeout(stallTimer);
      if (rasterTimer) clearTimeout(rasterTimer);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map?.remove();
      mapRef.current = null;
    };
  }, [mapAttempt]);

  // Fly the map to the selected city so its pins are on screen.
  // Skipped on first mount (map already centers on Lagos).
  const firstCityRender = useRef(true);
  useEffect(() => {
    if (firstCityRender.current) {
      firstCityRender.current = false;
      return;
    }
    if (!mapReady || !mapRef.current || mapFailed) return;
    const override = filters.city ? coordOverrides[filters.city] : undefined;
    const center = filters.city
      ? (CITY_CENTERS[filters.city] ?? (override ? [override[1], override[0]] as [number, number] : LAGOS_CENTER))
      : LAGOS_CENTER;
    if (!center) return;
    try {
      mapRef.current.flyTo({ center, zoom: 11, duration: 1200 });
    } catch {
      try {
        mapRef.current.setCenter(center);
        mapRef.current.setZoom(11);
      } catch {
        /* map not ready for camera moves */
      }
    }
  }, [filters.city, mapReady, mapFailed]);

  // Rebuild pins whenever the filtered set changes.
  useEffect(() => {
    if (!mapReady || !mapRef.current || mapFailed) return;
    let cancelled = false;
    async function renderPins() {
      const lib = libRef.current;
      if (cancelled || !mapRef.current || !lib) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = filtered.map((p) =>
        new lib.Marker({ element: markerElement(p, goToProfile), anchor: 'bottom' } as any)
          .setLngLat([p.lng, p.lat])
          .addTo(mapRef.current as MLMap),
      );
    }

    renderPins();
    return () => {
      cancelled = true;
    };
  }, [filtered, mapReady, mapFailed]);

  const toggle = (key: 'verifiedOnly' | 'availableNow' | 'negotiableOnly') =>
    setFilters((f) => ({ ...f, [key]: !f[key] }));

  const clearFilters = () =>
    setFilters((f) => ({ ...EMPTY_FILTERS, city: f.city }));

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

  /** Why a non-local companion matches the active city filter. */
  const travelNoteFor = (p: MapProvider): string | null => {
    const city = filters.city;
    if (!city || p.city === city) return null;
    if (p.nextTour?.city === city) {
      const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
      return `In ${city}, ${f(p.nextTour.start)} to ${f(p.nextTour.end)}`;
    }
    if (p.travelCities.includes(city)) return `Can travel to ${city}`;
    if (p.travelMode === 'nationwide') return 'Can travel anywhere in Nigeria';
    return null;
  };

  const goToProfile = (p: MapProvider) => {
    if (p.userId) {
      router.push(`/companion/${p.username ?? p.userId}`);
      return;
    }
    setSelected(p);
  };

  const handleViewProfile = (p: MapProvider) => {
    if (!p.userId) return;
    if (!session) {
      router.push(`/signup?next=/companion/${p.userId}`);
      return;
    }
    router.push(`/companion/${p.userId}`);
  };

  // Call buttons stay enabled for guests (they route to signup with a
  // notice). They disable only for logged-in users on preview pins.
  const callsDisabled = !!session && !!selected && !selected.userId;

  // A dead map forces the list; the toggle hides to avoid a dead control.
  const showList = view === 'list' || mapFailed;

  return (
    <div
      className="fixed left-0 right-0 top-0 h-dvh w-full overflow-hidden bg-[#111118]"
    >
      <div
        ref={containerRef}
        className={`absolute inset-0 ${usingRaster ? 'map-raster-dark' : ''}`}
      />
      {!mapReady && !mapFailed && !mapStalled && view === 'map' && (
        <div className="absolute inset-0 z-10 overflow-hidden bg-[#111118]">
          {/* Shimmer sweep: guests see intentional loading, not a bug. */}
          <div className="map-shimmer absolute inset-0" />
          {/* Pulsing pin placeholders where providers will appear. */}
          <div className="absolute left-[22%] top-[38%] h-12 w-12 animate-ping rounded-full bg-[#AC244D]/25" />
          <div className="absolute left-[64%] top-[30%] h-12 w-12 animate-ping rounded-full bg-[#AC244D]/25 [animation-delay:0.4s]" />
          <div className="absolute left-[48%] top-[62%] h-12 w-12 animate-ping rounded-full bg-[#AC244D]/25 [animation-delay:0.8s]" />
          <div className="absolute left-[78%] top-[55%] h-12 w-12 animate-ping rounded-full bg-[#AC244D]/25 [animation-delay:1.2s]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="font-display text-2xl font-semibold text-white/90">Intima</p>
            <p className="text-sm text-neutral-400">Finding companions near you…</p>
          </div>
        </div>
      )}
      {mapStalled && !mapReady && !mapFailed && view === 'map' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#111118] px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#AC244D]/15">
            <MapPin aria-hidden className="h-7 w-7 text-[#AC244D]" />
          </div>
          <div>
            <p className="text-base font-semibold text-white">The map is stuck loading</p>
            <p className="mt-1 max-w-xs text-sm text-neutral-400">
              The map tiles are not reaching this device, even on our backup
              tiles. Check your connection, then try again.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={retryMap}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#AC244D] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Try again
            </button>
            <button
              onClick={() => setView('list')}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white"
            >
              View as list
            </button>
          </div>
        </div>
      )}

      {/* Slim floating header: wordmark, city select, auth actions. No marketing copy. */}
      <div className="absolute left-0 right-0 top-0 z-30 px-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-2">
          <div className="glass-dark flex min-w-0 items-center gap-1.5 rounded-full py-1.5 pl-3.5 pr-1.5 sm:gap-2 sm:pl-4">
            <span className="font-display text-lg font-semibold tracking-tight text-white sm:text-xl">Intima<span className="text-gold">.</span></span>
            <div className="relative">
              <select
                value={filters.city}
                onChange={(e) => {
                  const city = e.target.value;
                  setFilters((f) => ({ ...f, city }));
                  try {
                    localStorage.setItem(CITY_STORAGE_KEY, city);
                  } catch {
                    /* persistence is best-effort */
                  }
                }}
                aria-label="Choose city"
                className="min-h-[44px] max-w-[110px] appearance-none truncate rounded-full bg-white/[0.08] py-1.5 pl-3 pr-8 text-base font-medium text-white/90 outline-none transition-colors hover:bg-white/[0.14] sm:max-w-none md:text-sm"
              >
                <option value="" className="text-charcoal">
                  All cities
                </option>
                {liveCities.map((c) => (
                  <option key={c} value={c} className="text-charcoal">
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {session ? (
              <Link
                href="/dashboard"
                className="inline-flex min-h-[44px] items-center rounded-full bg-[#AC244D] px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:bg-[#8F1D40] active:scale-95"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden min-h-[44px] items-center rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 backdrop-blur-md transition-all hover:bg-black/75 active:scale-95 min-[380px]:inline-flex"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex min-h-[44px] items-center rounded-full bg-[#AC244D] px-3.5 py-2 text-sm font-medium text-white shadow-lg transition-all hover:bg-[#8F1D40] active:scale-95 sm:px-4"
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
              className="glass-dark flex shrink-0 items-center rounded-full p-1"
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
                  className={`flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95 ${
                    view === value
                      ? 'bg-white text-charcoal shadow'
                      : 'text-white/75 hover:text-white'
                  }`}
                >
                  <Icon aria-hidden className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* Bybit P2P-style quick filters: compact action chips, clear on/off. */}
          <button
            onClick={() => toggle('verifiedOnly')}
            aria-pressed={filters.verifiedOnly}
            className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold backdrop-blur-md transition-all active:scale-95 ${
              filters.verifiedOnly
                ? 'border-[#AC244D] bg-[#AC244D] text-white shadow-lg'
                : 'border-white/20 bg-black/55 text-white/85 hover:border-white/40 hover:text-white'
            }`}
          >
            <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
            Verified
          </button>
          <button
            onClick={() => toggle('availableNow')}
            aria-pressed={filters.availableNow}
            className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold backdrop-blur-md transition-all active:scale-95 ${
              filters.availableNow
                ? 'border-green-600 bg-green-600 text-white shadow-lg'
                : 'border-white/20 bg-black/55 text-white/85 hover:border-white/40 hover:text-white'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${filters.availableNow ? 'bg-white' : 'bg-green-400'}`} />
            Available
          </button>
          <button
            onClick={() => toggle('negotiableOnly')}
            aria-pressed={filters.negotiableOnly}
            className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold backdrop-blur-md transition-all active:scale-95 ${
              filters.negotiableOnly
                ? 'border-[#C9A84C] bg-[#C9A84C] text-charcoal shadow-lg'
                : 'border-white/20 bg-black/55 text-white/85 hover:border-white/40 hover:text-white'
            }`}
          >
            Negotiable
          </button>
          <button
            onClick={() => setFilterOpen(true)}
            className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium backdrop-blur-md transition-all active:scale-95 ${
              sheetFilterCount > 0
                ? 'bg-[#C9A84C] text-charcoal shadow-lg'
                : 'bg-black/55 text-white ring-1 ring-white/10 hover:bg-black/75'
            }`}
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4" />
            Filters
            {sheetFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-charcoal px-1 text-[11px] font-bold text-white">
                {sheetFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>
      {/* Story tray + comic ribbon: ONE stacked column under the
          header (wordmark row + filter row), so they can never
          overlap each other or the filter chips again. Map view
          only; the list view has its own clean top. */}
      {view === 'map' && (
        <div className="absolute left-0 right-0 top-[calc(118px+env(safe-area-inset-top))] z-30 flex flex-col">
          <StoryTray />
          <ComicRibbon />
        </div>
      )}

      {/* Build tag: tiny, bottom-right. Tells us exactly what version is running. */}
      <div className="pointer-events-none absolute bottom-1 right-2 z-40 select-none text-[11px] text-white/25">
        {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'}
      </div>

      {/* Nearby tray, Snap style: a visible companion count and a
          scrollable row of who is around, above the bottom bar.
          Tapping a face opens the same profile path as her pin. */}
      {view === 'map' && providersReady && filtered.length > 0 && (
        <div
          className="absolute inset-x-0 z-30"
          style={{ bottom: session ? 'calc(76px + env(safe-area-inset-bottom))' : 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-2 px-4 pb-1.5">
            <span className="glass-dark rounded-full px-3 py-1.5 text-xs font-semibold text-white">
              {filtered.length} {filtered.length === 1 ? 'companion' : 'companions'} nearby
            </span>
            <span className="glass-dark flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] text-white/85">
              <BadgeCheck aria-hidden className="h-3 w-3" /> Verified
              <span className="ml-1 h-2 w-2 rounded-full bg-green-500" /> Available now
            </span>
          </div>
          <div className="scroll-row gap-3 px-4 pb-1 pt-1">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => goToProfile(p)}
                className="flex w-14 shrink-0 flex-col items-center gap-1"
                aria-label={`${p.displayName}, ${p.area}`}
              >
                <span className="relative block">
                  <img
                    src={p.avatar}
                    alt=""
                    loading="lazy"
                    className={`h-12 w-12 rounded-full object-cover shadow-lg ${p.trustTier === 'elite' ? 'ring-[2.5px] ring-gold' : 'ring-2 ring-white/85'}`}
                  />
                  {p.available && (
                    <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#111118] bg-green-500" />
                  )}
                </span>
                <span className="w-full truncate text-center text-[10px] font-medium text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.85)]">
                  {p.displayName.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Signed-in bottom bar on the map (guests keep the clean
          full-screen map): same five stops as everywhere else,
          Map popped in the middle. */}
      {session && view === 'map' && (
        <nav className="absolute inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#101016]/92 backdrop-blur-md">
          <div className="grid grid-cols-5 px-1 py-1.5">
            {[
              { href: '/dashboard', label: 'Home', Icon: LayoutDashboard, pop: false, active: false },
              { href: '/live', label: 'Live', Icon: Radio, pop: false, active: false },
              { href: '/', label: 'Map', Icon: MapIcon, pop: true, active: true },
              { href: '/messages', label: 'Messages', Icon: MessageCircle, pop: false, active: false },
              { href: '/dashboard', label: 'More', Icon: LayoutGrid, pop: false, active: false },
            ].map(({ href, label, Icon, pop, active }) => (
              <Link
                key={label}
                href={href}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium ${active ? 'text-white' : 'text-white/50'}`}
              >
                {pop ? (
                  <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-[#AC244D] text-white shadow-[0_8px_20px_rgba(172,36,77,0.5)] ring-4 ring-[#101016]">
                    <Icon className="h-6 w-6" />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                {label}
              </Link>
            ))}
          </div>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </nav>
      )}

      {/* First-class list view. Also the graceful fallback when tiles fail. */}
      {showList && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-cream px-4 pb-10 pt-[124px] [touch-action:pan-y] [overscroll-behavior:contain] [-webkit-overflow-scrolling:touch]">
          {mapFailed && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-100">
              <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
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
          <div className="mb-3 px-1">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-[22px] font-semibold tracking-tight text-charcoal">
                Companions
              </h2>
              {providersReady && (
                <span className="rounded-full bg-[#AC244D]/10 px-3 py-1.5 text-xs font-semibold text-[#AC244D]">
                  {filtered.length} nearby
                </span>
              )}
            </div>
            {providersReady && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                <span>
                  {filtered.length} {filtered.length === 1 ? 'companion' : 'companions'} nearby
                  {filters.city ? ` in ${filters.city}` : ''}
                </span>
                <span className="flex items-center gap-1">
                  <BadgeCheck aria-hidden className="h-3 w-3" /> Verified
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" /> Available now
                </span>
              </p>
            )}
          </div>
          {!providersReady ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {[0, 1, 2, 3].map((i) => (
                <ProviderListSkeleton key={i} />
              ))}
            </ul>
          ) : filtered.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filtered.map((p) => (
                <ProviderListCard key={p.id} provider={p} onSelect={goToProfile} travelNote={travelNoteFor(p)} />
              ))}
            </ul>
          ) : (
            <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-black/[0.04]">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#AC244D]/10">
                <SearchX aria-hidden className="h-6 w-6 text-[#AC244D]" />
              </div>
              <h3 className="font-display text-lg font-semibold text-charcoal">
                No companions match
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                Try widening your budget or clearing a filter.
              </p>
              <button
                onClick={clearFilters}
                className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#AC244D] px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#8F1D40] active:scale-95"
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
          ratesNegotiable={connectionTarget.ratesNegotiable}
          anchorRateNgn={connectionTarget.rateShortTime}
          onClose={() => setConnectionTarget(null)}
          onConnected={() => {
            setConnectionTarget(null);
            showToast({ message: 'You are connected. Chat and calls are unlocked.' });
          }}
        />
      )}

      {toast && (
        <div
          className="absolute inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: 'calc(12rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-3 rounded-full bg-charcoal/95 py-2.5 pl-5 pr-2.5 text-sm text-white shadow-2xl backdrop-blur-md">
            <span>{toast.message}</span>
            {toast.actionLabel && (
              <button
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#AC244D] px-4 py-1.5 font-medium transition-all hover:bg-[#8F1D40] active:scale-95"
              >
                {toast.actionLabel}
              </button>
            )}
            <Tooltip label="Dismiss">
              <button onClick={() => setToast(null)} aria-label="Dismiss" className="-mr-2 flex h-11 w-11 items-center justify-center">
                <X aria-hidden className="h-4 w-4 text-white/70" />
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}
