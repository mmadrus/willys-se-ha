# Willys Inbox

Shopping-list assistant for [Willys](https://www.willys.se) with deal watching, ordered shopping lists and habit learning.

## What it does

- **Deal watcher** – fetches current Willys campaigns (via the store's own API) and publishes them as sensors (`sensor.willys_deals`, `sensor.willys_watchlist`).
- **Ordered shopping list** – a panel where you manage "always buy" staples, assign items to supermarket aisles and define your walk order. "Skapa inköpslista" composes staples + predicted items + deal hits and adds them to the HA shopping list (`todo.shopping_list`) **in aisle-walk order**.
- **Habit learning** – every time you check off an item on the shopping list, the add-on records a purchase. It learns each item's cadence (median interval, regularity → confidence) and suggests replenishment ("Mjölk behövs imorgon") via actionable notifications. Approve / not-now / never — all feedback retrains the model.
- **Web panel (Ingress)** – search the Willys catalog to add the correct product immediately, administrate staples, watchlist (cheapest-price tracking), aisle order, per-item suggestion mode, and current deals.

## Installation (local add-on)

1. Copy this repository to your Home Assistant host (or add it as a custom repository if you keep it on GitHub):
   - **Local folder**: place the repo in `/addons/ha_willys` (or add the repo URL under Settings → Add-ons → Add-on Store → ⋮ → Repositories).
2. In the Add-on Store, refresh, find **Willys Inbox**, and install.
3. Configure your Willys credentials (Options):
   - `username` – your personnummer
   - `password` – your Willys password
   - `store_id` – *(optional)* store ID; leave empty to use your account's home store. Use the panel's **Inställningar** tab to look up IDs.
4. Copy [`homeassistant/packages/willys.yaml`](../homeassistant/packages/willys.yaml) into your HA `packages/` folder (see header of that file) – it adds the hidden helpers, the notification-action automation and compose/refresh scripts.
5. Set `notify_service` in the add-on options to your mobile notify service (e.g. `notify.mobile_app_your_phone`) to get actionable suggestion notifications.
6. Start the add-on and open the **Willys** panel in the sidebar.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `username` | – | Willys login (personnummer) |
| `password` | – | Willys password |
| `store_id` | *(home store)* | Store ID to shop in |
| `timezone` | `Europe/Stockholm` | Used for scheduling |
| `auto_add_mode` | `suggest` | `suggest` (notifications) / `auto` / `off` |
| `auto_add_confidence` | `0.75` | Confidence needed for auto-add in `auto` mode |
| `notification_lead_days` | `1` | How many days before the predicted purchase day to suggest |
| `compose_hour` | `15` | Local hour for the scheduled compose run |
| `compose_lead_days` | `2` | (reserved) lead window for scheduled compose |
| `compose_day_of_week` | `6` (Sat) | Day for scheduled compose (`0`=Sun). Empty = every day |
| `deals_refresh_minutes` | `240` | Campaign refresh interval (min 60) |
| `notify_service` | – | e.g. `notify.mobile_app_pixel_9`; empty = persistent notifications only |
| `digest_threshold` | `3` | ≤ this many suggestions → one actionable notification per item |
| `deals_watchlist` | `[]` | Item keys to track for cheapest price (managed via panel) |

## Sensors

- `sensor.willys_deals` – top campaign discounts (state: best %-off; attributes: items list)
- `sensor.willys_watchlist` – cheapest current price for watched items
- `sensor.willys_predictions` – items due soon (attributes: due days, cadence, confidence)
- `sensor.willys_inbox_status` – add-on status, last compose, pending suggestions

## How learning works

Each check-off on `todo.shopping_list` is recorded as a purchase for the matching item. The predictor uses the median interval between purchase days, penalizes irregularity (robust MAD-based spread) and dismissals, and opens a suggestion window `notification_lead_days` before the expected day (closes 5 days after). Dismissing puts the item on a cooldown of max(3 days, 1.5×interval). You can set per-item mode to **Föreslå / Auto / Aldrig** in the panel; `auto` mode in settings auto-adds any item above the confidence threshold. All events are also appended to `/data/events.jsonl` for inspection.

## HA-side helpers (from the package YAML)

- `input_text.willys_decision` – add-on polls this for notification-action decisions
- `input_text.willys_command` – set `{"cmd":"compose"}` / `{"cmd":"refresh"}` (the scripts `script.willys_compose` / `script.willys_refresh_deals` do this for you)
- `automation.willys_decision_from_notification` – wires companion-app notification buttons to decisions

## Troubleshooting

- **Login fails** – check personnummer (12 digits, no `-`) and password; Willys occasionally changes their login flow (the vendored client replicates their AES-encrypted login).
- **No deals** – check `sensor.willys_inbox_status` attributes (`last_error`); the add-on logs the campaign path used at startup. Campaign slugs change around holidays; the fallback browses the `erbjudanden` category.
- **Wrong store prices** – confirm the store with the panel's Inställningar tab; set `store_id` accordingly.
- **Logs** – add-on log shows `willys:`, `deals:`, `app:`, `events:` scopes. Set log level debug by restarting with `"WILLYS_DEBUG": "1"` in environment (advanced).

## Privacy

Your personnummer and password are stored in the add-on's options (`/data/options.json` on your own HAOS box) and are only sent to willys.se for login. No data leaves your instance except Willys API calls.

## Data files

- `/data/willys-state.json` – items, aisles, staples, stats, suggestions, deal cache
- `/data/events.jsonl` – append-only event log (purchases, decisions)

## Credits

Built on [willys-agent](https://github.com/ErikHellman/willys-agent) (MIT) by Erik Hellman – vendored and extended with store/campaign endpoints.
