# Changelog

## 0.1.4

- **Fix missing SUPERVISOR_TOKEN**: the base image's s6-overlay starts the CMD with a scrubbed environment; run.sh now imports `/run/s6/container_environment` explicitly
- Drop bashio from run.sh (was failing API probes at library init before the env import could happen)

## 0.1.3

- Detect Willys guest sessions (rejected credentials) with a clear error instead of "logged in as anonymous"
- Normalize personnummer (strip dashes/spaces) before login
- New panel Diagnostics card (Inställningar → Diagnostik): shows token presence, Supervisor ping, and the app's API permissions (`/api/debug`)

## 0.1.2

- Diagnose missing API permissions: boot log shows SUPERVISOR_TOKEN presence, sensors/services skip instead of spamming 401s
- Token fallback to HASSIO_TOKEN, guard all Supervisor calls when no token
- Fix panel crash on malformed request URLs (400 instead of stack trace)

## 0.1.1

- Fix startup failure (`s6-overlay-suexec: fatal: can only run as pid 1`): set `init: false` — the HA base image ships s6-overlay v3 which must run as PID 1

## 0.1.0

- Initial release
- Willys campaigns watcher -> `sensor.willys_deals` / `sensor.willys_watchlist`
- Ordered shopping-list composer (staples + predictions + deal hits, aisle walk order)
- Habit learning with suggestion notifications (add / not-now / never)
- Ingress web panel: catalog search, item registry, aisle order, staples, watchlist, deals, settings
