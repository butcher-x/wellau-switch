# Wellau Switch Overlay

This repository keeps the CC Switch core in `cc-switch/` and layers Wellau
branding and extensions in `wellau/`.

## Directory Layout

- `cc-switch/`: upstream CC Switch core. Keep changes here small and explicit.
- `wellau/brand.ts`: Wellau product metadata used by the UI overlay.
- `wellau/extensions/`: extension interface and registry.
- `wellau/ui/`: Wellau-owned React panels.
- `wellau/tauri/tauri.wellau.conf.json`: Tauri config overlay for Wellau builds.

## Development Commands

Run commands from `cc-switch/`:

```bash
pnpm dev:wellau
pnpm build:wellau
```

The Wellau scripts set:

```bash
CC_SWITCH_APP_CONFIG_DIR_NAME=.wellau-switch
```

This keeps Wellau Switch data separate from the upstream `~/.cc-switch`
directory while reusing the same CC Switch database schema and services.

## Core Injection Points

The current Wellau overlay touches these CC Switch core files:

- `cc-switch/vite.config.ts`: adds the `@wellau` alias.
- `cc-switch/tsconfig.json`: includes `../wellau/**/*` and maps `@wellau/*`.
- `cc-switch/src/main.tsx`: uses Wellau brand storage keys and display paths.
- `cc-switch/src/App.tsx`: renders Wellau title and extension panels.
- `cc-switch/src-tauri/src/config.rs`: supports `CC_SWITCH_APP_CONFIG_DIR_NAME`.
- `cc-switch/package.json`: adds Wellau dev/build scripts.
- `cc-switch/src-tauri/src/wellau_auth.rs`: Wellau account login/logout backend
  module (new file; owns the session token, never exposed to the renderer).
- `cc-switch/src-tauri/src/lib.rs`: declares `mod wellau_auth;` and registers the
  `wellau_login` / `wellau_logout` / `wellau_get_session` / `wellau_refresh` /
  `wellau_list_keys` commands in `generate_handler!`.
- `cc-switch/src/main.tsx`: wraps `<App />` in `WellauAuthProvider`.

Avoid scattering Wellau-specific logic elsewhere in `cc-switch/`. Add new
features through `wellau/extensions/registry.ts` unless the feature truly needs
a new core hook.

## Account Login / Logout

Wellau Switch ships an account feature built on the extension system:

- Backend: `cc-switch/src-tauri/src/wellau_auth.rs` calls the Wellau API
  (`POST /api/v1/auth/login`, `GET /api/v1/keys`) via the shared reqwest client.
  Credentials (access/refresh token) are persisted to
  `~/.wellau-switch/auth.json` with `0600` permissions and never returned to the
  renderer. The renderer only receives a redacted `WellauSession`.
- Token lifecycle: each authenticated command refreshes the token in-place when
  it is within 60s of expiry (transparent to the frontend).
- Frontend: `wellau/auth/` holds the React context (`WellauAuthProvider`,
  `useWellauAuth`), the thin command wrapper (`api.ts`), and the key import logic
  (`importKeys.ts`). The account UI lives in `wellau/ui/WellauAccountPanel.tsx`
  and is registered as the `account` extension.
- Auto-import: after a successful login the provider automatically pulls active
  keys and upserts them as providers. Provider ids are derived from
  `sha256(key)[:12]` to match the `wellau-installer` CLI and stay idempotent.

## Adding A Wellau Feature

1. Create a panel in `wellau/ui/`.
2. Add an entry to `wellau/extensions/registry.ts`.
3. Keep provider/proxy/failover logic in the CC Switch core unless a new hook is
   required.

The extension registry is intentionally empty for now. Add Wellau-specific
features only when their product shape is clear.

## Upstream Sync Rules

When syncing a newer CC Switch core:

1. Update `cc-switch/` from upstream.
2. Reapply or verify the injection points listed above.
3. Keep `wellau/` untouched unless the extension API intentionally changes.
4. Run `pnpm typecheck` from `cc-switch/`.
5. Run `pnpm dev:wellau` to verify the Wellau shell still loads.

## Product Identity

Wellau Switch uses:

- Product name: `Wellau Switch`
- Bundle identifier: `com.wellau.switch`
- Deep link scheme: `wellauswitch`
- App config directory: `~/.wellau-switch`

The updater endpoint is intentionally empty in the Wellau Tauri overlay until a
Wellau release channel is available.
