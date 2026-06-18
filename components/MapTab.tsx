"use client";

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { aggregateGeo, REGIONS } from "@/lib/geo";
import type { Contact } from "@/lib/pipeline";

const COUNTRIES_URL = "/countries-110m.json";
const STATES_URL = "/states-10m.json";

// Monochrome intensity: more contacts -> brighter (on the black background).
function shade(count: number, max: number): string {
  if (!count) return "#161616";
  const t = max > 0 ? Math.sqrt(count / max) : 0;
  const lo = 0x55, hi = 0xff;
  const v = Math.round(lo + (hi - lo) * t);
  const h = v.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

export default function MapTab({ contacts, industries }: { contacts: Contact[]; industries: string[] }) {
  const [industry, setIndustry] = useState("all");
  const [region, setRegion] = useState("all");
  const [view, setView] = useState<"world" | "us">("world");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);

  const agg = useMemo(() => aggregateGeo(contacts, industry, region), [contacts, industry, region]);
  const maxCountry = Math.max(1, ...Object.values(agg.countryCounts));
  const maxState = Math.max(1, ...Object.values(agg.stateCounts));
  const topCountries = Object.entries(agg.countryCounts).sort((a, b) => b[1] - a[1]);
  const topStates = Object.entries(agg.stateCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}>
      <div className="filters">
        <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
          <option value="all">All industries</option>
          {industries.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="all">All regions</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className={`tab ${view === "world" ? "active" : ""}`} onClick={() => setView("world")}>World</button>
        <button className={`tab ${view === "us" ? "active" : ""}`} onClick={() => setView("us")}>United States</button>
      </div>

      <div className="mapwrap">
        {view === "world" ? (
          <ComposableMap projection="geoEqualEarth" width={920} height={430}
            projectionConfig={{ scale: 165 }} style={{ width: "100%", height: "auto" }}>
            <Geographies geography={COUNTRIES_URL}>
              {({ geographies }) =>
                geographies.map((geo: any) => {
                  const name = geo.properties.name as string;
                  const count = agg.countryCounts[name] || 0;
                  return (
                    <Geography key={geo.rsmKey} geography={geo}
                      fill={shade(count, maxCountry)} stroke="#000" strokeWidth={0.4}
                      onMouseEnter={() => setHover(`${name}: ${count}`)}
                      onMouseLeave={() => setHover(null)}
                      style={{ default: { outline: "none" }, hover: { outline: "none", fill: "#cfcfcf" }, pressed: { outline: "none" } }} />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        ) : (
          <ComposableMap projection="geoAlbersUsa" width={920} height={520}
            projectionConfig={{ scale: 1050 }} style={{ width: "100%", height: "auto" }}>
            <Geographies geography={STATES_URL}>
              {({ geographies }) =>
                geographies.map((geo: any) => {
                  const name = geo.properties.name as string;
                  const count = agg.stateCounts[name] || 0;
                  return (
                    <Geography key={geo.rsmKey} geography={geo}
                      fill={shade(count, maxState)} stroke="#000" strokeWidth={0.5}
                      onMouseEnter={() => setHover(`${name}: ${count}`)}
                      onMouseLeave={() => setHover(null)}
                      style={{ default: { outline: "none" }, hover: { outline: "none", fill: "#cfcfcf" }, pressed: { outline: "none" } }} />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        )}
      </div>

      {hover && <div className="maptip" style={{ left: pos.x + 14, top: pos.y + 14 }}>{hover}</div>}

      <div className="breakdown">
        <div className="col">
          <h3>{view === "world" ? "By country" : "By state"}</h3>
          <table>
            <tbody>
              {(view === "world" ? topCountries : topStates).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td className="r">{v}</td></tr>
              ))}
              {view === "world" && agg.unmapped > 0 && (
                <tr><td className="muted">Other / not on map</td><td className="r">{agg.unmapped}</td></tr>
              )}
              {(view === "world" ? topCountries : topStates).length === 0 && (
                <tr><td className="muted">No contacts match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="col">
          <h3>By region</h3>
          <table>
            <tbody>
              {Object.entries(agg.regionCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td className="r">{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
