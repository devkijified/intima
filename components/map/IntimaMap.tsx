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
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  Locate,
  Search,
  Map as MapIcon,
  MapPin,
  BookOpen,
  Radio,
  SearchX,
  SlidersHorizontal,
  X,
} from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import { formatCompactCount } from '@/lib/utils/helpers';
import { useCities } from '@/lib/citiesLive';
import { GAZETTEER_COORDS } from '@/lib/cities';
import {
  fetchMapProviders,
  fetchMapProvidersInBounds,
  fetchMapProviderTotal,
  mockProvidersInBounds,
  type MapBounds,
  type MapProvider,
} from '@/lib/map/providers';
import { buildBaseStages, searchPlaces, type PlaceResult } from '@/lib/map/tiles';
import { DiscoverySheet, type SheetSnap } from './DiscoverySheet';
import Supercluster from 'supercluster';
import { emptySpecFilter, matchesSpec, type SpecFilter } from '@/lib/spec';
import { ProviderSheet } from './ProviderSheet';
import { FilterSheet } from './FilterSheet';
import { ProviderListCard, ProviderListSkeleton } from './ProviderListCard';
import { useCall } from '@/components/calls/CallProvider';
import { RequestConnectionModal } from '@/components/connections/RequestConnectionModal';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * Base map strategy: the chain lives in lib/map/tiles.ts
 * (MapTiler vector when a key is configured, then Wikimedia
 * raster, then OpenStreetMap raster, both rasters under the
 * dark CSS filter). A stage counts as working only when one of
 * its tiles has genuinely painted (see the sourcedata proof in
 * the init effect): the MapLibre 'load' event alone is NOT
 * proof, it fires for a style whose tiles never arrive. The
 * other half of the historical black-map bug was never tiles:
 * maplibre-gl.css sets the container to position: relative,
 * which beat the Tailwind absolute classes and collapsed it to
 * zero height. The container carries inline position styles
 * (see the JSX) and a ResizeObserver keeps the canvas matched
 * to its box for the map's whole life.
 */
const BASE_STAGES = buildBaseStages();

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
  /** Her spec, from lib/spec.ts. Empty groups = no spec filter. */
  spec: SpecFilter;
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


const HEAT_SOURCE_ID = 'intima-heat';

/** Grow a bounds box by a fraction on every side, so small pans
    stay inside ground that is already loaded. */
function padBounds(b: MapBounds, frac: number): MapBounds {
  const dLat = (b.maxLat - b.minLat) * frac;
  const dLng = (b.maxLng - b.minLng) * frac;
  return {
    minLat: b.minLat - dLat,
    maxLat: b.maxLat + dLat,
    minLng: b.minLng - dLng,
    maxLng: b.maxLng + dLng,
  };
}

function boundsContain(outer: MapBounds, inner: MapBounds): boolean {
  return (
    inner.minLat >= outer.minLat &&
    inner.maxLat <= outer.maxLat &&
    inner.minLng >= outer.minLng &&
    inner.maxLng <= outer.maxLng
  );
}

function boundsOf(map: MLMap): MapBounds {
  const b = map.getBounds();
  return { minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast() };
}

/**
 * A cluster bubble: Intima burgundy with the group's count.
 * Clusters are MapLibre-agnostic DOM markers like the pins;
 * supercluster decides the grouping per zoom, this is only
 * the face. Tap zooms to the group's expansion zoom.
 */
function clusterElement(count: number, onTap: () => void): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'intima-cluster';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${count} companions grouped here`);
  el.innerHTML =
    `<div style="position:relative;cursor:pointer;width:54px;height:54px">` +
    `<span style="position:absolute;inset:0;border-radius:9999px;background:radial-gradient(circle, rgba(201,168,76,0.45) 0%, transparent 70%)"></span>` +
    `<span style="position:absolute;inset:7px;border-radius:9999px;background:rgba(172,36,77,0.94);border:2px solid rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;box-shadow:0 6px 16px rgba(0,0,0,.5)">${count > 999 ? formatCompactCount(count) : count}</span>` +
    `</div>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onTap();
  });
  return el;
}
const HEAT_LAYER_ID = 'intima-heat';

/**
 * Keep the heat layer fed with the same companion points the markers
 * use. Available companions weigh 1, the rest 0.35, so busy available
 * areas glow with Snap's spectral ramp (blue to red), Snap Map style. Adds the
 * source and layer on first call (after the style has loaded),
 * afterwards just swaps the data. Each step is guarded separately:
 * before the style loads, addSource throws and the load handler
 * re-runs the sync once the style is ready. Safe over the raster
 * fallback too: a GeoJSON source works on any style.
 */
