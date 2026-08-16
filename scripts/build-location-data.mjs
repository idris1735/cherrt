// Builds the vendored location datasets the onboarding form ships.
// Run: node scripts/build-location-data.mjs
//
//   countries.json — annexare/Countries (MIT): ISO code, name, dial code,
//                    flag emoji for every country.
//   nigeria.json   — dr5hn/countries-states-cities-database (ODbL): all 37
//                    Nigerian states + their cities.
//
// Regenerate any time the upstream data changes; outputs are committed so
// builds never depend on GitHub being reachable.
import { writeFileSync, mkdirSync } from "node:fs";

const COUNTRIES_URL = "https://raw.githubusercontent.com/annexare/Countries/master/dist/countries.min.json";
const NIGERIA_URL = "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries+states+cities.json";

const asJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
};

const rawCountries = await asJson(COUNTRIES_URL);
const countries = Object.entries(rawCountries)
  .map(([code, c]) => ({
    code: String(code).toUpperCase(),
    name: String(c.name),
    dial: Array.isArray(c.phone) && c.phone.length ? `+${c.phone[0]}` : "",
    flag: c.emoji ? String(c.emoji) : "",
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const all = await asJson(NIGERIA_URL);
const ng = all.find((c) => c.name === "Nigeria");
if (!ng) throw new Error("Nigeria not found in the states+cities dataset");

const nigeria = (ng.states ?? [])
  .map((s) => ({
    name: String(s.name),
    cities: [...new Set((s.cities ?? []).map((c) => String(c.name)))].sort((a, b) => a.localeCompare(b)),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

mkdirSync("src/lib/data", { recursive: true });
writeFileSync("src/lib/data/countries.json", JSON.stringify(countries));
writeFileSync("src/lib/data/nigeria.json", JSON.stringify(nigeria));
console.log(`countries: ${countries.length} | nigeria states: ${nigeria.length} | cities: ${nigeria.reduce((n, s) => n + s.cities.length, 0)}`);
