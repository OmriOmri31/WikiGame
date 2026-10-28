import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.mjs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // One retry in CI absorbs a rare slow runner; a test that only passes on retry is reported as flaky.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 4,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], permissions: ['clipboard-read', 'clipboard-write'] } },
    // iPhone size, touch and user agent. Runs in WebKit, the engine of every iPhone browser.
    { name: 'iphone', use: { ...devices['iPhone 13'] }, testIgnore: /performance|security/ },
    // An Android phone in Chrome, for what only Android does: the device's back button.
    { name: 'android', use: { ...devices['Pixel 7'] }, testMatch: /navigation/ },
  ],
  webServer: {
    command: `node serve.mjs ../web/dist-e2e ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