function syncHeatLayer(map: MLMap, list: MapProvider[]): void {
  const data = {
    type: 'FeatureCollection',
    features: list.map((p) => ({
      type: 'Feature',
      properties: { weight: p.available ? 1 : 0.35 },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  };
  try {
    if (!map.getSource(HEAT_SOURCE_ID)) {
      map.addSource(HEAT_SOURCE_ID, { type: 'geojson', data } as never);
    }
  } catch {
    /* style not ready yet; retried on load */
  }
  try {
    const src = map.getSource(HEAT_SOURCE_ID) as unknown as
      | { setData: (d: unknown) => void }
      | undefined;
    if (src) src.setData(data);
  } catch {
    /* source vanished with a style swap; the layer step below re-adds on next sync */
  }
  try {
    if (!map.getLayer(HEAT_LAYER_ID) && map.getSource(HEAT_SOURCE_ID)) {
      map.addLayer({
        id: HEAT_LAYER_ID,
        type: 'heatmap',
        source: HEAT_SOURCE_ID,
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.7,
            12, 1.0,
            14, 1.4,
          ],
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 22,
            12, 34,
            14, 52,
          ],
          // Snap's spectral ramp: deep blue at low density through
          // cyan, green and yellow to orange and red at the peak.
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.15, 'rgba(16,52,166,0.55)',
            0.3, '#00c2e0',
            0.45, '#2fd35f',
            0.6, '#ffd60a',
            0.8, '#ff7b1c',
            1.0, '#f72c1d',
          ],
          // Pins own street level: the glow fades out by zoom 14.
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            12, 1,
            14, 0,
          ],
        },
      } as never);
    }
  } catch {
    /* style not ready yet; retried on load */
  }
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
    // Name + time plate above her head. Hidden while the pin is
    // selected: the selected pin shows the one Snap-style plate
    // under the figure instead, never two name plates at once.
    `<span class="intima-pin-topplate" style="position:relative;z-index:2;background:rgba(8,8,12,0.72);color:#fff;font-size:10px;font-weight:600;line-height:1;` +
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
    // Selected plate under the figure, Snap Map style: dark glass,
    // first name plus her availability word. CSS in globals.css
    // (.intima-pin-plate) keeps it hidden until the pin carries
    // the .intima-pin-selected class.
    `<span class="intima-pin-plate"><span class="pin-plate-dot${provider.available ? ' on' : ''}"></span>` +
    `<span class="pin-plate-text">${firstName} · ${provider.available ? 'Available now' : 'Away'}</span></span>` +
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
  spec: emptySpecFilter(),
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
  const markersByKeyRef = useRef<Map<string, MLMarker>>(new Map());
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
  const [usingRaster, setUsingRaster] = useState(true);
  /** True when the map has been loading too long without reaching ready:
      show an honest error card instead of a silent black screen. */
  const [mapStalled, setMapStalled] = useState(false);
  /** Why the map fell back, shown under Technical details in the fallback. */
  const [mapFailReason, setMapFailReason] = useState<string | null>(null);
  const [forceList, setForceList] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [remotePlaces, setRemotePlaces] = useState<PlaceResult[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selected, setSelected] = useState<MapProvider | null>(null);
  /** Pin id carrying the selected name plate on the map. */
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  /** Live pin elements by provider id, for the selected plate toggle. */
  const pinElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  /** Bumped when a style reaches load, so the heat layer re-syncs
      onto the fresh style (initial load or raster fallback). */
  const [styleEpoch, setStyleEpoch] = useState(0);
  /** Area name chip (Snap shows the current area at the top): the
      active city filter, or the gazetteer city nearest the settled
      map centre. Null = chip hidden. */
  const [areaName, setAreaName] = useState<string | null>(null);
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

  // Providers load per viewport and accumulate: panning fetches
  // the new ground (padded, debounced by the settle listener),
  // never the whole directory, so the map stays fast at 100 or
  // at 100,000 companions. The data mode latches once: when the
  // directory itself is known empty, the preview pins stand in;
  // a populated directory never mixes them in.
  const providersByIdRef = useRef<Map<string, MapProvider>>(new Map());
  const dataModeRef = useRef<'unknown' | 'db' | 'mock'>('unknown');
  const lastFetchedBoundsRef = useRef<MapBounds | null>(null);
  const loadRunRef = useRef(0);

  const mergeProviders = (list: MapProvider[]) => {
    if (list.length === 0) return;
    const byId = providersByIdRef.current;
    for (const p of list) {
      if (!byId.has(p.id) && byId.size >= 3000) continue;
      byId.set(p.id, p);
    }
    setProviders([...byId.values()]);
  };

  const loadForBounds = async (raw: MapBounds) => {
    const padded = padBounds(raw, 0.3);
    if (lastFetchedBoundsRef.current && boundsContain(lastFetchedBoundsRef.current, padded)) return;
    lastFetchedBoundsRef.current = padded;
    const run = ++loadRunRef.current;
    try {
      if (dataModeRef.current === 'unknown') {
        const total = await fetchMapProviderTotal();
        dataModeRef.current = total === 0 ? 'mock' : 'db';
      }
      if (dataModeRef.current === 'mock') {
        mergeProviders(mockProvidersInBounds(padded));
        setProvidersReady(true);
        return;
      }
      const list = await fetchMapProvidersInBounds(padded);
      if (run !== loadRunRef.current) return;
      mergeProviders(list);
      setProvidersReady(true);
    } catch {
      if (run !== loadRunRef.current) return;
      // Offline or the view errored: preview pins keep the map
      // useful for this viewport instead of an empty screen.
      mergeProviders(mockProvidersInBounds(padded));
      setProvidersReady(true);
    }
  };
  const loadForBoundsRef = useRef(loadForBounds);
  loadForBoundsRef.current = loadForBounds;

  // Place search: debounced, provider-backed (lib/map/tiles).
  // Local results (cities, companions) never depend on it.
  useEffect(() => {
    if (!searchOpen || query.trim().length < 3) {
      setRemotePlaces([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchPlaces(query);
        if (!cancelled) {
          setRemotePlaces(r);
          setSearchFailed(false);
        }
      } catch {
        if (!cancelled) {
          setRemotePlaces([]);
          setSearchFailed(true);
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, searchOpen]);

  // A dead map has no viewport to load by: fill the fallback
  // list the original way, one whole-directory read.
  useEffect(() => {
    if (!mapFailed) return;
    let cancelled = false;
    fetchMapProviders().then((list) => {
      if (!cancelled) {
        mergeProviders(list);
        setProvidersReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mapFailed]);

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
            filters.services.every((s) => p.services.includes(s))) &&
          // Spec: alternatives inside a group, strict across groups.
          matchesSpec(p.spec, filters.spec),
      ),
    [providers, filters],
  );

  // Mirrors for the map event handlers, which are registered once
  // and must never read stale render state.
  const filteredRef = useRef<MapProvider[]>([]);
  const selectedPinIdRef = useRef<string | null>(null);
  const cityFilterRef = useRef('');
  useEffect(() => {
    filteredRef.current = filtered;
  }, [filtered]);
  useEffect(() => {
    selectedPinIdRef.current = selectedPinId;
  }, [selectedPinId]);
  useEffect(() => {
    cityFilterRef.current = filters.city;
  }, [filters.city]);

  /**
   * Decide every pin's under-plate at the current zoom, Snap style.
   * Pins whose ground points sit within a pin width of each other
   * overlap visually, so they group: the first pin of the group
   * carries one plate, "FirstName & N more", and the rest carry
   * none. This is a display grouping at render time only; the data
   * layer is untouched. The selected pin always carries its own
   * plate (name plus availability word) and suppresses its group's
   * plate. Runs after pins render and whenever the map settles.
   */
  const refreshPlates = () => {
    const map = mapRef.current;
    if (!map) return;
    const list = filteredRef.current;
    const selectedId = selectedPinIdRef.current;
    const OVERLAP_PX = 56;
    interface Placed { p: MapProvider; x: number; y: number }
    let placed: Placed[] = [];
    try {
      placed = list.map((p) => {
        const pt = map.project([p.lng, p.lat]);
        return { p, x: pt.x, y: pt.y };
      });
    } catch {
      return; // map mid-teardown; the next settle re-runs this
    }
    const assigned = new Set<string>();
    const plateFor = new Map<string, { text: string; dot: boolean }>();
    for (const item of placed) {
      if (assigned.has(item.p.id)) continue;
      const group = placed.filter(
        (o) =>
          !assigned.has(o.p.id) &&
          Math.hypot(o.x - item.x, o.y - item.y) < OVERLAP_PX,
      );
      group.forEach((o) => assigned.add(o.p.id));
      if (group.length < 2) continue;
      if (group.some((o) => o.p.id === selectedId)) continue; // selected plate wins
      const rep = group[0].p;
      plateFor.set(rep.id, {
        text: `${rep.displayName.split(' ')[0] ?? rep.displayName} & ${group.length - 1} more`,
        dot: false,
      });
    }
    pinElsRef.current.forEach((el, id) => {
      const isSelected = id === selectedId;
      el.classList.toggle('intima-pin-selected', isSelected);
      const plate = el.querySelector('.intima-pin-plate') as HTMLElement | null;
      const textEl = el.querySelector('.pin-plate-text') as HTMLElement | null;
      const dotEl = el.querySelector('.pin-plate-dot') as HTMLElement | null;
      if (!plate || !textEl) return;
      if (isSelected) {
        const p = list.find((x) => x.id === id);
        if (p) {
          textEl.textContent = `${p.displayName.split(' ')[0] ?? p.displayName} · ${p.available ? 'Available now' : 'Away'}`;
          if (dotEl) {
            dotEl.style.display = '';
            dotEl.classList.toggle('on', p.available);
          }
        }
        plate.classList.add('plate-on');
        return;
      }
      const group = plateFor.get(id);
      if (group) {
        textEl.textContent = group.text;
        if (dotEl) dotEl.style.display = 'none';
        plate.classList.add('plate-on');
      } else {
        plate.classList.remove('plate-on');
      }
    });
  };

  /**
   * Area chip content: the active city filter wins; otherwise the
   * gazetteer city nearest the settled map centre, shown only when
   * the centre is actually near it (within about 60 km), never a
   * faraway guess.
   */
  const updateAreaName = () => {
    const city = cityFilterRef.current;
    if (city) {
      setAreaName(city);
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    try {
      const c = map.getCenter();
      let best: string | null = null;
      let bestKm = Infinity;
      for (const [name, [lat, lng]] of Object.entries(GAZETTEER_COORDS)) {
        const dLat = ((lat - c.lat) * Math.PI) / 180;
        const dLng = ((lng - c.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((c.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (km < bestKm) {
          bestKm = km;
          best = name;
        }
      }
      setAreaName(bestKm <= 60 ? best : null);
    } catch {
      /* centre unreadable mid-teardown; keep the last name */
    }
  };

  // Initialise the map once. maplibre-gl is imported lazily so a failed
  // download degrades to the honest fallback list instead of a crash.
  // Every failure path records a reason, surfaced under Technical details
  // in the fallback so a real device can report what actually broke.
  useEffect(() => {
    let cancelled = false;
    let map: MLMap | null = null;
    let containerObserver: ResizeObserver | undefined;
    let bundleTimer: ReturnType<typeof setTimeout> | undefined;
    let baseTimer: ReturnType<typeof setTimeout> | undefined;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    // The base chain state. A stage counts as working only when one of
    // its tiles has actually painted (baseProven, set from the
    // sourcedata handler below). The MapLibre 'load' event is not
    // proof: it fired happily for the vector build that shipped black.
    let baseStage = 0;
    let baseProven = false;
    let tileErrors = 0;

    const failMap = (reason: string) => {
      if (cancelled) return;
      setMapFailReason(reason);
      setMapFailed(true);
    };

    const armBaseTimer = () => {
      if (baseTimer) clearTimeout(baseTimer);
      baseTimer = setTimeout(() => {
        if (!cancelled && !baseProven)
          stepDownBase(`base stage ${baseStage} painted no tile within 7s`);
      }, 7000);
    };

    /** Move one step down the base chain (Wikimedia, then OSM). The
        last stage failing gives up to the honest list. A map that
        loads beats a prettier map that stays black. */
    const stepDownBase = (reason: string) => {
      if (cancelled || !map || baseProven) return;
      if (baseStage >= BASE_STAGES.length - 1) {
        failMap(`${reason}; every base source failed`);
        return;
      }
      baseStage += 1;
      tileErrors = 0;
      const stage = BASE_STAGES[baseStage];
      try {
        map.setStyle(stage.style as any);
        setUsingRaster(stage.filtered);
      } catch {
        failMap(`${reason}; switching the base style threw`);
        return;
      }
      armBaseTimer();
    };

    /** A tile from the current base source reached the screen: the
        base is real. Stand the watchdogs down. */
    const markBaseProven = () => {
      if (cancelled || baseProven) return;
      baseProven = true;
      if (baseTimer) clearTimeout(baseTimer);
      if (stallTimer) clearTimeout(stallTimer);
      setMapStalled(false);
    };

    async function init() {
      try {
        // Stall watch: 25s without a painted tile means the network is
        // crawling. Show the honest slow card instead of a silent
        // black screen (the chain keeps trying underneath).
        stallTimer = setTimeout(() => {
          if (!cancelled && !baseProven) setMapStalled(true);
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
        // Primary base: the Wikimedia raster style, inline, so the
        // first paint depends only on small image tiles. The
        // step-down chain behind it is driven by tile proof, not by
        // the load event.
        try {
          map = new lib.Map({
            container: containerRef.current,
            style: BASE_STAGES[0].style as any,
            center: CITY_CENTERS[loadInitialCity()] ?? LAGOS_CENTER,
            zoom: 11,
            attributionControl: { compact: true } as any,
          });
          // Markers are DOM overlays: they do not need the tiles.
          // Release them (and the loading veil) the moment the map
          // object exists instead of waiting for the full load
          // event, which only fires after the first tiles paint.
          // Measured on the rig: first pin fell from about 5.9s to
          // the providers fetch time once this gate moved.
          mapRef.current = map;
          setMapReady(true);
          armBaseTimer();
          // The container is NOT at its final height when the map is
          // created: measured on the rig, it starts around 300px
          // tall and settles to full height as the page's trays and
          // bars lay out. MapLibre sizes its canvas once, from the
          // box it sees at creation, so without this observer the
          // tiles paint into a short, misprojected canvas in the top
          // strip and the rest of the screen stays page-black, on
          // real phones as much as in the rig (URL bar collapse and
          // rotation change the box too). Watch the box for the
          // map's whole life and resize on every change.
          if (containerRef.current && typeof ResizeObserver !== 'undefined') {
            containerObserver = new ResizeObserver(() => {
              try {
                map?.resize();
              } catch {
                /* mid-teardown; ignore */
              }
            });
            containerObserver.observe(containerRef.current);
          }
        } catch (err) {
          failMap(
            `map init threw: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        map.on('load', () => {
          // Bump the style epoch so the heat layer syncs onto this
          // style (and re-syncs after every step-down).
          if (!cancelled) setStyleEpoch((n) => n + 1);
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
            mapRef.current = map;
            setMapReady(true);
          }
        });
        // The proof: a sourcedata event carrying a tile for the
        // CURRENT base source whose state is genuinely 'loaded'.
        // MapLibre also reports ERRORED tiles as source-loaded (so
        // the map does not hang waiting on them), and counting those
        // as proof is exactly how the first version of this chain
        // certified a black map. Only a real loaded tile proves the
        // base paints.
        map.on('sourcedata', (e) => {
          if (cancelled || baseProven) return;
          const ev = e as unknown as {
            sourceId?: string;
            tile?: { state?: string };
          };
          const stageSource = BASE_STAGES[baseStage].sourceId;
          if (
            (stageSource === null || ev.sourceId === stageSource) &&
            ev.tile &&
            ev.tile.state === 'loaded'
          ) {
            markBaseProven();
          }
        });
        // Tile and source errors before proof count against the
        // current stage; four of them step the base down at once
        // instead of waiting out the stage budget. After proof the
        // renderer retries failed tiles on its own and the map
        // stays up.
        map.on('error', () => {
          if (cancelled || baseProven) return;
          tileErrors += 1;
          if (tileErrors >= 4)
            stepDownBase(`base stage ${baseStage} tiles kept failing`);
        });
      } catch (err) {
        failMap(
          `bundle import threw: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    init();
    return () => {
      cancelled = true;
      containerObserver?.disconnect();
      if (bundleTimer) clearTimeout(bundleTimer);
      if (baseTimer) clearTimeout(baseTimer);
      if (stallTimer) clearTimeout(stallTimer);
      markersByKeyRef.current.forEach((m) => m.remove());
      markersByKeyRef.current.clear();
      pinElsRef.current.clear();
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

  // Clustering: supercluster groups the filtered set per zoom;
  // the camera only changes which clusters and pins render.
  // Only rendered items exist as DOM markers, and a marker is
  // created once per key, so panning never rebuilds the world.
  const clusterIndexRef = useRef<Supercluster | null>(null);

  const renderViewport = (force = false) => {
    const map = mapRef.current;
    const lib = libRef.current;
    const idx = clusterIndexRef.current;
    if (!map || !lib || !idx) return;
    if (force) {
      markersByKeyRef.current.forEach((m) => m.remove());
      markersByKeyRef.current.clear();
      pinElsRef.current.clear();
    }
    let feats: Array<{
      properties?: { cluster?: boolean; cluster_id?: number; point_count?: number; providerId?: string };
      geometry: { coordinates: [number, number] };
    }> = [];
    try {
      const b = map.getBounds();
      const z = Math.max(0, Math.min(20, Math.floor(map.getZoom())));
      feats = idx.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], z) as unknown as typeof feats;
    } catch {
      return; // map mid-teardown; the next settle re-renders
    }
    const want = new Set<string>();
    for (const f of feats) {
      const props = f.properties ?? {};
      const coords = f.geometry.coordinates;
      if (props.cluster) {
        const key = `cluster-${props.cluster_id}`;
        want.add(key);
        if (!markersByKeyRef.current.has(key)) {
          const cid = props.cluster_id as number;
          const el = clusterElement(props.point_count ?? 0, () => {
            const index = clusterIndexRef.current;
            const m = mapRef.current;
            if (!index || !m) return;
            try {
              const ez = index.getClusterExpansionZoom(cid);
              m.easeTo({ center: coords, zoom: Math.min(ez, 17), duration: 700 });
            } catch {
              /* cluster gone with a data swap; ignore */
            }
          });
          const marker = new lib.Marker({ element: el, anchor: 'center' } as any)
            .setLngLat(coords)
            .addTo(map as MLMap);
          markersByKeyRef.current.set(key, marker);
        }
      } else {
        const provider = filteredRef.current.find((x) => x.id === props.providerId);
        if (!provider) continue;
        want.add(provider.id);
        if (!markersByKeyRef.current.has(provider.id)) {
          const el = markerElement(provider, previewProvider);
          pinElsRef.current.set(provider.id, el);
          const marker = new lib.Marker({ element: el, anchor: 'bottom' } as any)
            .setLngLat([provider.lng, provider.lat])
            .addTo(map as MLMap);
          markersByKeyRef.current.set(provider.id, marker);
        }
      }
    }
    for (const [key, marker] of [...markersByKeyRef.current]) {
      if (!want.has(key)) {
        marker.remove();
        markersByKeyRef.current.delete(key);
        if (!key.startsWith('cluster-')) pinElsRef.current.delete(key);
      }
    }
    refreshPlates();
  };
  const renderViewportRef = useRef(renderViewport);
  renderViewportRef.current = renderViewport;

  // Rebuild the cluster index whenever the filtered set changes
  // and repaint from scratch: filter changes are user-paced, so
  // a clean rebuild beats diffing two cluster trees.
  useEffect(() => {
    const idx = new Supercluster({ radius: 64, maxZoom: 16, minPoints: 2 });
    idx.load(
      filtered.map((p) => ({
        type: 'Feature' as const,
        properties: { providerId: p.id },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
      })),
    );
    clusterIndexRef.current = idx;
    renderViewportRef.current(true);
  }, [filtered]);

  // Heat layer: the same filtered points the pins use, re-synced
  // whenever they change and whenever a fresh style loads (style
  // epoch), so the glow always matches who is actually on the map.
  useEffect(() => {
    if (!mapReady || !mapRef.current || mapFailed) return;
    syncHeatLayer(mapRef.current, filtered);
  }, [filtered, mapReady, mapFailed, styleEpoch]);

  // Plates: recomputed whenever the selection or the pin set
  // changes, and again on every map settle (see the listener below),
  // because overlap grouping is a function of the current zoom.
  useEffect(() => {
    refreshPlates();
  }, [selectedPinId, filtered, mapReady]);

  // Map settle: regroup the plates for the new zoom and refresh the
  // area name chip. Registered per map instance (retries swap it).
  useEffect(() => {
    if (!mapReady || mapFailed) return;
    const map = mapRef.current;
    if (!map) return;
    let renderTimer: ReturnType<typeof setTimeout> | undefined;
    let fetchTimer: ReturnType<typeof setTimeout> | undefined;
    const onSettle = () => {
      refreshPlates();
      updateAreaName();
      try {
        setBounds(boundsOf(map));
      } catch {
        /* mid-teardown; keep the last bounds */
      }
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => renderViewportRef.current(false), 120);
      if (fetchTimer) clearTimeout(fetchTimer);
      fetchTimer = setTimeout(() => {
        try {
          loadForBoundsRef.current(boundsOf(map));
        } catch {
          /* mid-teardown; the next settle retries */
        }
      }, 500);
    };
    // A tap on open map ground settles the overlays back: the
    // discovery sheet returns to its peek and search closes.
    const onMapTap = () => {
      setSheetSnap('peek');
      setSearchOpen(false);
    };
    map.on('moveend', onSettle);
    map.on('click', onMapTap);
    onSettle();
    updateAreaName();
    return () => {
      map.off('moveend', onSettle);
      map.off('click', onMapTap);
      if (renderTimer) clearTimeout(renderTimer);
      if (fetchTimer) clearTimeout(fetchTimer);
    };
  }, [mapReady, mapFailed, mapAttempt]);

  // The area chip follows the city filter immediately, not only
  // after the fly-to settles.
  useEffect(() => {
    updateAreaName();
  }, [filters.city]);

  const toggle = (key: 'verifiedOnly' | 'availableNow' | 'negotiableOnly') =>
    setFilters((f) => ({ ...f, [key]: !f[key] }));

  const clearFilters = () =>
    setFilters((f) => ({ ...EMPTY_FILTERS, city: f.city }));

  /** Active sheet filters, shown as a badge on the Filters button. */
  const sheetFilterCount =
    (filters.budget !== null ? 1 : 0) +
    filters.services.length +
    filters.spec.complexions.length +
    filters.spec.bodyTypes.length +
    filters.spec.heights.length +
    filters.spec.tags.length;

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

  /** Map-surface selections (pin tap, nearby tray) open the preview
      sheet first, the way every map app behaves: the map stays put,
      she is previewed in the sheet, and the full profile is one more
      deliberate tap on View profile. List cards are a browsing
      surface, so they keep going straight to the full profile. */
  const previewProvider = (p: MapProvider) => {
    setSelectedPinId(p.id);
    setSelected(p);
  };

  /** List selection: mark the pin, then the normal profile path. */
  const selectPin = (p: MapProvider) => {
    setSelectedPinId(p.id);
    goToProfile(p);
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

  // A dead map forces the list; the stalled card can ask for it too.
  const showList = mapFailed || forceList;

  /** Companions inside the settled map view, filters applied. */
  const inView = useMemo(() => {
    if (!bounds) return filtered;
    return filtered.filter(
      (p) => p.lat >= bounds.minLat && p.lat <= bounds.maxLat && p.lng >= bounds.minLng && p.lng <= bounds.maxLng,
    );
  }, [filtered, bounds]);

  /** Sheet order: boosted first, then available, then best rated. */
  const sheetProviders = useMemo(
    () =>
      [...inView].sort(
        (a, b) =>
          Number(b.boosted ?? false) - Number(a.boosted ?? false) ||
          Number(b.available) - Number(a.available) ||
          (b.rating ?? 0) - (a.rating ?? 0),
      ),
    [inView],
  );

  const filtersActive =
    filters.verifiedOnly || filters.availableNow || filters.negotiableOnly || sheetFilterCount > 0;

  /** Distance from the user, only when they shared a position. */
  const distanceKmFor = (p: MapProvider): number | null => {
    if (!userPos) return null;
    const dLat = ((p.lat - userPos.lat) * Math.PI) / 180;
    const dLng = ((p.lng - userPos.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((userPos.lat * Math.PI) / 180) * Math.cos((p.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const handleRecenter = () => {
    if (!('geolocation' in navigator)) {
      showToast({ message: 'This browser cannot share your location.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(here);
        try {
          mapRef.current?.flyTo({ center: [here.lng, here.lat], zoom: 13, duration: 1200 });
        } catch {
          /* map not ready for camera moves */
        }
      },
      () => {
        showToast({
          message:
            'Location is off for this browser, so the map cannot centre on you. The city picker above still takes you anywhere.',
        });
      },
      { timeout: 10000, maximumAge: 300000 },
    );
  };

  /** Sheet row tap: settle the sheet, centre her pin, preview her. */
  const handleSheetSelect = (p: MapProvider) => {
    setSheetSnap('peek');
    setSelectedPinId(p.id);
    try {
      const map = mapRef.current;
      if (map) map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 13), duration: 800 });
    } catch {
      /* map not ready for camera moves */
    }
    setSelected(p);
  };

  // Search: everything matches against real loaded data. Cities
  // come from the app's own gazetteer and live city list; places
  // from the configured geocoder; companions from the directory
  // rows the map has actually loaded.
  const companionMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return providers
      .filter(
        (p) =>
          p.displayName.toLowerCase().includes(q) ||
          p.area.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [providers, query]);

  const cityMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const names = new Set<string>([...liveCities, ...Object.keys(GAZETTEER_COORDS), ...Object.keys(CITY_CENTERS)]);
    return [...names].filter((n) => n.toLowerCase().includes(q)).slice(0, 5);
  }, [liveCities, query]);

  const pickCity = (city: string) => {
    setFilters((f) => ({ ...f, city }));
    try {
      localStorage.setItem(CITY_STORAGE_KEY, city);
    } catch {
      /* persistence is best-effort */
    }
    setSearchOpen(false);
    setQuery('');
  };

  const pickPlace = (pl: PlaceResult) => {
    setSearchOpen(false);
    setQuery('');
    try {
      mapRef.current?.flyTo({ center: [pl.lng, pl.lat], zoom: 12, duration: 1200 });
    } catch {
      /* map not ready for camera moves */
    }
  };

  const pickCompanion = (p: MapProvider) => {
    setSearchOpen(false);
    setQuery('');
    try {
      mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 14, duration: 1000 });
    } catch {
      /* map not ready for camera moves */
    }
    previewProvider(p);
  };

  return (
    <div
      className="fixed left-0 right-0 top-0 h-dvh w-full overflow-hidden bg-[#04070c]"
    >
      <div
        ref={containerRef}
        // Inline position and inset, deliberately NOT just Tailwind
        // classes: maplibre-gl.css declares .maplibregl-map with
        // position: relative, and when that stylesheet wins the
        // cascade over the utilities the container collapses to
        // zero height and the map ships black (measured on the rig:
        // container 390x0 while its fixed parent was 390x844).
        // Inline styles outrank every stylesheet, so the map box
        // always fills its parent.
        style={{ position: 'absolute', inset: 0 }}
        className={usingRaster ? 'map-raster-dark' : undefined}
      />
      {!mapReady && !mapFailed && !mapStalled && !showList && (
        <div className="absolute inset-0 z-10 overflow-hidden bg-[#04070c]">
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
      {mapStalled && !mapReady && !mapFailed && !showList && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#04070c] px-6 text-center">
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
              onClick={() => setForceList(true)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white"
            >
              View as list
            </button>
          </div>
        </div>
      )}

      {/* Floating discovery header: one search card and one
          chips row, so the map stays the screen. Secondary
          actions live in the filter sheet and the discovery
          sheet below. */}
      <div className="absolute left-0 right-0 top-0 z-30 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="relative">
          <div className="glass-dark flex items-center gap-1.5 rounded-full py-1.5 pl-4 pr-1.5 shadow-xl">
            <Search aria-hidden className="h-5 w-5 shrink-0 text-white/60" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search companions or places"
              aria-label="Search companions or places"
              className="min-h-[40px] min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-white/45 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  setSearchOpen(false);
                }}
                aria-label="Clear search"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setFilterOpen(true)}
              aria-label="Open filters"
              className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-all active:scale-95 ${
                sheetFilterCount > 0
                  ? 'bg-[#C9A84C] text-charcoal shadow-lg'
                  : 'bg-[#AC244D] text-white hover:bg-[#8F1D40]'
              }`}
            >
              <SlidersHorizontal aria-hidden className="h-4 w-4" />
              <span className="hidden min-[380px]:inline">Filters</span>
              {sheetFilterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-charcoal px-1 text-[11px] font-bold text-white">
                  {sheetFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Search results: real data only. Cities from the
              app gazetteer, places from the configured geocoder,
              companions from the loaded directory rows. */}
          {searchOpen && query.trim().length >= 2 && (
            <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-3xl bg-[#14141c]/95 shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
              {cityMatches.length === 0 && remotePlaces.length === 0 && companionMatches.length === 0 ? (
                <p className="px-4 py-3.5 text-sm text-white/60">
                  No matches for &ldquo;{query.trim()}&rdquo;.
                  {searchFailed && ' Place search is unavailable right now.'}
                </p>
              ) : (
                <ul className="max-h-[46dvh] overflow-y-auto py-1.5">
                  {cityMatches.map((name) => (
                    <li key={`city-${name}`}>
                      <button
                        onClick={() => pickCity(name)}
                        className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-white/5 active:bg-white/10"
                      >
                        <MapPin aria-hidden className="h-5 w-5 shrink-0 text-[#C9A84C]" />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">{name}</span>
                        <span className="shrink-0 text-xs text-white/45">City</span>
                      </button>
                    </li>
                  ))}
                  {remotePlaces.map((pl) => (
                    <li key={`place-${pl.label}-${pl.lng}-${pl.lat}`}>
                      <button
                        onClick={() => pickPlace(pl)}
                        className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-white/5 active:bg-white/10"
                      >
                        <MapPin aria-hidden className="h-5 w-5 shrink-0 text-white/60" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-white">{pl.label}</span>
                          {pl.detail && pl.detail !== pl.label && (
                            <span className="block truncate text-xs text-white/45">{pl.detail}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-white/45">Place</span>
                      </button>
                    </li>
                  ))}
                  {companionMatches.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => pickCompanion(p)}
                        className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-white/5 active:bg-white/10"
                      >
                        <img src={p.avatar} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/20" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[15px] font-medium text-white">{p.displayName}</span>
                            {p.verified && <BadgeCheck aria-hidden className="h-4 w-4 shrink-0 text-[#C9A84C]" />}
                          </span>
                          <span className="block truncate text-xs text-white/45">
                            {p.area} · {p.city}
                          </span>
                        </span>
                        {p.available && <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" aria-label="Available now" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Quick row: city, the two standing discovery toggles,
            and the guest auth actions at the end. */}
        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="relative shrink-0">
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
              className="min-h-[40px] max-w-[118px] appearance-none truncate rounded-full bg-black/55 py-2 pl-3.5 pr-8 text-[13px] font-semibold text-white/90 ring-1 ring-white/10 backdrop-blur-md outline-none transition-colors hover:bg-black/75"
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
          <button
            onClick={() => toggle('verifiedOnly')}
            aria-pressed={filters.verifiedOnly}
            className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-semibold backdrop-blur-md transition-all active:scale-95 ${
              filters.verifiedOnly
                ? 'border-[#AC244D] bg-[#AC244D] text-white shadow-lg'
                : 'border-white/15 bg-black/55 text-white/85 hover:border-white/40 hover:text-white'
            }`}
          >
            <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
            Verified
          </button>
          <button
            onClick={() => toggle('availableNow')}
            aria-pressed={filters.availableNow}
            className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-semibold backdrop-blur-md transition-all active:scale-95 ${
              filters.availableNow
                ? 'border-green-600 bg-green-600 text-white shadow-lg'
                : 'border-white/15 bg-black/55 text-white/85 hover:border-white/40 hover:text-white'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${filters.availableNow ? 'bg-white' : 'bg-green-400'}`} />
            Available
          </button>
          <button
            onClick={() => toggle('negotiableOnly')}
            aria-pressed={filters.negotiableOnly}
            className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-semibold backdrop-blur-md transition-all active:scale-95 ${
              filters.negotiableOnly
                ? 'border-[#C9A84C] bg-[#C9A84C] text-charcoal shadow-lg'
                : 'border-white/15 bg-black/55 text-white/85 hover:border-white/40 hover:text-white'
            }`}
          >
            Negotiable
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-2 pl-1">
            {session ? (
              <Link
                href="/dashboard"
                className="inline-flex min-h-[40px] items-center rounded-full bg-[#AC244D] px-4 py-2 text-[13px] font-semibold text-white shadow-lg transition-all hover:bg-[#8F1D40] active:scale-95"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden min-h-[40px] items-center rounded-full bg-black/55 px-4 py-2 text-[13px] font-semibold text-white ring-1 ring-white/10 backdrop-blur-md transition-all hover:bg-black/75 active:scale-95 min-[380px]:inline-flex"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex min-h-[40px] items-center rounded-full bg-[#AC244D] px-4 py-2 text-[13px] font-semibold text-white shadow-lg transition-all hover:bg-[#8F1D40] active:scale-95"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Area name, Snap style: a quiet chip centred under the
          header once the map settles on an area. */}
      {areaName && !showList && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(118px+env(safe-area-inset-top))] z-20 flex justify-center px-4">
          <span className="glass-dark rounded-full px-3.5 py-1.5 font-display text-[13px] font-semibold tracking-wide text-white/90">
            {areaName}
          </span>
        </div>
      )}

      {/* Recenter on the user, when they allow location. */}
      {!showList && (
        <button
          onClick={handleRecenter}
          aria-label="Centre the map on my location"
          className="glass-dark absolute right-3 top-[calc(118px+env(safe-area-inset-top))] z-30 flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg transition-all hover:bg-black/70 active:scale-95 sm:right-5"
        >
          <Locate aria-hidden className="h-5 w-5" />
        </button>
      )}

      {/* Build tag: tiny, bottom-right. Tells us exactly what version is running. */}
      <div className="pointer-events-none absolute bottom-1 right-2 z-40 select-none text-[11px] text-white/25">
        {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'}
      </div>

      {/* Discovery sheet: the nearby tray's replacement. The
          map stays the screen; the sheet peeks with the in-area
          count and drags open into the paginated list. */}
      {!showList && (
        <DiscoverySheet
          providers={sheetProviders}
          ready={providersReady}
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          onSelect={handleSheetSelect}
          distanceKmFor={distanceKmFor}
          filtersActive={filtersActive}
          onClearFilters={clearFilters}
          aboveNav={!!session}
          selectedId={selectedPinId}
        />
      )}

      {/* Signed-in bottom bar on the map (guests keep the clean
          full-screen map): same five stops as everywhere else,
          Map popped in the middle. */}
      {session && !showList && (
        <nav className="absolute inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#101016]/92 backdrop-blur-md">
          <div className="grid grid-cols-5 px-1 py-1.5">
            {[
              { href: '/dashboard', label: 'Home', Icon: LayoutDashboard, pop: false, active: false },
              { href: '/live', label: 'Live', Icon: Radio, pop: false, active: false },
              { href: '/', label: 'Map', Icon: MapIcon, pop: true, active: true },
              { href: '/comics', label: 'Comics', Icon: BookOpen, pop: false, active: false },
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
        <div className="absolute inset-0 z-20 overflow-y-auto bg-cream px-4 pb-10 pt-[148px] [touch-action:pan-y] [overscroll-behavior:contain] [-webkit-overflow-scrolling:touch]">
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
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-[#AC244D]/10 px-3 py-1.5 text-xs font-semibold text-[#AC244D]">
                    {formatCompactCount(filtered.length)} nearby
                  </span>
                  {!mapFailed && (
                    <button
                      onClick={() => setForceList(false)}
                      className="rounded-full bg-charcoal px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Back to map
                    </button>
                  )}
                </span>
              )}
            </div>
            {providersReady && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                <span>
                  {formatCompactCount(filtered.length)} {filtered.length === 1 ? 'companion' : 'companions'} nearby
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
                <ProviderListCard key={p.id} provider={p} onSelect={selectPin} travelNote={travelNoteFor(p)} />
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
        onClose={() => {
          setSelected(null);
          setSelectedPinId(null);
        }}
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
          style={{ bottom: session ? 'calc(11.5rem + env(safe-area-inset-bottom))' : 'calc(7.5rem + env(safe-area-inset-bottom))' }}
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
