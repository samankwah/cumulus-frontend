# Admin pages (content management)

Forecasters edit the site's content at **`/admin`** without touching code. They can change:

- **Announcements**: banners above the map.
- **Site text**: the title, heading, and the About, disclaimer and contact lines.
- **Farm advisory**:
  - every sentence the advice can show
  - the crop list
  - the thresholds (planting rain, end of rains, heavy rain…)
  - the season calendar
  - the region and sector split
  - the panel labels

Saved changes reach the public site within about a minute, with no redeploy. Every save is kept in the section's **History** and can be restored.

## How it works

- Content is stored in a **Neon Postgres** database (free plan), one JSON document per section, in the `content_documents` table. Each save also writes a copy to `content_revisions`.
- The built-in defaults are in `lib/content/`:
  - `advisory-messages.ts`: every advisory sentence
  - `advisory-content.ts`: crops, thresholds, the calendar and labels
  - `site-content.ts`: page text
- The site uses a stored section only if it passes validation (`lib/content/documents.ts`). If the database is not set up, unreachable, slow (over 2.5 s) or holds an invalid section, the site uses the defaults for that section. **The public site never depends on the database being up.**
- Sign-in uses email and password, checked against the `users` table. Passwords are stored as bcrypt hashes.
  - The session is a signed cookie that lasts 12 hours, checked by `middleware.ts`.
  - After 5 wrong passwords the account is locked for 15 minutes.
  - Roles: **editor** can change content; **admin** can also manage users.

## One-time setup

1. **Database.**
   - In Vercel, open the frontend project and go to **Storage → Create Database → Neon → Free**, then connect it to the project. Vercel adds `DATABASE_URL` for Production, Preview and Development.
   - For local work, copy the same `DATABASE_URL` into `.env.local`. That file is git-ignored; never commit it.
2. **Session secret.**
   - Add `SESSION_SECRET` (a random string of at least 32 characters) in Vercel → Settings → Environment Variables, and in `.env.local`.
   - To generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   - Changing it later signs everyone out.
3. **Create the tables:** run `npm run db:migrate` (reads `DATABASE_URL` from `.env.local`).
4. **Create the first admin:** run `npm run admin:create -- --email name@meteo.gov.gh --name "Full Name"`. It prints a one-time password. Sign in at `/admin/login` and change it under **My account**.
5. **Redeploy** the frontend in Vercel so it picks up the new variables.

## Everyday tasks

| Task | Where |
| --- | --- |
| Add a forecaster | `/admin/users` → Add a person (admins only). Give them the password shown; they change it under My account. |
| Someone forgot their password | An admin opens `/admin/users` → New password. If **no admin** can sign in, run `npm run admin:create` with that admin's email, which resets their password. |
| Someone leaves | `/admin/users` → Switch off (or Delete). Their name stays in the History. |
| Undo a change | Open the section → History → Restore. Restoring is itself a new version, so it can be undone too. |
| Go back to the original wording | "Reset to defaults" in the save bar (whole section), or "Back to default" on one message. |
| A section shows "Needs fixing" | A stored version no longer passes validation, and the site is using its defaults. Open it, fix the highlighted fields and save, or restore an earlier version. |

## Changing the code later

- **New advisory sentence:** add it to `ADVISORY_MESSAGE_DEFAULTS` in `lib/content/advisory-messages.ts` and use it via `t("id", vars)` in `lib/subseasonal-advisory.ts`. It appears on the messages page on its own. Stored messages hold only the edited entries, so new ones need no data migration.
- **New editable field:** add it to the type and defaults in `lib/content/`, and to the matching zod schema in `lib/content/documents.ts`. Older stored documents without the field then fail validation and fall back to the defaults. To avoid that, make the schema field `.optional()` with a default, or tell editors to re-save the section.
- **Database schema changes:** edit `lib/db/schema.ts`, then run `npm run db:generate` (writes SQL to `drizzle/`, which you commit) and `npm run db:migrate`.

## Costs and limits

- **Neon free plan:** 0.5 GB of storage, which is plenty: content is a few hundred KB. It scales to zero when idle, so the first request after a quiet spell takes about a second longer. Free projects are not deleted for inactivity.
- **Vercel Hobby plan:** for personal, non-commercial use. Check with Vercel whether agency use needs the Pro plan.
