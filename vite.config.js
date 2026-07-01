import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: change `base` to match your GitHub repo name, e.g. '/people-os/'
export default defineConfig({
  plugins: [react()],
  base: '/people-os/',
})
