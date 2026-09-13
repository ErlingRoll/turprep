# Project review notes

Findings from a full read-through of the backend, frontend, shared models,
Supabase migrations, and the sharing email function. The first section lists
what was changed in this pass. The second section lists things that look
wrong or fragile but were **not** changed because the fix is a design call, a
database migration, or carries enough risk that it deserves a deliberate
decision. Each item gives the location, the problem, a proposed fix, and why
it was left alone.

Validation after the changes: `npm run build`, `npm run lint`, and
`npm test` all pass (88 backend tests).

## Changes made in this pass

Bugs fixed:

- Login screen swapped in a new Supabase client when the "remember me"
  preference differed from the stored one, but the app shell kept listening on
  the old client, so password sign-in never advanced past the login page.
  `lib/supabase.ts` now notifies subscribers on a client swap and `App.tsx`
  re-subscribes.
- Start-date pickers in `TripForm` and `TripSettings` passed the 60-day lower
  bound as `maxDate`, which disabled every date after `endDate - 59`.
  Changed to `minDate`.
- `TripSpreadsheetPage` used `spreadsheet.housingDateRangeInvalid`, which did
  not exist under that namespace; users saw the raw key. Added the key.
- Frontend error translation keyed on "Day item date…" while the backend sends
  "The day item date…"; also "The activity date…" and "Invalid Google Maps
  link" had no mapping. Fixed the table.
- `PATCH /api/trips/:tripId` only rejected date ranges that excluded
  activities; meals with a date outside the new range were silently orphaned.
  Meals are now checked too (new message and translations).
- Sharing routes awaited the notification email after the database write; a
  failing email turned an already-committed change into a 500 and invited
  duplicate retries. Email failures are now logged and the request succeeds.
- Backend error handler exposed internal error messages whenever `NODE_ENV`
  was not exactly `production`. It now only exposes them when `NODE_ENV` is
  `development` (fail closed).
- Housing overlap: the exclusion constraint from migration
  `20260808011000` raised an unhandled Postgres error (HTTP 500). The
  repository now maps `23P01` to `HousingOverlapError`, the routes return 409,
  and the frontend translates it.
- `DateOnlySchema` accepted non-existent dates such as `2026-02-30`. It now
  validates the calendar date.
- Travel mode listed backup meals as real meals and reset the selected day on
  every realtime refresh. Both fixed.
- `TripDetails` auto-filled end/start times by wrapping past midnight, producing
  an end before the start that the API rejects. Now clamps to the same day.
- `useTripRealtime` could apply an older `getTrip` response over a newer one
  and fire callbacks after unmount. Added a request-id guard and active flag.
- `useTripPresence` had an un-caught promise chain and could leak a channel
  created after teardown. Added a catch and an active-flag re-check.
- `SuggestionMediaGallery` never revoked its blob URLs. They are revoked on
  cleanup now.
- `saveItemGoogleMapsUrl` in the spreadsheet page cleared a saving flag it never
  set. It now sets it.
- `useTripDaySelection.onToggleDay` wrote cookies and called sibling setters
  inside a state updater (impure; double-invoked in StrictMode). Refactored.
- `DatePicker` derived DOM ids from the label, so two pickers with the same
  label collided. Uses `useId` now.
- `TripDashboard` ignored the `signOut` error result and used a stale `trips`
  array in delete. Both fixed.
- `google-places.ts`: `decodeURIComponent` on a malformed path segment threw a
  `URIError` (HTTP 500); the details cache was unbounded; no outbound fetch
  had a timeout; redirect bodies were never released; a `place_id:` query could
  be stored verbatim as the place name when the API failed; photo lists were
  not capped to the schema's max of 10. All addressed.
- Sharing email edge function: interpolated unescaped values into HTML,
  accepted non-POST methods, and threw on a malformed JSON body. Now escapes,
  validates (https action URL, email shape, length), and returns 4xx.

Cleanups:

- Removed unused imports (`TripMember` in `app.ts`,
  `UpdateHousingStayInputSchema`/`UpdateMealInputSchema` in the repository)
  and dead helpers (`formatLongDate`, `isValidTripDuration`,
  `hasValidTimedOrder`, the `MAX_TRIP_DAYS` re-export).
- `PUT` and `PATCH /api/trips/:tripId/currencies` were copy-pasted and had
  drifted; they share one handler now.
- Duplicated `FRONTEND_APP_URL` fallback in `app.ts` moved to a helper that
  also strips a trailing slash.
- `createTrip` and `updateTripDay` in `api.ts` now parse their input with the
  shared schema like every sibling function.
