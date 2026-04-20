import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

// xlsx-js-style's bundle does `require("stream").Readable` (and fs/crypto checks).
// In the browser these Node built-ins don't exist, so we alias them to an empty
// module — the library's branches skip when the properties are falsy.
const emptyNodeShim = fileURLToPath(new URL('./src/shims/empty-node.js', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      stream: emptyNodeShim,
      fs: emptyNodeShim,
      crypto: emptyNodeShim,
    },
  },
  server: {
    historyApiFallback: true,
    allowedHosts: true
  },
  preview: {
    historyApiFallback: true
  }
})
