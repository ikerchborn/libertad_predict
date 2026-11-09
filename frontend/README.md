This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Extracting Trujillo routes

From this directory, run:

```bash
node scripts/extract_truxdi_routes.mjs
```

The extractor requests route pages sequentially, waits 8-15 seconds between pages, and resumes from `scripts/progress.json`. It writes normalized route data to `src/data/rutas_trujillo.json`. Truxdi does not expose a route JSON endpoint in the public page requests; the extractor reads the public page payload and structured stop/map data instead. Any SVG trace is kept only when its georeferencing fit is within 25 m, and missing return geometry is never reversed or inferred.

The planner uses the catalog's stop order and route geometry to find boarding/alighting pairs, includes an estimated six-minute wait, and validates longer access walks against OSRM where available. Only geometries marked verified are rendered as solid lines; other traces remain referential and display a warning. A missing physical landmark is not inferred—the instructions ask the rider to confirm the exact stop with the transport company. Truxdi provides a line palette only for some services; other badges use a stable app color and are not represented as official company colors.

The scanned August 2018 municipal plan lists 37 proposed routes but no current GPS traces. It is treated as historical context only and is not used to fill missing geometry.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
