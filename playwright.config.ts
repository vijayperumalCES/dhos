import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the local Supabase stack with the demo seed loaded
 * (`supabase db reset`). The web server is started with `pnpm dev:local`, which overrides
 * .env.local so tests never touch a hosted project. Tests create uniquely-coded records, so
 * they can be re-run without a reset.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev:local",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
