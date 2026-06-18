// Location normalization for the map: turn each contact's free-text `location`
// into a world-atlas country name, a us-atlas state name (when in the US), and a
// world region. Country/state names match the topojson in /public exactly.
//
// LOCATION_MAP covers every distinct value currently in the database; a heuristic
// fallback handles anything new added later via the directory pull.

import type { Contact } from "./pipeline";

export type Region =
  | "North America" | "Latin America" | "Europe" | "MENA"
  | "Sub-Saharan Africa" | "Asia-Pacific" | "Unknown";

export const REGIONS: Region[] = [
  "North America", "Latin America", "Europe", "MENA", "Sub-Saharan Africa", "Asia-Pacific",
];

export const US_NAME = "United States of America";
export type Geo = { country: string | null; usState: string | null; region: Region };

const NA: Region = "North America", LATAM: Region = "Latin America", EU: Region = "Europe",
  ME: Region = "MENA", SSA: Region = "Sub-Saharan Africa", AP: Region = "Asia-Pacific";

const us = (state: string | null): Geo => ({ country: US_NAME, usState: state, region: NA });
const ctry = (country: string | null, region: Region): Geo => ({ country, usState: null, region });

// country -> region (for the heuristic fallback and country entries)
const COUNTRY_REGION: Record<string, Region> = {
  "Mexico": LATAM, "Canada": NA, "United States of America": NA,
  "Brazil": LATAM, "Guatemala": LATAM, "Chile": LATAM, "Argentina": LATAM, "Bolivia": LATAM,
  "Costa Rica": LATAM, "Venezuela": LATAM, "Jamaica": LATAM,
  "United Kingdom": EU, "Ireland": EU, "Denmark": EU, "Netherlands": EU, "Italy": EU,
  "Switzerland": EU, "Norway": EU, "Belgium": EU, "France": EU, "Spain": EU,
  "Egypt": ME, "Israel": ME, "Tunisia": ME, "Lebanon": ME, "Saudi Arabia": ME,
  "United Arab Emirates": ME,
  "Nigeria": SSA, "South Africa": SSA, "Uganda": SSA, "Kenya": SSA,
  "India": AP, "Australia": AP, "Singapore": AP, "Japan": AP, "New Zealand": AP,
  "Malaysia": AP, "Philippines": AP, "Thailand": AP,
};

