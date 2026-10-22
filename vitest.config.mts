import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Worker tests run inside workerd (Miniflare) against a local D1 with the real migrations.
// The Angular app is tested separately with Karma (`ng test`).
export default defineConfig(async () => {
  const migrations = await readD1Migrations('migrations');
  return {
    plugins: [
      cloudflareTest({
        main: './worker/index.ts',
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            ADMIN_PASSWORD: 'test-password',
            SESSION_SECRET: 'test-session-secret',
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ['worker/**/*.spec.ts'],
      setupFiles: ['./worker/test/apply-migrations.ts'],
      coverage: {
        provider: 'istanbul',
        include: ['worker/**/*.ts'],
        exclude: ['worker/**/*.spec.ts', 'worker/test/**'],
        reportsDirectory: './coverage/worker',
        reporter: ['html', 'lcovonly', 'text-summary'],
        thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  };
});