- `UpdateHousingStayInputSchema.name` no longer requires `min(1)`, so a stay
  created from a Google Maps link alone can be edited; the merged
  create-schema check in the route still enforces name-or-link.
- `SuggestionCatalogQuestion` type is exported; models package gets a
  `default` export condition.
- Sharing-link URL builder deduplicated and the "Copied" label resets after
  two seconds.
- `ToastProvider` context value memoised.
- `.gitignore` now ignores every `.env.*` (except `.env.example`) and
  `supabase/.temp/`; `.prettierignore` skips `supabase/.temp` and
  `*.tsbuildinfo`.
- `apps/frontend/README.md` replaced (it was the untouched Vite template).

## Not changed: needs a decision or a migration

### 1. Any trip member can take ownership of or soft-delete a trip (HIGH)

`supabase/migrations/20260806230000_initial_schema.sql`, policy
"Trip members can update trips":

```sql
create policy "Trip members can update trips"
  on public.trips for update
  using (public.can_access_trip(id))
  with check (public.can_access_trip(id));
```

`can_access_trip` looks the row up **by id in committed data**; it never
inspects the new row's `owner_id` or `deleted_at`. A member can run
`update trips set owner_id = auth.uid()` or `set deleted_at = now()` through
PostgREST with their own JWT (the browser holds a real Supabase client), and
the backend's `.eq("owner_id", userId)` guard is bypassed. Permissive policies
are OR-ed, so the stricter "Owners can archive trips" policy does not help.

Proposed migration (untested here):

```sql
create or replace function public.prevent_trip_owner_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from old.owner_id then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Only the owner can transfer a trip';
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'Only the owner can archive a trip';
    end if;
  end if;
  return new;
end;
$$;

create trigger trips_prevent_owner_changes
  before update on public.trips
  for each row execute function public.prevent_trip_owner_changes();
```

Left alone because it is a schema change that must be applied to the linked
project and tested against real RLS behaviour.

### 2. Access-request insert policy does not tie the invitation or link to the trip (MEDIUM)

`20260807110000_trip_sharing.sql`, policy "Authenticated users can create
access requests" only checks `requester_id` and email. The check constraint
requires *an* `invitation_id` or `access_link_id`, not one belonging to the
same `trip_id`. A user with a valid invitation to trip A can insert a pending
request for any trip B via PostgREST. Combined with `get_trip_owner_email`
(callable by any pending requester), this leaks the owner's email of any trip
whose id is known. The backend validates this correctly; only direct database
access is affected. Fix: extend the policy with an `exists` clause that joins
the referenced invitation/link on `trip_id` (and `status = 'pending'` /
`revoked_at is null`).

### 3. Housing stay dates are never validated against the trip range (MEDIUM)

`app.ts` POST/PATCH housing never call `isDateWithinTrip`, unlike meals,
activities, and day updates. `PATCH /api/trips/:tripId` also does not check
housing stays when narrowing the range (activities and, as of this pass,
meals are checked). The exact rule is a design call: is `checkOut` allowed to
be `endDate + 1` (checkout morning after the last night)? Decide the bound,
then add the check to both housing routes and the trip update route.

### 4. Three empty files are committed

`apps/backend/src/housing-validation.ts`,
`apps/backend/src/housing-validation.test.ts`, and
`apps/frontend/src/features/trips/HousingCoverageLane.tsx` are 0 bytes and
unreferenced (the test runner reports the empty test file as passing). They
were committed alongside the housing-overlap migration and look like a
half-finished feature. Delete them, or implement the intended validation. Not
deleted here because file deletion was blocked by the session's permission
policy.

### 5. `supabase/.temp/` was tracked in git (handled, please review)

Eight local Supabase CLI scratch files (project ref, pooler URL with host and
role name, service version pins) were versioned. `.gitignore` now excludes the
directory and `git rm -r --cached supabase/.temp` has been run, so the
deletions are staged in the index while the files remain on disk. Commit the
staged removal when convenient. The values are already in git history; rotate
nothing, but be aware they remain visible in past commits.

### 6. Migration `20260808011000_prevent_planned_housing_overlap.sql` is not `NOT VALID`

If any existing trip already has overlapping planned stays, the migration
aborts. If it has already been applied to production this is moot; otherwise
add the constraint `NOT VALID` and validate after cleanup.

### 7. Reorder writes are non-atomic and leave `is_backup` inconsistent

