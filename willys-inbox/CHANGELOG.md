# Changelog

## 0.2.8

- Fix "Standard" toggle in Varor: staples arrive as an array in the state
  payload and the panel derived keys with Object.keys() (indexes) - the
  button never reflected or removed staple state

## 0.2.7

- New Komponering setting: "Lägg rea-varor direkt på inköpslistan" -
  when enabled, watchlist deal hits are composed straight onto the list
  (in aisle order) instead of arriving as suggestions
- Empty-compose guidance now points out deals that matched and the
  new setting

## 0.2.6

- Reor: sort by store walk order (Gångordning), Rabatt %, Sparar kr or
  lowest price; filter by aisle, Willys-plus-only, and free-text search;
  pagination respects the filters

## 0.2.5

- Fix misleading write-error toast: when a compose produced only
  suggestions (e.g. rea-hits), the panel wrongly claimed a write failure.
  Deal suggestions are suggestions by design - approve them under Förslag.

## 0.2.4

- Shopping list entity picker in the panel (Inställningar → Inköpslista):
  lists the to-do entities that actually exist in your HA and saves the
  choice without a restart (override stored in /data; the todo_entity
  option still works as fallback)
- Compose verifies the target entity exists before writing; if it doesn't,
  the error names the entities that DO exist, and the panel toast shows them
- Fix: validation of the picked entity was skipped (un-awaited promise)

## 0.2.3

- Compose is honest about what happened: response and toasts now show
  per-source counts (staples/due/deals), whether items were actually added
  to the to-do entity, and guidance when there was nothing to add
- New option `todo_entity` (default `todo.shopping_list`) if your shopping
  list to-do entity is named differently
- Diagnostics shows the configured to-do entity

## 0.2.2

- **Brand-aware search**: multi-word queries like "mjölk skånemejeri" now
  probe each token as a brand (via manufacturer match) and rank that brand's
  products first, with the other search words prioritized in the brand pass
- **Search pagination**: server returns page/pages/total; panel shows
  Föregående/Nästa with "Sida X av Y · N träffar"
- **Reor pagination**: page through all current campaigns (25 per page),
  not just the top 25

## 0.2.1

- Fix removing watchlist entries (and item/staple edits) for keys with
  spaces/special characters: route params are now URL-decoded and
  normalized server-side
- "Bevaka" is a text button with active state everywhere (no emoji), and
  removal from Varor asks for confirmation
- Unified UI: Varor rows are cards like every other tab; consistent
  buttons/toggles across tabs
- Multi-provider AI: OpenCode Zen, OpenAI, Anthropic (native API),
  Google Gemini, OpenRouter, or any OpenAI-compatible server; provider
  presets fill base URL and default model

## 0.2.0

- **Willys theme**: white + Willys red as base colors, light/dark mode, and
  user-adjustable accent/background colors (saved per browser)
- **Product grids** for Reor and Sök: responsive image cards, max 5 columns,
  capped at 25 items (5x5)
- **Live search** with 300 ms debounce and cancellation of stale requests
- **AI integration (OpenCode Zen, OpenAI-compatible)** configured in the panel:
  - Natural language add: "2 liter mjölk och bröd" -> items on the list
  - Smart check-off matching: when a shopping-list line doesn't match a known
    item, the AI maps it to the right registry entry (cached), improving the
    habit learner
  - Default model gpt-5.4-nano; test-connection button; key stored in /data

## 0.1.9

- Fix WebKit "The string did not match the expected pattern": the Ingress
  document URL ends with "//" (ingress_entry joined onto the token path),
  which breaks relative URL resolution. The panel now collapses duplicate
  slashes, builds absolute API URLs from origin + clean path, and
  normalizes the visible URL on load.

## 0.1.8

- Panel API calls now use plain relative URLs (same resolution as the asset
  references that already worked) - fixes WebKit rejecting the
  pathname-derived API base ("The string did not match the expected pattern")
- Panel errors now include the document path for easier diagnosis

## 0.1.7

- Panel rewritten in TypeScript (typed API contracts, strict tsc in build)
- Items list now derives purchase counts from the predictions payload

## 0.1.6

- Fix panel API calls under Ingress: fetches were root-relative and hit Home
  Assistant's own API (404); the panel now derives its API base from the
  ingress URL automatically

## 0.1.5

- Fix panel "bad request": replace strict URL parsing with defensive string routing (no request can fail parsing anymore); offending requests are logged
- Fix false "core API not usable": health check now uses /core/api/config (GET /api without trailing slash is not an HA route)

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
