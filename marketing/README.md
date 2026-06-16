# Lumen marketing site

Standalone landing site for the Lumen reader, separate from the reader app.
Implements the Claude Design handoff (`Lumen.dc.html`): Spectral + Hanken Grotesk
typography, Daylight/Midnight light/dark chrome, soft rounded geometry, a hero
with phone + browser reader mockups, an 8-feature grid, a live 10-theme gallery
(with per-theme and full `themes.ts` copy), a privacy section and footer.

The theme token values in `src/themes.js` mirror the app's
`../src/theme/themes.ts` exactly.

## Develop

```bash
cd marketing
npm install
npm run dev      # local dev server
npm run build    # production build to marketing/dist
npm run preview  # preview the build
```

Deploy `marketing/dist` anywhere static. The reader app builds and deploys
independently from the repo root.
