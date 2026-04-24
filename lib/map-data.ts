import type { Geometry, Position } from "geojson";

import type {
  DistrictFeature,
  DistrictFeatureCollection,
  DistrictMetadata,
  RawDistrictFeatureCollection,
  RegionFeatureCollection,
} from "@/lib/types";

type RawMapPayload = {
  districts: RawDistrictFeatureCollection;
  regions: RegionFeatureCollection;
};

type RepresentativePoint = {
  latitude: number;
  longitude: number;
};

function roundCoord(value: number) {
  return Number(value.toFixed(4));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function polygonArea(ring: Position[]) {
  if (ring.length < 3) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    total += x1 * y2 - x2 * y1;
  }

  return total / 2;
}

function polygonCentroid(ring: Position[]) {
  const area = polygonArea(ring);
  if (area === 0) {
    return null;
  }

  let centroidX = 0;
  let centroidY = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const factor = x1 * y2 - x2 * y1;
    centroidX += (x1 + x2) * factor;
    centroidY += (y1 + y2) * factor;
  }

  return {
    longitude: centroidX / (6 * area),
    latitude: centroidY / (6 * area),
  };
}

function bboxCenter(points: Position[]): RepresentativePoint {
  const xs = points.map(([lon]) => lon);
  const ys = points.map(([, lat]) => lat);

  return {
    latitude: roundCoord((Math.min(...ys) + Math.max(...ys)) / 2),
    longitude: roundCoord((Math.min(...xs) + Math.max(...xs)) / 2),
  };
}

function representativePoint(geometry: Geometry): RepresentativePoint {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

  const outerRings = polygons.map((polygon) => polygon[0]).filter(Boolean);
  if (!outerRings.length) {
    return {
      latitude: 0,
      longitude: 0,
    };
  }

  const largestRing = outerRings.reduce((largest, ring) =>
    Math.abs(polygonArea(ring)) > Math.abs(polygonArea(largest)) ? ring : largest,
  );
  const centroid = polygonCentroid(largestRing);
  if (centroid) {
    return {
      latitude: roundCoord(centroid.latitude),
      longitude: roundCoord(centroid.longitude),
    };
  }

  return bboxCenter(largestRing);
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return (await response.json()) as T;
}

export async function loadMapData(): Promise<{
  districtFeatures: DistrictFeatureCollection;
  regionFeatures: RegionFeatureCollection;
  districts: DistrictMetadata[];
  districtsByRegion: Record<string, DistrictMetadata[]>;
}> {
  const [rawDistricts, regions] = await Promise.all([
    loadJson<RawDistrictFeatureCollection>("/data/ghana_district_polygons_simplified.geojson"),
    loadJson<RegionFeatureCollection>("/data/ghana_regions_simplified.geojson"),
  ]);

  const seenIds = new Map<string, number>();
  const enrichedFeatures = rawDistricts.features.map((feature) => {
    const point = representativePoint(feature.geometry);
    const apiDistrict = feature.properties.api_district ?? feature.properties.display_name;
    const baseId = slugify(apiDistrict);
    const nextSuffix = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, nextSuffix + 1);
    const locationId = nextSuffix === 0 ? baseId : `${baseId}-${nextSuffix + 1}`;

    const enrichedFeature: DistrictFeature = {
      ...feature,
      properties: {
        ...feature.properties,
        api_district: apiDistrict,
        location_id: locationId,
        latitude: point.latitude,
        longitude: point.longitude,
      },
    };

    return enrichedFeature;
  });

  const districts = enrichedFeatures
    .map((feature) => ({
      name: feature.properties.display_name,
      region: feature.properties.region,
      apiDistrict: feature.properties.api_district,
      locationId: feature.properties.location_id,
      latitude: feature.properties.latitude,
      longitude: feature.properties.longitude,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const districtsByRegion = districts.reduce<Record<string, DistrictMetadata[]>>((accumulator, district) => {
    const group = accumulator[district.region] ?? [];
    group.push(district);
    accumulator[district.region] = group;
    return accumulator;
  }, {});

  return {
    districtFeatures: {
      type: "FeatureCollection",
      features: enrichedFeatures,
    },
    regionFeatures: regions,
    districts,
    districtsByRegion,
  };
}
