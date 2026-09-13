# Turprep frontend

Vite, React, TypeScript, and Tailwind CSS client for Turprep. See the
[root README](../../README.md) for the full workspace setup, scripts, and
deployment notes.

## Running locally

Run the app from the repository root so the shared `@turprep/models` package is
built first:

```bash
npm install
npm run dev
```

Running `vite` directly inside this folder fails on a fresh checkout because
`packages/models/dist` does not exist yet.

## Configuration

Copy `.env.example` to `.env.local` and fill in the values. All `VITE_*`
variables are browser-visible; never put a Supabase `service_role` key or the
backend `GOOGLE_PLACES_API_KEY` here.

## Linting

```bash
npm run lint
```

The linter is [Oxlint](https://oxc.rs/docs/guide/usage/linter), configured in
`.oxlintrc.json`.
