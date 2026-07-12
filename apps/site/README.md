# Running Signals Site

Next.js presentation layer for the Running Signals portfolio project.

## Experience

The interface is designed as an approachable analytical console: familiar navigation and controls
remain primary, while monospace metadata, explicit status output, and model lineage give technical
readers more detail to inspect. The site supports light and dark themes, keyboard navigation, a
`Cmd/Ctrl+K` page index, reduced-motion preferences, and a persisted kilometre/mile preference.
Route maps use complete ordered activity records, while selectable split tables remain analytical
aggregates at quarter, half, and full metric or imperial resolutions.

## Data Source

The site reads from Supabase `site_*` tables by default. Those tables are refreshed by
`scripts/sync_site_supabase.py` after dbt builds the Databricks gold models. Supabase publishes the
presentation-safe activity telemetry needed for route maps rather than every modeled FIT field.

Use `apps/site/.env.example` for site runtime variables. Local development defaults to the Supabase
CLI URL and anon key when env vars are not set:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IjEyNy4wLjAuMSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE5NTczNDU2MDB9.PnClt_KbNAZBeig826Dz3nQwRV71mAb9b3wOqXfHh8o
```

Optional values:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<override anon key>
SITE_DATA_REVALIDATE_SECONDS=300
SITE_DATA_SOURCE=databricks
```

Create `apps/site/.env.local` from the example only when overriding local defaults or configuring a
hosted deployment locally:

```bash
cp apps/site/.env.example apps/site/.env.local
```

`SITE_DATA_SOURCE=databricks` is a local debugging fallback only. Normal browsing should use
Supabase so page loads do not wait on Databricks SQL statement execution.

For local development, start Supabase with `supabase start`, apply migrations with
`supabase db reset`, and run `scripts/sync_site_supabase.py` after dbt succeeds. The sync script
defaults to the local Supabase CLI database at `127.0.0.1:54322`, so `SUPABASE_DB_URL` is only needed
for hosted Supabase and belongs in the root operational `.env`, not the site runtime env.

## Commands

```bash
pnpm dev
pnpm lint
pnpm test
pnpm build
```
