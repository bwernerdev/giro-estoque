import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4186/giro-estoque/',
    channel: 'chrome',
    headless: true,
    reducedMotion: 'reduce',
    // Iguais ao computador da equipe, para o CI (GitHub Actions) dar o mesmo resultado.
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://127.0.0.1:4186/giro-estoque/',
    reuseExistingServer: false,
  },
});
