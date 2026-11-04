# hawaiifunding-site

A static version of the [hawaiifunding.org](https://hawaiifunding.org) charts and Program ID pages that needs no server or database. It is being prepared for the Hawaiʻi Funding Project's sunset in November 2026.

**Status: private, in preparation.** The live site still runs from [hfp](https://github.com/Hawaii-Data-Collaborative/hfp), unchanged. Nothing here is published yet.

## Where this came from

The chart code is a copy of hfp's `client/` folder at commit `8110752` (2026-11-04), written by Kyle Mulleady. It was copied as files with fresh history, so none of hfp's server, database, admin code or git history is here. The first commit in this repo is that copy, unchanged, so every later change shows up as a diff against hfp.

hfp's `client/` may keep changing before the sunset. Changes made there don't flow here automatically; carry them over by hand and note the hfp commit.

## Where the data comes from

Every number the pages show comes from files built by the [State-Budget](https://github.com/Hawaii-Data-Collaborative/State-Budget) repo's `build_site_data.py`, which computes them from that repo's CSVs. [docs/SITE_DATA.md](https://github.com/Hawaii-Data-Collaborative/State-Budget/blob/main/docs/SITE_DATA.md) in State-Budget describes each file and the changes this code needs to read them in place of hfp's server.

## Plan

1. ~~Copy hfp's `client/` here.~~
2. ~~Make the changes in `SITE_DATA.md`: read the data files instead of calling `/api/*`, take the year range from the data, and switch off analytics.~~ Done 2026-11-04: `src/staticData.ts` answers what the server did, and the three embed test pages run locally with no server.
3. ~~Compare it with the live site, page by page.~~ Done 2026-11-04, against hawaiifunding.org's fedviz, stateviz and programid pages, by every chart's labels and every Program ID section's text:
   - **Federal page:** all 7 charts identical.
   - **State page:** all 6 charts the same; in the budget composition donut two department labels are drawn in a different order.
   - **Program ID (AGR141, EDN100, HMS301, TRN102):** every section has the same content. The only differences are the order of rows tied on amount in the capital projects and grants lists, which the live database returns in no fixed order.
4. ~~Choose a license.~~ MIT, matching State-Budget (2026-11-04).
5. Make the repo public and turn on GitHub Pages.

The `/downloads` page (email-gated workbook zips) and the admin pages are not part of this repo.

## What changed from hfp

- `src/staticData.ts` (new): returns exactly what hfp's `/api/program/*` and `/api/federal/*` returned, from the data files.
- `src/constants.ts`: `DATA_URL`, where the data files are served (`/data` locally).
- `src/loadProgramData.ts`, `src/loadFederalData.ts`, `src/loadStateData.ts`, `src/ui/federal/FederalDrillDown.tsx`, `src/ui/federal/FederalComposition.tsx`: read the files instead of calling the server; the federal charts take their year range from the data.
- `src/analytics.ts`: off (nothing to send to, and no visitor IDs stored).
- `package.json`: `npm run copy-data`, and d3 pinned to the versions hfp's `bun.lock` had (d3 7.9.0, d3-selection 3.0.0, d3-transition 3.0.1). The newer d3 7.9.2 / d3-transition 3.0.2 that npm picks otherwise break the production build of the state charts (`selection.transition is not a function`).
- npm instead of Bun: `package-lock.json` replaces `bun.lock`.

## Running it locally

Needs [Node.js](https://nodejs.org), and the data files built in State-Budget (`python build_site_data.py` there). From this folder:

```bash
npm install
npm run copy-data
npm run dev
```

`copy-data` copies `..\State Budget\Processed Data\site` into `public\data` (set `SITE_DATA_DIR` to copy from elsewhere). Then open the test pages at <http://localhost:3001/embed-test-federal.html> and <http://localhost:3001/embed-test-program.html?program=EDN100>. They load the source directly.

`embed-test-state.html` loads the built bundle instead, so build it first with `npm run build:embed-state` (and after each change).

## License

- **Code:** [MIT License](LICENSE), © 2025–2026 Hawaii Data Collaborative, the same as [State-Budget](https://github.com/Hawaii-Data-Collaborative/State-Budget). The chart code was written by HDC staff (Kyle Mulleady, in hfp) and is HDC's work.
- **Data** (the files `npm run copy-data` copies in from State-Budget, served at `/data`): [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/), as State-Budget declares it. Credit the Hawaii Data Collaborative / Hawaiʻi Funding Project.
