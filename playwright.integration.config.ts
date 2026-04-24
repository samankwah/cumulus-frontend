import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.resolve(__dirname, "..");
const smokeForecastPath = path.join(repoRoot, "backend", "data", "sample_forecast_smoke.nc");

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.integration\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "cmd /c if not exist data\\artifacts mkdir data\\artifacts && xcopy /E /I /Y training\\data\\artifacts data\\artifacts >nul && python -m uvicorn cumulus.main:app --app-dir backend\\src --host 127.0.0.1 --port 8000",
      cwd: repoRoot,
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        CUMULUS_UPSTREAM_FORECAST_PATH: smokeForecastPath,
        CUMULUS_UPSTREAM_FORECAST_ENGINE: "scipy",
      },
    },
    {
      command: "cmd /c npm run start:server -- --hostname 127.0.0.1 --port 3000",
      cwd: __dirname,
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8000",
        NEXT_PUBLIC_DISABLE_THEMATIC_WARMUP: "1",
      },
    },
  ],
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],
});
