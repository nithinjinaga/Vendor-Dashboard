# Customer Tracker Dashboard

A browser dashboard for tracking vendor/customer dispatch, stock, and payment data. Upload an Excel file and get interactive charts and filterable tables.

## Live Dashboard (Vercel)

Hosted on Vercel with persistent data storage. Anyone with the URL can view the dashboard. Admin uploads are password-protected.

### Setup

1. Connect this repo to [Vercel](https://vercel.com)
2. Create a Blob store in Vercel Storage and connect it to the project
3. Add `UPLOAD_PASSWORD` in Settings → Environment Variables
4. Note: Vercel may name the blob token with a prefix (e.g. `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`) — the code references this explicitly

### Admin Upload

1. Click the user icon (top-right)
2. Enter the admin password — verified server-side before showing the drop zone
3. Drop an Excel file — data is parsed client-side and stored in Vercel Blob Storage
4. All viewers see the updated dashboard instantly

## Local Usage

Open `vendor-dashboard.html` in any browser for a standalone version (no server needed).

## Features

- Excel parsing (SheetJS) and charting (Chart.js) — all inlined, works offline
- Tracks PO quantity, dispatch, pending, stock, MDCC received (NOS & MW)
- Payment tracking: amount due, received, pending, BOE filed/accepted
- Filterable by customer, lead, sub-lead, WP, and more
- Unit toggle (NOS/MW)
- Handles incomplete rows and Excel errors (#REF!, #N/A, etc.)

## Tech

- `vendor-dashboard.html` — standalone local dashboard
- `public/index.html` — Vercel-hosted dashboard with admin upload
- `api/upload.js` — password-protected upload endpoint (Vercel Blob)
- `api/data.js` — serves stored dashboard data
- `api/verify.js` — validates admin password
