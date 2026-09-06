# bike-game

Working title. The bike ride from [hasanuzzaman.com](https://hasanuzzaman.com), lifted out
of the portfolio to grow into a game of its own.

`src/components/ProjectDrive.vue` is the portfolio's file, unchanged, so fixes can move in
either direction by diff. The page-level things it expects — a scroll smoother, a guide
avatar, GitHub repos for the billboards — are stubbed in `src/composables/useGsap.js`,
`src/composables/useGuide.js` and `src/data/githubSnapshot.js`.

```
npm install
npm run dev
npm test
```
