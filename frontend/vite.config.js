import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split React core into its own chunk so it's cached separately from
        // app code. All home and analysis tabs are already lazy (dynamic
        // imports) so they each emit their own chunk automatically.
        // Note: Vite 8 (rolldown) requires manualChunks as a function.
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
})
