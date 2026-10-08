"use client";

import { useEffect, useState } from "react";

import type { MapControlsHandle } from "@/components/forecast-raster-map";

/** Zoom in / out and reset-view buttons for the map, styled like the rest of the floating chrome. */
export function MapZoomControls({ controls }: { controls: MapControlsHandle | null }) {
  const [zoom, setZoom] = useState<number | null>(null);
  const map = controls?.map ?? null;

  useEffect(() => {
    if (!map) {
      return;
    }
    const sync = () => setZoom(map.getZoom());
    sync();
    map.on("zoomend", sync);
    return () => {
      map.off("zoomend", sync);
    };
  }, [map]);

  if (!controls || !map || zoom === null) {
    return null;
  }

  return (
    <div className="map-zoom" role="group" aria-label="Map view">
      <button
        type="button"
        className="map-zoom-button"
        data-testid="map-zoom-in"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={zoom >= map.getMaxZoom()}
        onClick={() => map.zoomIn()}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M10 4.5v11M4.5 10h11" />
        </svg>
      </button>
      <button
        type="button"
        className="map-zoom-button"
        data-testid="map-zoom-out"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={zoom <= map.getMinZoom()}
        onClick={() => map.zoomOut()}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M4.5 10h11" />
        </svg>
      </button>
      <button
        type="button"
        className="map-zoom-button"
        data-testid="map-reset-view"
        aria-label="Reset map view"
        title="Reset map view"
        onClick={controls.resetView}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M4.6 8.2a5.8 5.8 0 1 1-.2 3.6" />
          <path d="M4.2 4.4v3.9h3.9" />
        </svg>
      </button>
    </div>
  );
}
