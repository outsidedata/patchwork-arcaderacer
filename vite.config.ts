import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Vite's own list but for `*.crt`, which it keeps out as a TLS certificate: a `.crt` here is a
      // Commodore 64 cartridge a game reads (games/emulatorc64). A key stays out, as `.pem` or `.key`.
      deny: ['.env', '.env.*', '*.pem', '*.key', '**/.git/**'],
    },
  },
})
