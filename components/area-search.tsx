"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Geometry } from "geojson";

import { districtFullName, loadMapData } from "@/lib/map-data";
import type { DashboardMode } from "@/lib/types";

export type AreaSearchResult = {
  level: DashboardMode;
  /** Name shown on the map: the district's display name or the region name. */
  name: string;
  regionName: string;
  /** Map feature key: the district's location id, or the region name. */
  key: string;
  latitude: number;
  longitude: number;
  geometry: Geometry;
};

type IndexEntry = AreaSearchResult & {
  /** Unique per entry: a capital and its district can both be listed. */
  id: string;
  /** What the list shows: the area name, or a regional capital's name. */
  label: string;
  detail: string;
  /** Normalised names that can match: short name, official name. */
  terms: string[];
  regionTerm: string;
};

const MAX_RESULTS = 8;

/**
 * Regional capitals and the district each lies in (district display names in the map data), so a
 * search for a capital finds it even when the district has another name (Koforidua is in New Juaben South).
 */
const REGIONAL_CAPITALS: { capital: string; district: string }[] = [
  { capital: "Goaso", district: "Asunafo North" },
  { capital: "Kumasi", district: "Kumasi" },
  { capital: "Sunyani", district: "Sunyani" },
  { capital: "Techiman", district: "Techiman" },
  { capital: "Cape Coast", district: "Cape Coast" },
  { capital: "Koforidua", district: "New Juaben South" },
  { capital: "Accra", district: "Accra" },
  { capital: "Nalerigu", district: "East Mamprusi" },
  { capital: "Tamale", district: "Tamale" },
  { capital: "Dambai", district: "Krachi East" },
  { capital: "Damongo", district: "West Gonja" },
  { capital: "Bolgatanga", district: "Bolgatanga" },
  { capital: "Wa", district: "Wa Municipal" },
  { capital: "Ho", district: "Ho Municipal" },
  { capital: "Sekondi-Takoradi", district: "Sekondi Takoradi" },
  { capital: "Sefwi Wiawso", district: "Sefwi-Wiawso" },
];

