import type { SubseasonalDay, SubseasonalSeries, SubseasonalSpell } from "@/lib/subseasonal";

/* ------------------------------------------------------------------------------------------
 * Made-up 46-day forecasts for the admin preview, so editors can see how the advisory reads
 * under typical situations without waiting for the weather to produce them.
 * ------------------------------------------------------------------------------------------ */

export type Scenario = "planting" | "dry_spell" | "wet_spell" | "heavy" | "little_rain";

export const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: "planting", label: "Rains starting" },
  { value: "dry_spell", label: "Dry spell ahead" },
  { value: "wet_spell", label: "Wet spell ahead" },
  { value: "heavy", label: "Heavy rain days" },
  { value: "little_rain", label: "Little rain" },
];

export const PLACES = [
  { value: "north", label: "Tamale (north)", latitude: 9.4, region: "Northern", name: "Tamale Metropolitan" },
  { value: "transition", label: "Techiman (transition)", latitude: 7.6, region: "Bono East", name: "Techiman Municipal" },
  { value: "south", label: "Kumasi (south)", latitude: 6.7, region: "Ashanti", name: "Kumasi Metropolitan" },
] as const;

export type Place = (typeof PLACES)[number]["value"];

/** Daily rain (mm) for each scenario, before a little deterministic wobble is added. */
function pattern(scenario: Scenario, day: number): number {
  switch (scenario) {
    case "planting":
      if (day < 4) return 0.4;
      if (day < 7) return [9, 14, 6][day - 4];
      return day % 3 === 0 ? 1 : 7;
    case "dry_spell":
      if (day < 3) return 6;
      if (day < 14) return 0.2;
      return day % 2 ? 5 : 0.6;
    case "wet_spell":
      if (day < 2) return 0.3;
      if (day < 10) return 9;
      return day % 3 === 0 ? 4 : 0.5;
    case "heavy":
      if (day === 3) return 42;
      if (day === 9) return 58;
      return day % 2 ? 4 : 0.8;
    case "little_rain":
      return day % 9 === 4 ? 2 : 0.1;
  }
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function findSpells(days: SubseasonalDay[], kind: "dry" | "wet", minDays: number, wetDayMm: number): SubseasonalSpell[] {
  const spells: SubseasonalSpell[] = [];
  let start = -1;
  days.forEach((day, index) => {
    const hit = kind === "dry" ? (day.value ?? 0) < wetDayMm : (day.value ?? 0) >= wetDayMm;
    const last = index === days.length - 1;
    if (hit && start < 0) start = index;
    if (start >= 0 && (!hit || last)) {
      const end = hit && last ? index : index - 1;
      if (end - start + 1 >= minDays) {
        spells.push({
          kind,
          start_day: start + 1,
          end_day: end + 1,
          days: end - start + 1,
          start_date: days[start].date,
          end_date: days[end].date,
          open_start: start === 0,
          open_end: end === days.length - 1,
          total_mm: Math.round(days.slice(start, end + 1).reduce((sum, d) => sum + (d.value ?? 0), 0) * 10) / 10,
        });
      }
      start = -1;
    }
  });
  return spells;
}

export function sampleSeries(scenario: Scenario, place: Place, firstDay: string): SubseasonalSeries {
  const where = PLACES.find((item) => item.value === place) ?? PLACES[2];
  const thresholds = {
    wet_day_mm: 1,
    dry_spell_min_days: 7,
    wet_spell_min_days: 5,
    onset_mm: 20,
    onset_window_days: 3,
    onset_guard_days: 30,
    onset_max_dry_days: 10,
    extreme_rain_mm: 50,
  };
  const days: SubseasonalDay[] = Array.from({ length: 46 }, (_, index) => {
    const wobble = ((index * 37) % 7) / 10;
    const value = Math.round(Math.max(0, pattern(scenario, index) + (pattern(scenario, index) > 1 ? wobble : 0)) * 10) / 10;
    const date = addDays(firstDay, index);
    return {
      day: index + 1,
      date,
      period_start: `${date}T00:00:00Z`,
      period_end: `${addDays(date, 1)}T00:00:00Z`,
      value,
      wet: value >= thresholds.wet_day_mm,
      extreme_prob: value >= thresholds.extreme_rain_mm ? 100 : 0,
    };
  });
  const spells = [
    ...findSpells(days, "dry", thresholds.dry_spell_min_days, thresholds.wet_day_mm),
    ...findSpells(days, "wet", thresholds.wet_spell_min_days, thresholds.wet_day_mm),
  ].sort((a, b) => a.start_day - b.start_day);
  const onsetDay = scenario === "planting" ? 5 : null;
  return {
    kind: "point",
    name: where.name,
    region: where.region,
    district: where.name,
    latitude: where.latitude,
    longitude: -1,
    nearest_latitude: where.latitude,
    nearest_longitude: -1,
    inside_ghana: true,
    cell_count: 1,
    support: "sample",
    run_id: "admin-preview",
    init_time: `${firstDay}T00:00:00Z`,
    unit: "mm",
    days,
    weeks: [],
    metrics: { total_mm: null, rainy_days: 0, dry_spell_days: 0, wet_spell_days: 0, max_day_mm: null, max_day: null },
    onset: onsetDay
      ? { day: onsetDay, date: days[onsetDay - 1].date, rain_mm: 29.4, longest_dry_after: 3, guard_days: 30, provisional: false }
      : null,
    spells,
    thresholds,
    guidance: "",
    members: 1,
  };
}
