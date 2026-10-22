# Homestead Acres

A farming game for PC and phone browsers: plow, plant and harvest, raise animals,
help your (AI) neighbors and grow the best farm in the county. Every rate is
adjustable per farm, and it plays offline once loaded.

**Play:** https://klbxkra.github.io/homestead-acres/

- Your farms are saved in your browser on your device; nothing is sent anywhere.
  Use ☰ → Export farm to keep a copy or move a farm to another device.
- On a phone, use the browser's **Install** or **Add to Home Screen** for a
  full-screen app that works offline (on iPhone and iPad this also stops Safari
  from clearing your farm after a week away).
- Landscape only on phones.

## For developers

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # typecheck, lint, tests
npm run build    # production build in dist/
```

The design and roadmap are in [PLAN.md](PLAN.md). Pushing to `main` publishes the
game to GitHub Pages (see `.github/workflows/pages.yml`).
