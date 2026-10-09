import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// The backend is a separate repository. By default we expect it checked out as a
// sibling directory (../cumulus-backend); override with CUMULUS_BACKEND_DIR.
const backendDir = process.env.CUMULUS_BACKEND_DIR
  ? path.resolve(process.env.CUMULUS_BACKEND_DIR)
  : path.resolve(__dirname, "..", "cumulus-backend");
const currentEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const frontendPort = process.env.FRONTEND_PORT ?? "3000";
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.integration\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: frontendUrl,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "powershell -ExecutionPolicy Bypass -File .\\scripts\\start-backend-local.ps1",
      cwd: backendDir,
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: currentEnv,
    },
    {
      command: `cmd /c npm run start:server -- --hostname 127.0.0.1 --port ${frontendPort}`,
      cwd: __dirname,
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...currentEnv,
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
