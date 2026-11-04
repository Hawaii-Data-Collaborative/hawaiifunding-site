# hawaiifunding-site

A static version of the [hawaiifunding.org](https://hawaiifunding.org) charts and Program ID pages that needs no server or database. It is being prepared for the Hawaiʻi Funding Project's sunset in November 2026.

**Status: private, in preparation.** The live site still runs from [hfp](https://github.com/Hawaii-Data-Collaborative/hfp), unchanged. Nothing here is published, and this repo will stay private until the team agrees to publish it and picks a license.

## Where this came from

The chart code is a copy of hfp's `client/` folder at commit `8110752` (2026-11-04), written by Kyle Mulleady. It was copied as files with fresh history, so none of hfp's server, database, admin code or git history is here. The first commit in this repo is that copy, unchanged, so every later change shows up as a diff against hfp.

hfp's `client/` may keep changing before the sunset. Changes made there don't flow here automatically; carry them over by hand and note the hfp commit.

## Where the data comes from

Every number the pages show comes from files built by the [State-Budget](https://github.com/Hawaii-Data-Collaborative/State-Budget) repo's `build_site_data.py`, which computes them from that repo's CSVs. [docs/SITE_DATA.md](https://github.com/Hawaii-Data-Collaborative/State-Budget/blob/main/docs/SITE_DATA.md) in State-Budget describes each file and the changes this code needs to read them in place of hfp's server.

## Plan

1. ~~Copy hfp's `client/` here.~~
2. Make the changes in `SITE_DATA.md`: read the data files instead of calling `/api/*`, take the year range from the data, and switch off analytics.
3. Run it locally and compare it with the live site, page by page.
4. With the team's agreement: choose a license, make the repo public, and turn on GitHub Pages.

The `/downloads` page (email-gated workbook zips) and the admin pages are not part of this repo.

## Running it locally

Needs [Node.js](https://nodejs.org) (or [Bun](https://bun.sh), which hfp uses):

```bash
npm install
npm run dev
```

The embed test pages are `embed-test-state.html`, `embed-test-federal.html` and `embed-test-program.html`.
