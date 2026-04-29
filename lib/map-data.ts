import type { Geometry, Position } from "geojson";

import type {
  DistrictFeature,
  DistrictFeatureCollection,
  DistrictMetadata,
  RawDistrictFeatureCollection,
  RegionFeature,
  RegionFeatureCollection,
  RegionMetadata,
} from "@/lib/types";

type PointLikeFeatureCollection = {
  features: Array<{
    geometry: Geometry;
  }>;
};

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

function isPointOnSegment(
  longitude: number,
  latitude: number,
  start: Position,
  end: Position,
) {
  const [startLongitude, startLatitude] = start;
  const [endLongitude, endLatitude] = end;
  const crossProduct =
    (latitude - startLatitude) * (endLongitude - startLongitude) -
    (longitude - startLongitude) * (endLatitude - startLatitude);
  const tolerance = 1e-10;

  if (Math.abs(crossProduct) > tolerance) {
    return false;
  }

  return (
    longitude >= Math.min(startLongitude, endLongitude) - tolerance &&
    longitude <= Math.max(startLongitude, endLongitude) + tolerance &&
    latitude >= Math.min(startLatitude, endLatitude) - tolerance &&
    latitude <= Math.max(startLatitude, endLatitude) + tolerance
  );
}

function isPointInRing(longitude: number, latitude: number, ring: Position[]) {
  if (ring.length < 4) {
    return false;
  }

  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    const [currentLongitude, currentLatitude] = current;
    const [previousLongitude, previousLatitude] = previous;

    if (isPointOnSegment(longitude, latitude, previous, current)) {
      return true;
    }

    const crossesLatitude = currentLatitude > latitude !== previousLatitude > latitude;
    if (!crossesLatitude) {
      continue;
    }

    const intersectionLongitude =
      ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
        (previousLatitude - currentLatitude) +
      currentLongitude;

    if (longitude < intersectionLongitude) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInPolygonCoordinates(longitude: number, latitude: number, polygon: Position[][]) {
  const outerRing = polygon[0];
  if (!outerRing || !isPointInRing(longitude, latitude, outerRing)) {
    return false;
  }

  const holes = polygon.slice(1);
  return !holes.some((ring) => isPointInRing(longitude, latitude, ring));
}

export function isPointInGeometry(latitude: number, longitude: number, geometry: Geometry) {
  if (geometry.type === "Polygon") {
    return isPointInPolygonCoordinates(longitude, latitude, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => isPointInPolygonCoordinates(longitude, latitude, polygon));
  }

  return false;
}

export function isPointInFeatureCollection(
  latitude: number,
  longitude: number,
  featureCollection: PointLikeFeatureCollection,
) {
  return featureCollection.features.some((feature) => isPointInGeometry(latitude, longitude, feature.geometry));
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
  regions: RegionMetadata[];
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

  const enrichedRegions = regions.features.map((feature) => {
    const point = representativePoint(feature.geometry);
    const enrichedFeature: RegionFeature = {
      ...feature,
      properties: {
        ...feature.properties,
        latitude: point.latitude,
        longitude: point.longitude,
      },
    };
    return enrichedFeature;
  });

  const regionMetadata = enrichedRegions
    .map((feature) => ({
      name: feature.properties.region,
      latitude: feature.properties.latitude,
      longitude: feature.properties.longitude,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    districtFeatures: {
      type: "FeatureCollection",
      features: enrichedFeatures,
    },
    regionFeatures: {
      type: "FeatureCollection",
      features: enrichedRegions,
    },
    districts,
    districtsByRegion,
    regions: regionMetadata,
  };
}
