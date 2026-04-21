import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './web-tests',
  workers: 1,
  projects: [
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'phone',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
