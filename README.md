# HK House Tracker

A standalone, friend-friendly rental finder for Hong Kong Island listings, focused by default on Kennedy Town, Sai Ying Pun, and Shek Tong Tsui.

Live app: https://house-tracker-omega.vercel.app

## What It Does

- Opens directly into the finder, not a landing page
- Shows Ktown/SYP listings first
- Lets friends search, filter by budget, filter by size, sort, save, and compare listings
- Keeps room-share, dorm, subdivided, and short-term-looking listings visible but clearly marked
- Serves the latest snapshot from `public/data/house-tracker/latest.json` for Vercel
- Tracks 28HSE, Carousell, and Airbnb coverage in the hosted snapshot
- Refreshes listing data online every 3 hours through GitHub Actions

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Refresh Listings Locally

```bash
npm run house:scan
```

This runs the scanner and syncs `data/house-tracker/latest.json` into `public/data/house-tracker/latest.json` so the UI and deployment use the same snapshot.

## Sources

- 28HSE: parsed into sortable listing cards because its public rental result pages allow access and include rent, saleable area, and listing metadata.
- Carousell: tracked as per-area search links because its robots rules disallow automated `/search/` crawling and the tracker receives a 403 from public search pages.
- Airbnb: tracked as per-area search links because the structured search-result pages are disallowed for general crawlers.

The UI shows all tracked sources, while parsed listing rankings currently come from 28HSE.

## Hosted Refresh

The hosted app is refreshed by `.github/workflows/refresh-and-deploy.yml`.

- Schedule: every 3 hours
- Runner: GitHub Actions
- Output: commits refreshed snapshots to `data/house-tracker/latest.json` and `public/data/house-tracker/latest.json`
- Deployment: Vercel rebuilds production from the connected `main` branch

The old Windows scheduled task is not required for hosted refreshes.

## Deploy Manually

The project is connected to Vercel, but manual deployment still works:

```bash
npm run build
vercel deploy --prod
```
