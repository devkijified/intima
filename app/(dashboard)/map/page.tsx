'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const IntimaMap = dynamic(() => import('@/components/map/IntimaMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[68vh] min-h-[440px] items-center justify-center rounded-2xl bg-[#111118]">
      <Loader2 className="h-8 w-8 animate-spin text-[#AC244D]" />
    </div>
  ),
});

export default function MapPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-3xl tracking-tight text-charcoal">Intima Map</h1>
        <p className="mt-1 text-sm text-neutral-500">
          See who is around you right now. Pins show approximate areas only,
          never exact addresses, and only for companions who opted in.
        </p>
      </div>
      <IntimaMap />
    </div>
  );
}
