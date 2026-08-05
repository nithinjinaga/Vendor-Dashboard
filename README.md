# Customer Tracker Dashboard

A single-file browser dashboard for tracking vendor/customer dispatch, stock, and payment data. Upload an Excel file (.xlsx) and get interactive charts and filterable tables — no server, no install.

## Usage

1. Open `vendor-dashboard.html` in any browser
2. Drop an Excel file (or click to browse)
3. Filter by customer, lead, sub-lead, or WP

## Features

- Excel parsing (SheetJS) and charting (Chart.js) — all inlined, works offline
- Tracks PO quantity, dispatch, pending, stock, MDCC received (NOS & MW)
- Payment tracking: amount due, received, pending, BOE filed/accepted
- Filters persist in localStorage
- Unit toggle (NOS/MW)

## Tech

Everything lives in `vendor-dashboard.html` — libraries are bundled inline. No build step, no dependencies to install.
