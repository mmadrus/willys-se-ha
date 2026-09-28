# Changelog

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
