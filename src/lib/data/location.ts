// Vendored location data for the onboarding form.
// Regenerate with: node scripts/build-location-data.mjs
import countriesRaw from "./countries.json";
import nigeriaRaw from "./nigeria.json";

export type Country = { code: string; name: string; dial: string; flag: string };
export type NigeriaState = { name: string; cities: string[] };

// Flag emoji from the ISO code when the source dataset has none.
const flagOf = (code: string): string => {
  try {
    return String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0)));
  } catch {
    return "";
  }
};

export const COUNTRIES: Country[] = (countriesRaw as Array<{ code: string; name: string; dial: string; flag: string }>)
  .map((c) => ({ code: c.code, name: c.name, dial: c.dial, flag: c.flag || flagOf(c.code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const NIGERIA_STATES: NigeriaState[] = nigeriaRaw as NigeriaState[];

export const countryByCode = (code?: string): Country | null =>
  COUNTRIES.find((c) => c.code === (code ?? "").trim().toUpperCase()) ?? null;

export const nigeriaState = (name?: string): NigeriaState | null =>
  NIGERIA_STATES.find((s) => s.name.toLowerCase() === (name ?? "").trim().toLowerCase()) ?? null;

export const nigeriaCitiesFor = (state?: string): string[] => nigeriaState(state)?.cities ?? [];
