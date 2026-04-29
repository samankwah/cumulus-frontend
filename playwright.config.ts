import { defineConfig, devices } from "@playwright/test";

const frontendPort = process.env.FRONTEND_PORT ?? "3000";
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

export default defineConfig({
  testDir: "./tests",
  testIgnore: /.*\.integration\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: frontendUrl,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `cmd /c npm run start:server -- --hostname 127.0.0.1 --port ${frontendPort}`,
    cwd: __dirname,
    url: frontendUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8000",
      NEXT_PUBLIC_DISABLE_THEMATIC_WARMUP: "1",
    },
  },
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
