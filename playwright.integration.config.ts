import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.resolve(__dirname, "..");
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
      command:
        "cmd /c if not exist backend\\data\\artifacts mkdir backend\\data\\artifacts && xcopy /E /I /Y ml\\data\\artifacts backend\\data\\artifacts >nul && powershell -ExecutionPolicy Bypass -File .\\backend\\scripts\\start-backend-local.ps1",
      cwd: repoRoot,
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
