# Getting the Crawler Running

## 1. Install dependencies

```bash
npm install
```

> Puppeteer downloads Chromium on first install (~300MB). This is used for slug
> discovery on myscheme.gov.in. It only runs once per crawl at the start.

---

## 2. Set up your `.env` file

```bash
cp .env.example .env
```

The defaults in `.env.example` work out of the box for MyScheme.gov.in.
The only required values are already filled in:

| Variable | Value |
|---|---|
| `MYSCHEME_API_BASE` | `https://api.myscheme.gov.in/schemes/v6/public/schemes` |
| `MYSCHEME_API_KEY` | `tYTy5eEhlu9rFjyxuCr7ra7ACp4dv1RH8gWuHTDc` |

---

## 3. Test the API connection first (dry run)

This fetches 3 known schemes from the API and prints them — **nothing is saved to DB**.

```bash
npm run crawl:dry
```

Expected output:
```
✓ Database ready
🔍 DRY RUN — fetching 3 known schemes (not saving to DB)

  Fetching: pmmy...
  ✅ Pradhan Mantri MUDRA Yojana (PMMY)
     Ministry : Ministry Of Finance
     ID       : 64b...

  Fetching: pmjdy...
  ✅ Pradhan Mantri Jan Dhan Yojana
     ...
```

---

## 4. Run the full crawler

```bash
npm run crawl
```

This will:
1. Launch Puppeteer and scroll through myscheme.gov.in/search to discover all scheme slugs
2. Fall back to a hardcoded list of ~18 slugs if Puppeteer fails
3. Fetch each scheme from the API one-by-one (2 second delay between each)
4. Save to `database.sqlite`

Progress is tracked in the `crawler_jobs` table.

---

## 5. Crawl specific slugs (useful for testing)

```bash
node run-crawler.js --slugs=pmmy,pmjdy,sui,pmay,pmksy
```

---

## 6. Start the full server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

The server will auto-initialise the DB schema on startup.

- Public API: `http://localhost:3000/api`
- Admin panel: `http://localhost:3000/admin`
- Health check: `http://localhost:3000/health`

---

## How it works

```
run-crawler.js
    └── SchemesCrawler.crawl()
            ├── discoverSlugs()        ← Puppeteer scrolls myscheme.gov.in/search
            │                            Falls back to hardcoded list if it fails
            └── fetchAndSaveScheme()   ← For each slug:
                    ├── GET /schemes/v6/public/schemes?slug=X&lang=en
                    ├── normalizeScheme()   ← Maps API response → DB columns
                    └── saveScheme()        ← INSERT OR IGNORE into schemes table
```

---

## Tenders & Recruitments

The `TendersCrawler` (eProcure.gov.in) and `RecruitmentsCrawler` (ncs.gov.in)
are stubs — their sources are set to `is_active=0` in the DB.

To activate them once you've mapped the HTML selectors:
```sql
UPDATE sources SET is_active = 1 WHERE name = 'eProcure.gov.in';
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `MYSCHEME_API_BASE is not set` | Copy `.env.example` to `.env` |
| `Failed to create crawler job — no lastID` | DB not initialised — run `npm run crawl:dry` first to force init |
| Puppeteer fails to launch | Install missing libs: `apt-get install -y libgbm-dev` (Linux) |
| API returns 401/403 | The API key may have rotated. Check myscheme.gov.in network tab for the new key |
| Schemes saved as `status='pending'` | This is correct — go to the admin panel to approve them |