`trip-repository.ts` `reorderActivities` and `reorderDayItems` issue one
`UPDATE` per row in `Promise.all`; a mid-way failure leaves a half-applied
order and returns 500. They set `trip_date` but never touch `is_backup`, so an
item dragged from backup onto a day keeps `is_backup = true` in the database
(`getTrip` classifies it as backup via `isBackup || !tripDate`). Also, the
timed-order guard in `app.ts` (`hasValidTimedDayItemOrder`) only inspects items
present in the request, so a partial reorder can pass while the resulting day
is out of order. Suggested: move both reorders into a single `security
invoker` RPC that also writes `is_backup = (trip_date is null)`, and merge the
day's unsubmitted items into the guard. Needs verification against the
frontend drag flow, which may issue a separate PATCH.

### 8. Dead route `PATCH /api/trips/:tripId/activities/reorder`

The frontend only calls `reorderDayItems`; `reorderActivities` in
`api.ts` has no callers. The activities route also lacks the timed-order check
the day-items route has, so it is a laxer second path to the same mutation.
Remove the route, repository method, and frontend helper if nothing external
uses it.

### 9. Preference clear on a nonexistent item returns 200

`PUT /api/trips/:tripId/preferences` with `value: null` returns `200 null`
even when the item does not exist, because the repository returns `null` for
both "not found" and "nothing to delete". Return a discriminated result from
the repository, or check item existence before branching.

### 10. Access request from a user with no email is reported as invalid input

`POST /api/trips/:tripId/sharing/access-requests` folds "user has no email"
into the 400 "Invalid access request data". Consider a distinct 403 message so
the user understands it is an account condition, plus a translation.

### 11. Google-resolved place data can exceed schema limits and 500

Place names over 200 chars or addresses over 500 chars from Google are
spliced into the create input after validation; the repository's schema parse
then throws a `ZodError` (HTTP 500). Truncate `place.name` / `place.address`
at the enrichment site, or re-validate and return 400. Related: housing `name`
falls back to `place.name`; if that is empty the DB `NOT NULL`/length check
fails with a 500.

### 12. A denied access request is permanent

`requestTripAccess` returns "denied" forever once a request was denied, even
if the owner later sends a fresh invitation. The schema's partial unique index
already allows a new pending row. Decide whether re-requesting should be
allowed (e.g. when a new pending invitation matches).

### 13. Edge function deployment and secret comparison

There is no `supabase/config.toml`, so `send-sharing-email` deploys with
`verify_jwt = true` by default and the shared-secret bearer would be rejected
at the gateway unless deployed with `--no-verify-jwt`. Add a `config.toml`
with `[functions.send-sharing-email] verify_jwt = false` and consider a custom
header for the secret. The `!==` string compare is also not constant-time.

### 14. Social preview and icons

`index.html` points `og:image`/`twitter:image` at an SVG, which most link
previewers reject, and there is no `apple-touch-icon` PNG. Render a 1200x630
PNG and 180/192/512 PNG icons.

### 15. `TripSettings` resets the form on every realtime refresh

The reset effect depends on `[trip]`, and `trip` is a new object on every
realtime update or currency/visibility save, so typed edits are wiped and
`canManageSharing` flips to `false` until sharing reloads. Keying on
`trip.id` (and not resetting `canManageSharing`) is the obvious fix but
changes when remote edits are reflected in the form. `TravelMode` had the
same pattern and was fixed because the change there was unambiguous.

### 16. Optimistic updates reconcile against a stale `trip`

`TripDetails` (preference updates, marker/day-item/housing detail saves) and
`TripBackupPage` spread the render-time `trip` after an `await`, so anything
that changed meanwhile (realtime, concurrent drag) is reverted.
`TripSpreadsheetPage` already uses a `latestTripRef` pattern; apply it in the
other two.

### 17. Bulk time edit partial failure

`TripSpreadsheetPage` and `TripBackupPage` send one PATCH per row with
`Promise.all`; on any failure they roll the client back to the pre-edit
snapshot without refetching, so client and server diverge. Refetch on error as
`queueSpreadsheetReorder` does.

### 18. `TripMap` rebuilds the whole map on language change

The init effect depends on `[t]`, which changes identity on language switch.
Put `t` in a ref like the other props and use `[]`.

### 19. Suggestion pin click branches may be swapped

`TripMapPage.handleSuggestionMapClick` clears the stored session when
dropping the *first* pin and keeps answers when *moving* an existing pin.
This might be intentional (re-search with the same answers at a new spot);
confirm with the product intent.

### 20. Suggestion helper effect overrides the current question

The effect that picks a question when `answers.length === 0` re-runs after a
skip (`recentQuestionIds` changes) and on mount with a restored session,
replacing the question that was just chosen. Guarding on
`currentQuestionId === null` is the likely fix but the reset flows should be
checked.

### 21. Smaller frontend items

- `DayItemList` compares a filtered-list index against an unfiltered-list
  index for the drop indicator; only correct on the "All" tab.
