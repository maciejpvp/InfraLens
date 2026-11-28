import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://maciejpvp.github.io',
  base: '/Laytrace',
  publicDir: './.cache/public',
  devToolbar: { enabled: false },
})
