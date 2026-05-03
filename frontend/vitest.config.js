import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Run both legacy co-located tests and new top-level tests/ regression suite.
    include: [
      'src/**/*.test.{js,jsx,ts,tsx}',
      'tests/**/*.test.{js,jsx,ts,tsx}',
    ],
    exclude: ['node_modules', 'dist'],
    coverage: {
      reporter: ['text', 'html'],
      include: [
        'src/calculators/**',
        'src/validators/**',
        'src/utils/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
