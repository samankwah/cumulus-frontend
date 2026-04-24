# Cumulus Frontend

Standalone Next.js agro-weather dashboard for Ghana.

## What it includes

- Ghana district and region choropleth map with `react-leaflet`
- District point calls to `POST /predict` and `POST /advisory`
- Regional composites built client-side from mapped district requests
- Daily rainfall chart with corrected and raw rainfall series
- Farmer-facing advisory cards for planting, dry spell, and irrigation

## Run locally

```bash
copy .env.example .env.local
cmd /c npm install
cmd /c npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` to the running FastAPI backend, for example `http://127.0.0.1:8000`.

Use `cmd /c npm run dev` for iterative development.

For a local production-style run, use the PowerShell helper:

```powershell
powershell -ExecutionPolicy Bypass -File .\frontend\start-frontend-production-local.ps1
```

That helper always rebuilds before `next start` so the server and emitted chunk hashes stay in sync. Use `npm run dev` for iterative work, and avoid raw `next start` for manual smoke runs.

## Local start scripts

If you want repeatable local startup commands, use the PowerShell helpers from the repo root.

For the development server:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-backend-local.ps1
```

In a second terminal:

```powershell
powershell -ExecutionPolicy Bypass -File .\frontend\start-frontend-local.ps1
```

For a local production-style frontend run with a fresh build:

```powershell
powershell -ExecutionPolicy Bypass -File .\frontend\start-frontend-production-local.ps1
```

These defaults point the frontend to `http://127.0.0.1:8000` and the backend to `data/sample_forecast_smoke.nc` unless you already set the relevant environment variables.

Map polygons stay local in `frontend/public/data/*.geojson`. Forecast values and farmer advisory values come from the backend APIs, which now prefer downloaded ERA5 and GFS data registered under `data/raw`.

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
4. Start again with `powershell -ExecutionPolicy Bypass -File .\frontend\start-frontend-production-local.ps1`.
5. Hard refresh the browser.

## Browser smoke test

The browser smoke test builds the Next.js app first, then starts the production server in the same workflow, intercepts the forecast and advisory HTTP calls in the browser, and clicks through one district and one region selection in Chrome.

The smoke harness uses the locally installed Chrome browser through Playwright. If Chrome is not installed on the machine, install it first or switch the Playwright channel in [playwright.config.ts](C:\Users\CRAFT\Desktop\future MEST projects\Backend\cumulus\frontend\playwright.config.ts).

Run the smoke test:

```bash
cmd /c npm run smoke
```

The smoke harness sets `NEXT_PUBLIC_DISABLE_THEMATIC_WARMUP=1` so the initial browser interaction is not competing with the full-map background cache warm-up.

## Real API integration smoke

The integration smoke test builds the Next.js app first, then starts the production server in the same workflow alongside the local FastAPI backend, points the frontend at `http://127.0.0.1:8000`, and drives the map UI through the real `/predict` and `/advisory` endpoints. If no raw ERA5 or GFS manifest has been downloaded locally, the backend helper falls back to `data/sample_forecast_smoke.nc`.

Run the real integration harness:

```bash
cmd /c npm run smoke:integration
```

If the backend environment on the machine cannot import `cumulus.main:app`, run the command from the repo root after installing the backend package or make sure Python can import `src/`.
