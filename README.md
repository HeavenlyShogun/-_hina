# 風物之詩琴

SPA built with Vite + React and deployed to GitHub Pages.

## Deployment context

- Repo: `https://github.com/HeavenlyShogun/-_hina/`
- Live URL: `https://heavenlyshogun.github.io/-_hina/`
- Base path: `/-_hina/`
- Hosting: GitHub Pages via `.github/workflows/deploy.yml`
- SPA refresh handling: `public/404.html` + `index.html` sessionStorage recovery

`vite.config.js` keeps the GitHub Pages repo name pinned to `-_hina` unless a CI env overrides it, so local builds do not fall back to an unrelated repo name.

## Recommended workflow

1. Start fast local iteration with `npm run dev`.
2. When routing, assets, or refresh behavior changed, verify the deployed path with `npm run preview:pages`.
3. Open `http://localhost:4173/-_hina/` and test at least one nested URL refresh, for example `http://localhost:4173/-_hina/about`.
4. Push to `main`; GitHub Actions deploys automatically.

## Useful commands

```bash
npm run dev
npm run build
npm run preview:pages
```

`npm run build` now builds with the GitHub Pages repo context by default, which is safer for final verification before `git push`.