export const LOCATION_MAP: Record<string, Geo> = {
  // ── United States (by state) ──
  "California": us("California"), "California, USA": us("California"),
  "Massachusetts, USA": us("Massachusetts"), "Minnesota, USA": us("Minnesota"),
  "Illinois, USA": us("Illinois"), "New York, USA": us("New York"),
  "New Jersey, USA": us("New Jersey"), "Boise, Idaho, USA": us("Idaho"),
  "Alabama, USA": us("Alabama"), "Florida, USA": us("Florida"), "Texas, USA": us("Texas"),
  "Ohio, USA": us("Ohio"), "Nebraska, USA": us("Nebraska"), "Virginia, USA": us("Virginia"),
  "Iowa, USA": us("Iowa"), "Healdsburg, CA": us("California"), "Connecticut, USA": us("Connecticut"),
  "Missouri, USA": us("Missouri"), "Georgia, USA": us("Georgia"), "Kentucky, USA": us("Kentucky"),
  "Eau Claire, Wisconsin, USA": us("Wisconsin"), "Los Angeles, CA": us("California"),
  "Napa, CA": us("California"), "Fort Lauderdale, Florida, USA": us("Florida"),
  "Idaho, USA": us("Idaho"), "Rhode Island, USA": us("Rhode Island"),
  "West Palm Beach, Florida, USA": us("Florida"), "Hanford, CA": us("California"),
  "Chicago, Illinois, USA": us("Illinois"), "South Carolina, USA": us("South Carolina"),
  "PA, USA": us("Pennsylvania"), "St. Helena, CA": us("California"),
  "St. Augustine, Florida, USA": us("Florida"), "Kearney, Nebraska, USA": us("Nebraska"),
  "Russian River Valley, CA": us("California"), "Fresno, CA": us("California"),
  "Mississippi, USA": us("Mississippi"), "Maryland, USA": us("Maryland"),
  "North Carolina, USA": us("North Carolina"), "Hickman, CA": us("California"),
  "Montana, USA": us("Montana"), "Siloam Springs, Arkansas, USA": us("Arkansas"),
  "Amarillo, Texas, USA": us("Texas"), "Colorado, USA": us("Colorado"),
  "Oakville, CA": us("California"), "Oregon, USA": us("Oregon"), "Washington, USA": us("Washington"),
  "San Diego, CA, USA / Baja, Mexico": us("California"), "USA": us(null),
  "North Dakota, USA": us("North Dakota"), "Wisconsin, USA": us("Wisconsin"),
  // ── Other countries ──
  "Mexico": ctry("Mexico", LATAM), "India": ctry("India", AP), "Canada": ctry("Canada", NA),
  "Australia": ctry("Australia", AP), "England": ctry("United Kingdom", EU),
  "Egypt": ctry("Egypt", ME), "Nigeria": ctry("Nigeria", SSA), "Ireland": ctry("Ireland", EU),
  "Singapore": ctry("Singapore", AP), "Japan": ctry("Japan", AP),
  "New Zealand": ctry("New Zealand", AP), "Brazil": ctry("Brazil", LATAM),
  "Guatemala": ctry("Guatemala", LATAM), "Israel": ctry("Israel", ME),
  "Denmark": ctry("Denmark", EU), "The Netherlands": ctry("Netherlands", EU),
  "Italy": ctry("Italy", EU), "South Africa": ctry("South Africa", SSA),
  "Chile": ctry("Chile", LATAM), "Argentina": ctry("Argentina", LATAM),
  "Switzerland": ctry("Switzerland", EU), "Jamaica": ctry("Jamaica", LATAM),
  "Norway": ctry("Norway", EU), "Bolivia": ctry("Bolivia", LATAM),
  "Tunisia": ctry("Tunisia", ME), "Lebanon": ctry("Lebanon", ME),
  "Costa Rica": ctry("Costa Rica", LATAM), "Venezuela": ctry("Venezuela", LATAM),
  "Copenhagen, Denmark": ctry("Denmark", EU), "Uganda": ctry("Uganda", SSA),
  "Brussels, Belgium (Lebanon)": ctry("Belgium", EU), "France": ctry("France", EU),
  "Saudi Arabia (Riyadh)": ctry("Saudi Arabia", ME), "Malaysia": ctry("Malaysia", AP),
  "Kenya": ctry("Kenya", SSA), "Philippines": ctry("Philippines", AP),
  "Dubai / Gulf": ctry("United Arab Emirates", ME),
  "Netherlands Antilles": ctry(null, LATAM),
  "Spain": ctry("Spain", EU), "United Arab Emirates": ctry("United Arab Emirates", ME),
  "Thailand": ctry("Thailand", AP), "Abu Dhabi, UAE": ctry("United Arab Emirates", ME),
  "San Jose, Costa Rica": ctry("Costa Rica", LATAM),
};

const US_ABBREV: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming",
};
const US_STATES = new Set(Object.values(US_ABBREV));

export function normalize(loc: string | null | undefined): Geo {
  if (!loc) return { country: null, usState: null, region: "Unknown" };
  const key = loc.trim();
  if (LOCATION_MAP[key]) return LOCATION_MAP[key];

  // heuristic fallback for values added later
  const lower = key.toLowerCase();
  if (US_STATES.has(key)) return us(key);
  const cityAbbrev = key.match(/,\s*([A-Za-z]{2})$/);
  if (cityAbbrev && US_ABBREV[cityAbbrev[1].toUpperCase()]) return us(US_ABBREV[cityAbbrev[1].toUpperCase()]);
  if (/\b(usa|u\.s\.a?\.?|united states)\b/.test(lower)) {
    for (const s of US_STATES) if (key.includes(s)) return us(s);
    const tok = key.match(/\b([A-Z]{2})\b/);
    if (tok && US_ABBREV[tok[1]]) return us(US_ABBREV[tok[1]]);
    return us(null);
  }
  const seg = key.split(",").pop()!.trim();
  if (COUNTRY_REGION[seg]) return ctry(seg, COUNTRY_REGION[seg]);
  return { country: null, usState: null, region: "Unknown" };
}

export type GeoAgg = {
  countryCounts: Record<string, number>;
  stateCounts: Record<string, number>;
  regionCounts: Record<string, number>;
  unmapped: number;
};

export function aggregateGeo(contacts: Contact[], industry: string, region: string): GeoAgg {
  const countryCounts: Record<string, number> = {};
  const stateCounts: Record<string, number> = {};
  const regionCounts: Record<string, number> = {};
  let unmapped = 0;
  for (const c of contacts) {
    if (industry !== "all" && c.industry !== industry) continue;
    const g = normalize(c.location);
    if (region !== "all" && g.region !== region) continue;
    regionCounts[g.region] = (regionCounts[g.region] || 0) + 1;
    if (g.country) countryCounts[g.country] = (countryCounts[g.country] || 0) + 1;
    else unmapped++;
    if (g.usState) stateCounts[g.usState] = (stateCounts[g.usState] || 0) + 1;
  }
  return { countryCounts, stateCounts, regionCounts, unmapped };
}