/** Lower case, accents and hyphens folded, so "Korle-Klottey" matches "korle klottey". */
function normalise(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-–'’.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower is better: exact, then starts with, then a word starts with, then contains anywhere. */
function matchRank(term: string, query: string): number | null {
  if (term === query) {
    return 0;
  }
  if (term.startsWith(query)) {
    return 1;
  }
  if (term.includes(` ${query}`)) {
    return 2;
  }
  return term.includes(query) ? 3 : null;
}

async function buildIndex(): Promise<IndexEntry[]> {
  const { districtFeatures, regionFeatures } = await loadMapData();
  const regions: IndexEntry[] = regionFeatures.features.map((feature) => ({
    id: `region:${feature.properties.region}`,
    label: feature.properties.region,
    level: "region",
    name: feature.properties.region,
    regionName: feature.properties.region,
    key: feature.properties.region,
    latitude: feature.properties.latitude,
    longitude: feature.properties.longitude,
    geometry: feature.geometry,
    detail: "Region",
    terms: [normalise(feature.properties.region), normalise(`${feature.properties.region} Region`)],
    regionTerm: normalise(feature.properties.region),
  }));
  const capitalByDistrict = new Map(REGIONAL_CAPITALS.map((item) => [item.district, item.capital]));
  const districts: IndexEntry[] = districtFeatures.features.map((feature) => {
    const properties = feature.properties;
    const capital = capitalByDistrict.get(properties.display_name);
    return {
      id: `district:${properties.location_id}`,
      label: properties.display_name,
      level: "district",
      name: properties.display_name,
      regionName: properties.region,
      key: properties.location_id,
      latitude: properties.latitude,
      longitude: properties.longitude,
      geometry: feature.geometry,
      detail: `${properties.region} · District${capital && normalise(capital) === normalise(properties.display_name) ? " · Regional capital" : ""}`,
      terms: [normalise(properties.display_name), normalise(districtFullName(properties))],
      regionTerm: normalise(properties.region),
    };
  });
  // Capitals named differently from their district get an entry of their own that selects that district.
  const capitals: IndexEntry[] = districts.flatMap((district) => {
    const capital = capitalByDistrict.get(district.name);
    if (!capital || normalise(capital) === normalise(district.name)) {
      return [];
    }
    return [
      {
        ...district,
        id: `capital:${capital}`,
        label: capital,
        detail: `${district.regionName} regional capital · in ${district.name}`,
        terms: [normalise(capital)],
      },
    ];
  });
  return [...regions, ...capitals, ...districts];
}

function search(index: IndexEntry[], rawQuery: string) {
  const query = normalise(rawQuery);
  if (!query) {
    return [];
  }
  const scored: { entry: IndexEntry; rank: number }[] = [];
  for (const entry of index) {
    const nameRanks = entry.terms.map((term) => matchRank(term, query)).filter((rank): rank is number => rank !== null);
    const regionRank = matchRank(entry.regionTerm, query);
    // A region-name match also lists that region's districts, after every direct name match.
    const rank = nameRanks.length ? Math.min(...nameRanks) : regionRank !== null ? 4 + regionRank : null;
    if (rank !== null) {
      scored.push({ entry, rank });
    }
  }
  scored.sort(
    (left, right) =>
      left.rank - right.rank ||
      // Regions before districts of the same rank, so "Ashanti" leads with the region.
      (left.entry.level === right.entry.level ? 0 : left.entry.level === "region" ? -1 : 1) ||
      left.entry.label.localeCompare(right.entry.label),
  );
  return scored.slice(0, MAX_RESULTS).map((item) => item.entry);
}

/** A search button in the map's control stack that finds a region or district by name. */
export function AreaSearch({ onSelect }: { onSelect: (result: AreaSearchResult) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [index, setIndex] = useState<IndexEntry[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!isOpen || index) {
      return;
    }
    let cancelled = false;
    buildIndex()
      .then((entries) => {
        if (!cancelled) {
          setIndex(entries);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [index, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    inputRef.current?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [isOpen]);

  const results = useMemo(() => (index ? search(index, query) : []), [index, query]);

  const close = () => {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const pick = (result: AreaSearchResult) => {
    close();
    onSelect(result);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((current) => (current + step + results.length) % results.length);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) {
        pick(result);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const optionId = (position: number) => `${listId}-option-${position}`;
  const showList = query.trim().length > 0;

  return (
    <div className={`area-search${isOpen ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="map-zoom-button area-search-button"
        data-testid="area-search-button"
        aria-label="Search region or district"
        title="Search region or district"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <circle cx="8.6" cy="8.6" r="5.2" />
          <path d="m12.6 12.6 3.9 3.9" />
        </svg>
      </button>
      {isOpen ? (
        <div className="area-search-panel">
          <input
            ref={inputRef}
            type="search"
            className="area-search-input"
            data-testid="area-search-input"
            placeholder="Search region or district…"
            aria-label="Search region or district"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList && results.length > 0}
            aria-controls={listId}
            aria-activedescendant={showList && results.length ? optionId(activeIndex) : undefined}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
          {showList ? (
            results.length ? (
              <ul className="area-search-results" id={listId} role="listbox" aria-label="Matching areas">
                {results.map((result, position) => (
                  <li
                    key={result.id}
                    id={optionId(position)}
                    role="option"
                    aria-selected={position === activeIndex}
                    className={position === activeIndex ? "active" : undefined}
                    data-testid="area-search-result"
                    onPointerEnter={() => setActiveIndex(position)}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => pick(result)}
                  >
                    <span className="area-search-name">{result.label}</span>
                    <span className="area-search-detail">{result.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="area-search-empty" data-testid="area-search-empty" role="status">
                {index ? `No region or district matches “${query.trim()}”` : "Loading areas…"}
              </p>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
