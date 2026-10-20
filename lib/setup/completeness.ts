/**
 * Companion setup completeness: the single source of truth for the
 * setup wizard and the dashboard banner. The map gate mirrors the
 * map_providers view: name, photo, city, at least one rate, services.
 */

export interface SetupProfile {
  display_name: string | null;
  avatar_url: string | null;
  rate_short_time_ngn: number | null;
  rate_overnight_ngn: number | null;
  rate_weekend_ngn: number | null;
  services: string[] | null;
  verification_status: string | null;
}

export interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  required: boolean;
}

export function computeSetupSteps(
  profile: SetupProfile | null,
  presenceCity: string | null
): SetupStep[] {
  const p = profile;
  const hasRate =
    (p?.rate_short_time_ngn ?? 0) > 0 ||
    (p?.rate_overnight_ngn ?? 0) > 0 ||
    (p?.rate_weekend_ngn ?? 0) > 0;
  return [
    { key: 'basics', label: 'Name and base city', done: !!p?.display_name && !!presenceCity, required: true },
    { key: 'photos', label: 'Photos', done: !!p?.avatar_url, required: true },
    { key: 'rates', label: 'Rates and services', done: hasRate && (p?.services?.length ?? 0) > 0, required: true },
    { key: 'travel', label: 'Travel', done: true, required: false },
    { key: 'requirements', label: 'Who can book you', done: true, required: false },
    { key: 'verification', label: 'Verification', done: p?.verification_status === 'verified', required: false },
  ];
}

/** True when she passes the map gate (all required steps done). */
export function isLiveOnMap(steps: SetupStep[]): boolean {
  return steps.filter((s) => s.required).every((s) => s.done);
}

export function setupProgress(steps: SetupStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}