- `TripMap` matches the selected marker by `id` only while every other place
  uses `${type}:${id}`, and keeps the stale marker object.
- `TripMapPage` never passes `onFocusMarkerHandled`, so the `?focus=` param
  re-pans on every map re-init.
- Cross-day move in `spreadsheet-reorder.ts` nulls times but leaves
  `allDay: false`.
- `TripDetails`, `TravelMode`, `TripDayNavigator` dereference
  `selectedDay.date` without the optional chaining used elsewhere (zero-day
  trips only).
- `TripDetails` reimplements `moveItemToBackupInTrip` from `trip-state.ts`
  and can append a duplicate on re-entry.
- Desktop and mobile `TripAuxiliaryDetails` instances both handle
  `mapHousingAction`.
- Google Maps marker listeners are never explicitly cleared and all markers
  are recreated on every `markers` identity change.
- `localStorage` is accessed unguarded in `lib/brand.ts`, `lib/supabase.ts`,
  `ThemeProvider`, and `TripDashboard`; a hardened browser profile throws and
  the app fails to mount. A try/catch storage helper would fix all six sites.
- `lib/config.ts` throws at module load on a missing `VITE_*` variable, which
  renders a blank page rather than the app's error screen.
- `api.ts` interpolates path params without `encodeURIComponent` (all are
  UUIDs/ISO dates today).

### 22. Suggestion scoring quirks in `google-places.ts`

- Empty keywords (`weather-any`, `moderate`, `diet-any`) produce a query
  identical to the base query; the fetch is cached but the scoring loop counts
  it twice, inflating scores. `return [...new Set(queries)]` in
  `buildSuggestionQueries` fixes it, but it changes ranking.
- `matchOptionIds` is the last three answers for every suggestion regardless
  of which query surfaced it; the loop already knows the query index.
- The comment "index 0 = oldest answer" is wrong; index 0 is the base query.

### 23. Upstream failure status codes and photo buffering

When Google returns 5xx, `requestGooglePlaces` throws with the default 400
("your link is bad") while the adjacent network/JSON branches use 503. The
photo proxy buffers the whole response with no size cap. Both are small
changes but alter API behaviour.

### 24. Database constraints that disagree with the shared models

- `trips.accepted_currencies` check allows `''`, `'A'`, duplicates; the model
  requires unique 3-letter codes. Rows written outside the backend would
  break `tripRowSchema.parse` on read.
- `activities`/`housing_stays.google_maps_url` require `https://` in the DB
  while the Zod schemas accept any URL; `meals` has no such constraint at all.
- `housing_stays.name` is `NOT NULL` with length 1..200 while the create
  schema defaults it to `""` (see item 11).

### 25. Other RLS observations

- `deleted_at` is not checked in the `trip_members` self-select branch, the
  invitee invitation select, or the requester access-request select, so
  soft-deleted trip ids and member emails remain visible.
- Every member can read every other member's email; confirm this is intended.
- No path exists to restore a soft-deleted trip (both helper functions require
  `deleted_at is null`), and orphaned rows are never purged.
- `trip_invitations`, `trip_access_links`, `trip_access_requests`, and
  `trip_visibility_settings` have no DELETE policy; `trip_members` has no
  UPDATE policy (member `name` is immutable).
- Several FK columns used in cascades and policy predicates are unindexed
  (`trip_item_preferences.{activity_id,meal_id,housing_stay_id,user_id}`,
  `trip_access_requests.{requester_id,invitation_id,access_link_id}`, etc.).

### 26. Repository and tooling

- `netlify.toml` has no `[build]` section; the build command and publish
  directory live only in the Netlify dashboard.
- TypeScript is `~6.0.2` in the frontend and `^5.9.2` in backend/models.
  Aligning (ideally hoisted to the root) avoids two compiler majors.
- `npm run lint` covers only the frontend; backend and models have no linter.
  There is no automated check that `t("…")` keys exist, which is how the
  namespace bug above slipped in.
- `npm run format:check` fails on Windows for every file because
  `.prettierrc.json` sets `endOfLine: "lf"` while `core.autocrlf=true` checks
  files out as CRLF. Either add a `.gitattributes` with `* text=auto eol=lf`
  or set `endOfLine: "auto"`.
- 31 i18n keys are defined but never referenced (e.g. `common.deleting`,
  `travelMode.{ended,starts,subtitle}`, `tripModes.spreadsheet`, several
  `spreadsheet.*` and `tripDetails.*` entries). Safe to delete after the
  namespace fix above.
- 31 exports from `@turprep/models` are unused outside the package
  (`SuggestionQuestionCatalogSchema` is fully dead). Harmless as public API
  surface; prune if you want a tighter contract.
