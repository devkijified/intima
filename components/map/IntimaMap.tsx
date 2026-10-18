'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl';
import { AlertTriangle, BadgeCheck, ListFilter, Loader2, MapPin } from 'lucide-react';
import {
  MAP_CITIES,
  MOCK_PROVIDERS,
  type MockProvider,
} from '@/lib/map/mockProviders';
import { ProviderSheet } from './ProviderSheet';
import { useCall } from '@/components/calls/CallProvider';
import { formatPrice } from '@/lib/utils/helpers';

const CARTO_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LAGOS_CENTER: [number, number] = [3.3792, 6.5244];

interface Filters {
  verifiedOnly: boolean;
  availableNow: boolean;
  city: string;
}

function markerElement(provider: MockProvider, onSelect: (p: MockProvider) => void): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'intima-pin';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${provider.displayName} in ${provider.area}`);
  const ring = provider.verified ? '#C9A84C' : '#AC244D';
  el.innerHTML =
    `<div style="position:relative;cursor:pointer;transition:transform .15s ease">` +
    `<img src="${provider.avatar}" alt="" ` +
    `style="width:44px;height:44px;border-radius:9999px;object-fit:cover;` +
    `border:3px solid ${ring};box-shadow:0 4px 14px rgba(0,0,0,.45)"/>` +
    (provider.available
      ? `<span style="position:absolute;bottom:1px;right:1px;width:12px;height:12px;` +
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

export default function IntimaMap() {
  const router = useRouter();
  const { startCall } = useCall();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<MLMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [selected, setSelected] = useState<MockProvider | null>(null);
  const [filters, setFilters] = useState<Filters>({
    verifiedOnly: false,
    availableNow: false,
    city: '',
  });

  const filtered = useMemo(
    () =>
      MOCK_PROVIDERS.filter(
        (p) =>
          (!filters.verifiedOnly || p.verified) &&
          (!filters.availableNow || p.available) &&
          (!filters.city || p.city === filters.city),
      ),
    [filters],
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

  const handleVoiceCall = (p: MockProvider) => {
    if (p.userId) void startCall(p.userId, p.displayName, 'voice', p.avatar);
  };
  const handleVideoCall = (p: MockProvider) => {
    if (p.userId) void startCall(p.userId, p.displayName, 'video', p.avatar);
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => toggle('verifiedOnly')}
          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
            filters.verifiedOnly
              ? 'border-primary bg-primary text-white'
              : 'border-neutral-200 bg-white text-neutral-600 hover:border-primary/50'
          }`}
        >
          <BadgeCheck className="h-4 w-4" />
          Verified only
        </button>
        <button
          onClick={() => toggle('availableNow')}
          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
            filters.availableNow
              ? 'border-green-600 bg-green-600 text-white'
              : 'border-neutral-200 bg-white text-neutral-600 hover:border-green-500/50'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              filters.availableNow ? 'bg-white' : 'bg-green-500'
            }`}
          />
          Available now
        </button>
        <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 py-2">
          <ListFilter className="h-4 w-4 text-neutral-400" />
          <select
            value={filters.city}
            onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
            aria-label="Filter by city"
            className="bg-transparent text-sm font-medium text-neutral-600 outline-none"
          >
            <option value="">All cities</option>
            {MAP_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <span className="ml-auto text-sm text-neutral-500">
          {filtered.length} {filtered.length === 1 ? 'companion' : 'companions'} nearby
        </span>
      </div>

      {/* Map or honest fallback */}
      {mapFailed ? (
        <div className="rounded-2xl border border-neutral-200/85 bg-white p-6">
          <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              The live map could not load on this connection, so here are the
              companions as a list instead. Nothing is broken, the map simply
              needs a stronger connection.
            </p>
          </div>
          <ul className="divide-y divide-neutral-100">
            {filtered.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <img
                  src={p.avatar}
                  alt={p.displayName}
                  className="h-12 w-12 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-medium text-charcoal">
                    {p.displayName}, {p.age}
                    {p.verified && (
                      <BadgeCheck className="h-4 w-4 fill-[#AC244D] text-white" />
                    )}
                  </p>
                  <p className="flex items-center gap-1 text-sm text-neutral-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {p.area}, {p.city} · {formatPrice(p.ratePerHour)}/hr
                  </p>
                </div>
                {p.available && (
                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                    Available
                  </span>
                )}
              </li>
            ))}
          </ul>
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-500">
              No companions match these filters right now.
            </p>
          )}
        </div>
      ) : (
        <div className="relative h-[68vh] min-h-[440px] w-full overflow-hidden rounded-2xl border border-neutral-200/85 bg-[#111118]">
          <div ref={containerRef} className="absolute inset-0" />
          {!mapReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#111118] text-neutral-400">
              <Loader2 className="h-8 w-8 animate-spin text-[#AC244D]" />
              <p className="text-sm">Loading the map…</p>
            </div>
          )}

          {/* Legend */}
          {mapReady && (
            <div className="absolute left-3 top-3 z-10 rounded-xl bg-black/60 px-3 py-2 text-xs text-white backdrop-blur-sm">
              <p className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-[#C9A84C]" />
                Verified
              </p>
              <p className="mt-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                Available now
              </p>
            </div>
          )}

          <ProviderSheet
            provider={selected}
            onClose={() => setSelected(null)}
            onViewProfile={() => router.push('/models/browse')}
            onVoiceCall={handleVoiceCall}
            onVideoCall={handleVideoCall}
          />
        </div>
      )}
    </div>
  );
}
