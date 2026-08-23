# Turprep

Travel planning app built as a small npm workspace. The API is kept in its own Express application so it can be deployed independently later, while the Vite development server proxies API requests locally.

The production application is branded as **Turprep** and is intended to run at
`https://turprep.com`.

## Stack

- `apps/frontend`: Vite, React, TypeScript, and Tailwind CSS
- `apps/backend`: Express, TypeScript, Supabase API access, and backend tests
- `packages/models`: Shared Zod schemas and TypeScript model types
- `supabase/migrations`: Supabase database schema and row-level security policies
- Local API: `http://localhost:3001`
- Local frontend: `http://localhost:3000`

## Getting started

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Before starting the app, configure the frontend and backend environment files.
The frontend requires Supabase browser configuration, and the backend uses the
same project URL and publishable key to make requests in the authenticated
user's context.

```bash
copy apps\frontend\.env.example apps\frontend\.env.local
copy apps\backend\.env.example apps\backend\.env
```

Fill in the Supabase values, then open `http://localhost:3000`. The first
vertical slice supports Google and email/password login, private trip creation,
authenticated trip listing, trip settings, recoverable trip archiving, activities, and
generated days for each inclusive trip date. Trips, days, accommodation stays,
meals, and activities support editable notes; days can also have titles, and
non-empty notes appear in travel
mode. On desktop, the planner has All, Housing, and Meals tabs. Activities and
meals share one order and can be dragged between days; timed items are kept
before later timed items when a drop would otherwise place them too far down.
New activities and meals default to all-day. Trips may contain at most 60
inclusive calendar days. The frontend uses
`/trips/<trip-id>` URLs for
bookmarked and shareable trip plans; access remains protected by authentication
and Supabase row-level security.

To add activities or meals from Google Maps links, enable Places API (New) in
Google Cloud and set `GOOGLE_PLACES_API_KEY` in `apps/backend/.env`. Keep this
key backend-only; it must not be added to a `VITE_*` variable.

Apply all migrations in `supabase/migrations` to the Supabase project before
using trip persistence. Deleting a trip archives it by setting `deleted_at`;
the row and its related data remain in the database for a future admin restore
workflow. Archived trips are hidden from the normal user API.
Configure Google as an OAuth provider, enable the Email provider, and add
`http://localhost:3000` as a redirect URL in Supabase Authentication. Email
login uses the email address as the username. If email confirmation is enabled,
new users must confirm their address before signing in.

Shared models belong in `packages/models/src`. Define each model's Zod schema there and derive its TypeScript type from the schema. The backend and frontend both import the package, while database/ORM-specific mappings remain backend-owned.

## Scripts

| Command         | Purpose                           |
| --------------- | --------------------------------- |
| `npm run dev`   | Run frontend and backend together |
| `npm run build` | Build both workspaces             |
| `npm run lint`  | Lint the frontend                 |
| `npm test`      | Run the backend test suite        |
| `npm run start` | Start the built backend           |

## Configuration

- Copy `apps/backend/.env.example` to `apps/backend/.env`.
- Copy `apps/frontend/.env.example` to `apps/frontend/.env.local`.
- Set `VITE_APP_URL=https://turprep.com` in the production frontend environment
  to make OAuth redirects explicit. It defaults to the current browser origin
  when unset.
- `GOOGLE_PLACES_API_KEY` is required for resolving Google Maps activity links.
- `VITE_GOOGLE_MAPS_API_KEY` is the browser-visible, HTTP-referrer-restricted
  key used by the Google Maps JavaScript API. Keep `GOOGLE_PLACES_API_KEY`
  backend-only.
- `VITE_GOOGLE_MAPS_MAP_ID` is optional; configure a production map ID when
  using custom Google Maps styling. Local development falls back to
  `DEMO_MAP_ID`.
- `VITE_SUPABASE_PUBLISHABLE_KEY` is browser-visible configuration, not a
  service secret. Never expose a Supabase `service_role` key through `VITE_*`
  variables or frontend code.
- The backend currently uses the user's bearer token so Supabase RLS remains
  effective. Do not replace this with a privileged service-role client
  without explicitly designing the security boundary.
- Sharing email notifications use the `send-sharing-email` Supabase Edge
  Function. Configure `SHARING_EMAIL_FUNCTION_URL` and
  `SHARING_EMAIL_FUNCTION_SECRET` in the backend, and configure
  `RESEND_API_KEY`, `SHARING_EMAIL_FROM`, and the same function secret in the
  function environment. Never commit these values.
- Apply the trip-sharing migration before using invitations, access links, or
  Realtime trip updates.

## Production deployment

Configure the frontend deployment with the `turprep.com` custom domain and set
the backend environment values to the production frontend URL:

```env
CORS_ORIGIN=https://turprep.com
FRONTEND_APP_URL=https://turprep.com
```

Add `https://turprep.com` as the Supabase Site URL and OAuth redirect URL. Use a
verified Turprep sender domain for sharing email notifications before enabling
production email delivery.
