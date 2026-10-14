import mdx from '@astrojs/mdx'
import react from '@astrojs/react'
import { defineConfig } from 'astro/config'

// Static site: every tool runs in the browser, nothing is sent to a server of ours.
export default defineConfig({
  site: 'https://specsure.vercel.app',
  integrations: [react(), mdx()],
  vite: {
    worker: { format: 'es' },
  },
})
