# NQAS — Notebook Quality Assurance System

A complete, deployable website for standardized notebook verification across school campuses.
Roles: **Owner** (you), **Management** (cross-campus view), **Coordinator** (own campus only).

- Coordinators run verifications; the system writes the report (remarks, recommendations, final observation, principal summary).
- Every report is saved to a central database and is visible to Management from anywhere.
- Works on phone, tablet, and computer (one website, no app to install).

---

## What you need (all free to start)

1. A **GitHub** account — github.com
2. A **Supabase** account — supabase.com (the database + login system)
3. A **Vercel** account — vercel.com (hosts the website)

All three have free tiers that cost **₹0** for a single-school pilot.

---

## Part A — Set up the database (Supabase)

1. Go to supabase.com → **New project**. Give it a name (e.g. `nqas`) and a strong database password. Pick the region closest to you. Wait ~2 minutes for it to build.
2. In the left menu open **SQL Editor** → **New query**.
3. Open the file `supabase/schema.sql` from this project, copy **all** of it, paste into the query box, and click **Run**. You should see “Success”. This creates the tables, the security rules, and the four campuses.
4. In the left menu open **Project Settings** (gear icon) → **API**. Keep this tab open — you'll copy three values in Part C:
   - **Project URL**
   - **anon public** key
   - **service_role** key (this one is secret — never share it)

> One optional tweak: Settings → **Authentication** → **Providers** → **Email** → turn **“Confirm email” OFF**. This lets you create login IDs that work immediately without email confirmation. (The app already auto-confirms, but turning this off avoids any friction.)

---

## Part B — Put the code on GitHub

Easiest way (no command line):
1. Create a new **empty** repository on GitHub called `nqas`.
2. On the repo page click **“uploading an existing file”**.
3. Drag in **all the files and folders** from this project (the whole `nqas` folder's contents — `src`, `supabase`, `package.json`, etc.). Commit.

(If you're comfortable with a terminal: `git init && git add . && git commit -m "NQAS" && git branch -M main && git remote add origin <your-repo-url> && git push -u origin main`.)

---

## Part C — Deploy the website (Vercel)

1. Go to vercel.com → **Add New… → Project** → **Import** your `nqas` GitHub repo.
2. Before clicking Deploy, open **Environment Variables** and add these five (copy the values from Supabase Part A step 4):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service_role key (secret) |
   | `NEXT_PUBLIC_ID_DOMAIN` | `nqas.local` |
   | `ANTHROPIC_API_KEY` | *(optional — see below; leave blank to skip)* |

3. Click **Deploy**. After ~1–2 minutes you'll get a live URL like `https://nqas-xxxx.vercel.app`. That's your website.

### Optional: AI-written summaries
The system works fully without AI (it uses a built-in narrative writer). If you want the **Final Observation** and **Principal Summary** paragraphs written by AI:
- Get an API key from console.anthropic.com and paste it into `ANTHROPIC_API_KEY` in Vercel → Settings → Environment Variables, then redeploy.
- If the key is missing or the AI call fails, the system automatically falls back to the built-in writer — it never breaks.

---

## Part D — First use

1. Open your live URL. The first visit shows **First-time setup** → create your **Owner** account (your name, a login ID like `abhi.owner`, and a password).
2. You're now signed in as Owner. Go to **Admin**:
   - **User IDs** → create a **Coordinator** ID for a campus, and a **Management** ID.
   - **Campuses** → add or rename campuses if needed.
3. Share each login ID + password with the right person.
4. A **Coordinator** signs in → **New Verification** → fills details, taps observations, generates. The report saves automatically.
5. **Management** (and you) see every report and the analytics on the **Dashboard**.

---

## How the roles are enforced

Security is enforced by the database itself (Postgres Row-Level Security), not just the screens:
- A **coordinator** can only read/insert reports for **their own campus**. Even if someone tampered with the browser, the database refuses cross-campus access.
- **Management** and **Owner** can read all reports.
- Only the **Owner** can create login IDs and campuses (done through a secure server-only key).

---

## For your school's in-house IT team (handover notes)

- **Stack:** Next.js 14 (App Router) + TypeScript + Supabase (Postgres, Auth, RLS). No other services.
- **The engine** (`src/lib/engine.ts`) and **observation library** (`src/lib/observations.ts`) are pure, framework-free TypeScript — the actual product IP, fully unit-testable in isolation.
- **Data model:** three tables — `campuses`, `profiles` (extends `auth.users`), `reports` (report stored as JSON). See `supabase/schema.sql`.
- **Auth model:** simple login IDs are mapped to Supabase Auth emails as `id@nqas.local`. Swap `NEXT_PUBLIC_ID_DOMAIN` or move to real emails if desired.
- **AI is optional and isolated** to `src/app/api/generate/route.ts`, server-side, with deterministic fallback.
- **To extend to new modules** (Lesson Plan Verification, Lab Audit, etc.): add a table + an engine file + a route group. The auth, roles, and campus boundary are already in place and reusable. Build each module standalone; generalize only when a second module reveals the shared shape.
- **Scaling:** the free tiers cover a pilot. Multi-campus heavy use is comfortably within Supabase/Vercel paid tiers (~₹1,600–2,000/month range). Nothing about the architecture needs to change to scale.

---

## Cost summary for your pitch

| | |
|---|---|
| Report time | 20–30 min → under 5 min |
| Pilot hosting cost | ₹0 / month |
| Standardization | identical format regardless of who prepares it |
| Archive | permanent, searchable, central |
| Management visibility | all campuses, anytime, anywhere |
