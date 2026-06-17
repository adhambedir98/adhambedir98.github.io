"""
Re-runnable migration of the seed file into Supabase.

The initial seed for this project was already loaded. This script exists for
reproducibility and re-runs. It is IDEMPOTENT: people already present (matched on
dedupe_key) are skipped, so a second run is a no-op.

Run:  python migrate_seed.py     (reads config.SEED_FILE; data/ is gitignored)

Mappings (per the brief):
  source   <- how_known     ("HBS alumni directory"/"Harvard College" -> HBS;
                             "MIT alumni directory" -> MIT; *Stanford* -> Stanford; else Other)
  industry <- category_name  (controlled vocabulary; see derive_industry)
  status   <- status         (To research / To contact / Contacted / Call booked / blank)
"""

from __future__ import annotations

import json
from collections import Counter

import config
from db import get_client


def map_source(how_known: str | None) -> str:
    h = (how_known or "").strip()
    if h in ("HBS alumni directory", "Harvard College"):
        return "HBS"
    if h == "MIT alumni directory":
        return "MIT"
    if "stanford" in h.lower():
        return "Stanford"
    return "Other"


def derive_industry(category_name: str | None) -> str:
    c = (category_name or "").lower()
    has = lambda *w: any(x in c for x in w)  # noqa: E731
    if has("crops", "orchard", "farm", "agriculture", "greenhouse", "nursery", "floriculture"):
        return "agriculture"
    if has("food", "beverage", "processing", "packaging"):
        return "food_and_beverage"
    if has("manufacturing", "fab", "assembly", "durable goods"):
        return "manufacturing"
    if has("warehousing", "fulfillment", "3pl", "cold storage", "distribution"):
        return "logistics_and_warehousing"
    if has("construction", "site work"):
        return "construction"
    if has("mining", "quarry", "aggregates"):
        return "mining"
    if has("recycling", "waste"):
        return "recycling_and_waste"
    if has("auto", "fleet", "dealership", "heavy-equipment"):
        return "auto_and_fleet"
    if has("ports", "intermodal", "container"):
        return "ports"
    return "other"


def map_status(status: str | None) -> str:
    return {
        "to research": "to_research",
        "to contact": "to_contact",
        "contacted": "contacted",
        "call booked": "call_booked",
        "": "to_contact",
    }.get((status or "").strip().lower(), "to_contact")


def nn(v):
    """Empty string / whitespace -> None, else trimmed string."""
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def main() -> None:
    with open(config.SEED_FILE) as f:
        rows = json.load(f)

    client = get_client()
    existing = {r["dedupe_key"] for r in (client.table("contacts").select("dedupe_key").execute().data or [])}

    inserted = skipped = 0
    new_by_industry: Counter[str] = Counter()
    for r in rows:
        company = nn(r.get("company"))
        name = nn(r.get("contact_name"))
        if not company or not name:
            continue
        key = f"{name.strip().lower()}|{company.strip().lower()}"
        if key in existing:
            skipped += 1
            continue
        industry = derive_industry(r.get("category_name"))
        client.table("contacts").insert(
            {
                "company": company,
                "contact_name": name,
                "role": nn(r.get("role")),
                "location": nn(r.get("location")),
                "email": None,  # always NULL at seed; backfilled from replies (Step 7)
                "source": map_source(r.get("how_known")),
                "source_raw": nn(r.get("how_known")),
                "owner": nn(r.get("owner")),
                "warm_cold": nn(r.get("warm_cold")),
                "industry": industry,
                "category": nn(r.get("category_name")),
                "tier": nn(r.get("tier")),
                "status": map_status(r.get("status")),
                "notes": nn(r.get("notes")),
            }
        ).execute()
        existing.add(key)
        inserted += 1
        new_by_industry[industry] += 1

    print(f"\nMigration complete: inserted={inserted}  skipped(existing)={skipped}  seed_rows={len(rows)}")
    if inserted:
        print("\nNewly inserted, per industry:")
        for k, v in new_by_industry.most_common():
            print(f"  {k:<26} {v}")

    full = Counter(x["industry"] for x in (client.table("contacts").select("industry").execute().data or []))
    print("\nAll contacts in DB, per industry:")
    for k, v in full.most_common():
        print(f"  {k:<26} {v}")


if __name__ == "__main__":
    main()
