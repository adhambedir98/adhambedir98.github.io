"use client";

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { aggregateGeo, normalize, REGIONS } from "@/lib/geo";
import { statusColor, statusLabel } from "@/lib/statuses";
import type { Contact } from "@/lib/pipeline";

const COUNTRIES_URL = "/countries-110m.json";
const STATES_URL = "/states-10m.json";

type Selection = { kind: "country" | "state" | "region"; name: string };

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
  const [selected, setSelected] = useState<Selection | null>(null);

  const agg = useMemo(() => aggregateGeo(contacts, industry, region), [contacts, industry, region]);
  const maxCountry = Math.max(1, ...Object.values(agg.countryCounts));
  const maxState = Math.max(1, ...Object.values(agg.stateCounts));
  const topCountries = Object.entries(agg.countryCounts).sort((a, b) => b[1] - a[1]);
  const topStates = Object.entries(agg.stateCounts).sort((a, b) => b[1] - a[1]);

  // contacts in the currently selected geography (respecting industry/region filters)
  const matched = useMemo(() => {
    if (!selected) return [];
    return contacts.filter((c) => {
      if (industry !== "all" && c.industry !== industry) return false;
      const g = normalize(c.location);
      if (region !== "all" && g.region !== region) return false;
      if (selected.kind === "country") return g.country === selected.name;
      if (selected.kind === "state") return g.usState === selected.name;
      return g.region === selected.name;
    });
  }, [contacts, industry, region, selected]);

  function isSel(name: string): boolean {
    if (!selected) return false;
    if (view === "world") return selected.kind === "country" && selected.name === name;
    return selected.kind === "state" && selected.name === name;
  }

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

      <p className="hint">Click a country or state (or a row in the lists below) to see the companies there.</p>

      <div className="mapwrap">
        {view === "world" ? (
          <ComposableMap projection="geoEqualEarth" width={920} height={430}
            projectionConfig={{ scale: 165 }} style={{ width: "100%", height: "auto" }}>
            <Geographies geography={COUNTRIES_URL}>
              {({ geographies }) =>
                geographies.map((geo: any) => {
                  const name = geo.properties.name as string;
                  const count = agg.countryCounts[name] || 0;
                  const sel = isSel(name);
                  return (
                    <Geography key={geo.rsmKey} geography={geo}
                      fill={shade(count, maxCountry)} stroke={sel ? "#fff" : "#000"} strokeWidth={sel ? 1.2 : 0.4}
                      onMouseEnter={() => setHover(`${name}: ${count}`)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => setSelected({ kind: "country", name })}
                      style={{ default: { outline: "none" }, hover: { outline: "none", fill: "#cfcfcf", cursor: "pointer" }, pressed: { outline: "none" } }} />
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
                  const sel = isSel(name);
                  return (
                    <Geography key={geo.rsmKey} geography={geo}
                      fill={shade(count, maxState)} stroke={sel ? "#fff" : "#000"} strokeWidth={sel ? 1.2 : 0.5}
                      onMouseEnter={() => setHover(`${name}: ${count}`)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => setSelected({ kind: "state", name })}
                      style={{ default: { outline: "none" }, hover: { outline: "none", fill: "#cfcfcf", cursor: "pointer" }, pressed: { outline: "none" } }} />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        )}
      </div>

      {hover && <div className="maptip" style={{ left: pos.x + 14, top: pos.y + 14 }}>{hover}</div>}

      {/* selected geography -> the companies there */}
      {selected && (
        <div className="geo-detail">
          <div className="geo-detail-head">
            <h3>{selected.name} · {matched.length} contact{matched.length === 1 ? "" : "s"}</h3>
            <button className="ghost" onClick={() => setSelected(null)}>Clear</button>
          </div>
          {matched.length === 0 ? (
            <p className="muted">No contacts here for the current filter.</p>
          ) : (
            <div className="tablewrap">
              <table className="contacts">
                <thead>
                  <tr><th>Company</th><th>Name</th><th>Role</th><th>Industry</th><th>Owner</th><th>Status</th><th>Location</th></tr>
                </thead>
                <tbody>
                  {matched.map((c) => (
                    <tr key={c.id}>
                      <td>{c.company}</td>
                      <td>{c.contact_name}</td>
                      <td className="muted">{c.role || "—"}</td>
                      <td><span className="pill">{c.industry}</span></td>
                      <td>{c.owner || "—"}</td>
                      <td><span className="statuspill" style={{ color: statusColor(c.status), borderColor: statusColor(c.status) }}>{statusLabel(c.status)}</span></td>
                      <td className="muted">{c.location || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="breakdown">
        <div className="col">
          <h3>{view === "world" ? "By country" : "By state"}</h3>
          <table>
            <tbody>
              {(view === "world" ? topCountries : topStates).map(([k, v]) => (
                <tr key={k} className="clickrow"
                  onClick={() => setSelected({ kind: view === "world" ? "country" : "state", name: k })}>
                  <td>{k}</td><td className="r">{v}</td>
                </tr>
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
                <tr key={k} className="clickrow" onClick={() => setSelected({ kind: "region", name: k })}>
                  <td>{k}</td><td className="r">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
