# HK House Tracker

A standalone, friend-friendly rental finder for Hong Kong Island listings, focused by default on Kennedy Town, Sai Ying Pun, and Shek Tong Tsui.

## What It Does

- Opens directly into the finder, not a landing page
- Shows Ktown/SYP listings first
- Lets friends search, filter by budget, filter by size, sort, save, and compare listings
- Keeps room-share, dorm, subdivided, and short-term-looking listings visible but clearly marked
- Serves the latest snapshot from `public/data/house-tracker/latest.json` for Vercel

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Refresh Listings

```bash
npm run house:scan
```

This runs the scanner and syncs `data/house-tracker/latest.json` into `public/data/house-tracker/latest.json` so the UI and deployment use the same snapshot.

## Deploy

This project is ready for GitHub and Vercel:

```bash
npm run build
vercel deploy --prod
```
