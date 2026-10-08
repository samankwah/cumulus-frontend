"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

const FADE_MS = 220;
const LOAD_CEILING_MS = 4000;

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/**
 * A raster tile layer that swaps URLs without flashing: the next frame loads underneath the
 * visible one, fades in once its tiles are ready, then every older frame is removed.
 * `onLoad(url)` fires when a frame is fully shown so playback can pace itself on real loads.
 * `prefetchUrls` warms the browser cache for neighbouring frames (backend tiles are immutable).
 */
export function CrossfadeTileLayer({
  url,
  opacity,
  pane,
  onLoad,
  prefetchUrls = [],
}: {
  url: string | null;
  opacity: number;
  pane: string;
  onLoad?: (url: string) => void;
  prefetchUrls?: string[];
}) {
  const map = useMap();
  const visibleRef = useRef<L.TileLayer | null>(null);
  const pendingRef = useRef<{ layer: L.TileLayer; url: string } | null>(null);
  const layersRef = useRef<Set<L.TileLayer>>(new Set());
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    const layers = layersRef.current;

    if (!url) {
      layers.forEach((layer) => layer.remove());
      layers.clear();
      visibleRef.current = null;
      pendingRef.current = null;
      return;
    }
    if (pendingRef.current?.url === url) {
      return;
    }
    // A frame that never finished loading is superseded: drop it right away.
    if (pendingRef.current) {
      pendingRef.current.layer.remove();
      layers.delete(pendingRef.current.layer);
      pendingRef.current = null;
    }

    const isFirst = !visibleRef.current;
    const next = L.tileLayer(url, {
      pane,
      opacity: isFirst ? opacityRef.current : 0,
      className: "crossfade-tile-layer",
      keepBuffer: 4,
      updateWhenZooming: false,
    });
    layers.add(next);
    pendingRef.current = { layer: next, url };
    let settled = false;
    let ceiling = 0;

    const settle = () => {
      if (settled || pendingRef.current?.layer !== next) {
        return;
      }
      settled = true;
      window.clearTimeout(ceiling);
      pendingRef.current = null;
      visibleRef.current = next;
      next.setOpacity(opacityRef.current);
      const older = [...layers].filter((layer) => layer !== next);
      window.setTimeout(
        () => {
          for (const layer of older) {
            if (layer !== visibleRef.current) {
              layer.remove();
              layers.delete(layer);
            }
          }
        },
        prefersReducedMotion() ? 0 : FADE_MS + 40,
      );
      onLoadRef.current?.(url);
    };

    next.on("load", settle);
    // Never stall playback on a slow or failed tile.
    ceiling = window.setTimeout(settle, LOAD_CEILING_MS);
    next.addTo(map);
  }, [map, pane, url]);

  useEffect(() => {
    visibleRef.current?.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    const layers = layersRef.current;
    return () => {
      layers.forEach((layer) => layer.remove());
      layers.clear();
      // Reset so a remount (React StrictMode, HMR) re-adds the current frame.
      visibleRef.current = null;
      pendingRef.current = null;
    };
  }, []);

  // Warm the cache for the visible tiles of neighbouring frames.
  const prefetchKey = prefetchUrls.join("|");
  useEffect(() => {
    if (!prefetchKey) {
      return;
    }
    const templates = prefetchKey.split("|");
    const handle = window.setTimeout(() => {
      const zoom = Math.round(map.getZoom());
      const bounds = map.getPixelBounds();
      if (!bounds.min || !bounds.max) {
        return;
      }
      const min = bounds.min.divideBy(256).floor();
      const max = bounds.max.divideBy(256).floor();
      for (const template of templates) {
        for (let x = min.x; x <= max.x; x += 1) {
          for (let y = min.y; y <= max.y; y += 1) {
            const image = new Image();
            image.decoding = "async";
            image.src = L.Util.template(template, { x, y, z: zoom });
          }
        }
      }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [map, prefetchKey]);

  return null;
}
