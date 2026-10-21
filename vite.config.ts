import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // The app server rewrites data/database.json (and data/protected/*, backups/) on almost every action. Vite's watcher used to treat
      // that as a source change and hard-reloaded the browser, which threw the user back to the dashboard (e.g. right after opening
      // "Today & Clients", whose digest saves). Only front-end sources should be watched.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/data/**', '**/backups/**', '**/dist/**', '**/docs/**', '**/tests/**', '**/deploy/**', '**/*.log'],
      },
    },
  };
});
