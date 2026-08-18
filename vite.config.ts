import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El CLI de Tauri arranca este dev server y luego abre la ventana apuntando al
// puerto, por eso tiene que ser fijo y fallar si esta ocupado.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'chrome110',
    sourcemap: false,
  },
})
