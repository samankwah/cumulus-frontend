# Cumulus Frontend

Standalone Next.js seasonal advisory map for Ghana.

The FastAPI backend lives in a separate repository,
[`seasonal-fcst-backend`](https://github.com/samankwah/seasonal-fcst-backend). The
instructions below assume the two repositories are checked out side by side:

```
seasonalfcst/
  seasonal-fcst-frontend/   <- this repo
  seasonal-fcst-backend/
```

## What it includes

- Ghana district and region choropleth map with `react-leaflet`
- Published classified seasonal products loaded from the backend `GET /forecast/products/options`,
  `GET /forecast/probability/active` and `GET /forecast/deterministic/active` endpoints
- Seasonal regime and sub-season controls for onset, cessation, dry spell, rainfall total, and rainy-day products
- District and regional drill-down with published metric metadata, legend hints, and freshness status
- Backend-generated ERA5 and GFS products served as source-specific artifacts
- In-situ station data consumed on the backend for training and calibration rather than as a direct frontend map layer

## Run locally

```bash
copy .env.example .env.local
cmd /c npm install
cmd /c npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` to the running FastAPI backend, for example `http://127.0.0.1:8000`.

Use `cmd /c npm run dev` for iterative development. It runs `scripts/start-development.mjs`, a custom Next development server, so local startup still works on Windows environments where the raw Next CLI worker exits with `spawn EPERM`. If you specifically need the raw Next CLI, use `cmd /c npm run dev:next`.

For a local production-style run, use the PowerShell helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-frontend-production-local.ps1
```

That helper always rebuilds before `next start` so the server and emitted chunk hashes stay in sync. Use `npm run dev` for iterative work, and avoid raw `next start` for manual smoke runs.

## Local start scripts

The PowerShell helpers in this repo start a single server each and refuse to start if the target port is already listening (they print the owning PID). Add `-ForceRestart` only when replacing a detected local Cumulus process.

Start the backend (from the backend repo):

```powershell
powershell -ExecutionPolicy Bypass -File ..\seasonal-fcst-backend\scripts\start-backend-local.ps1
```

In a second terminal, start the development frontend:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-frontend-local.ps1
```

For a local production-style frontend run with a fresh build:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-frontend-production-local.ps1
```

These defaults point the frontend to `http://127.0.0.1:8000` and the backend to `data/sample_forecast_smoke.nc` unless you already set the relevant environment variables.

Map polygons stay local in `public/data/*.geojson`. The frontend renders backend-generated seasonal classifications rather than raw forecast rasters. ERA5 and GFS remain backend source options, and in-situ station data is used for training/calibration rather than as a direct map layer.

Chrome requests to `/.well-known/appspecific/com.chrome.devtools.json` can return 404 during local development; that is browser/devtools probing and not an app failure. Next.js may compile `/_not-found` in dev, React StrictMode may duplicate initial frontend requests, and Leaflet map tile requests are expected while the map is visible.

## Build checks

```bash
cmd /c npm run typecheck
cmd /c npm run build
```

## Chunk 404 recovery

If the browser console shows hashed chunk 404s and the missing filenames do not exist under `.next/static/chunks`, recover with this sequence:

1. Stop the frontend server.
2. Delete `.next`.
3. Rebuild with `cmd /c npm run build`.
4. Start again with `powershell -ExecutionPolicy Bypass -File .\start-frontend-production-local.ps1`.
5. Hard refresh the browser.

## Browser smoke test

The browser smoke test builds the Next.js app first, then starts the production server in the same workflow, intercepts the backend `GET /forecast/*` calls in the browser, and clicks through one district and one region selection in Chrome.

The smoke harness uses the locally installed Chrome browser through Playwright. If Chrome is not installed on the machine, install it first or switch the Playwright channel in [playwright.config.ts](./playwright.config.ts).

Run the smoke test:

```bash
cmd /c npm run smoke
```

The smoke harness sets `NEXT_PUBLIC_DISABLE_THEMATIC_WARMUP=1` so the initial browser interaction is not competing with the full-map background cache warm-up.

## Real API integration smoke

The integration smoke test builds the Next.js app first, then starts the production server in the same workflow alongside the local FastAPI backend, points the frontend at `http://127.0.0.1:8000`, refreshes the published seasonal products through `/forecast/products/refresh`, and drives the map UI through the real `/forecast/*` endpoints. If no raw ERA5 or GFS manifest has been downloaded locally, the backend helper falls back to `data/sample_forecast_smoke.nc`.

The backend repo is expected as a sibling directory (`../seasonal-fcst-backend`). Override its location with `CUMULUS_BACKEND_DIR` before running the harness.

Run the real integration harness:

```bash
cmd /c npm run smoke:integration
```

If the backend environment on the machine cannot import `cumulus.main:app`, install the backend package (`python -m pip install -e ..\seasonal-fcst-backend[dev]`) or make sure Python can import its `src/`.
