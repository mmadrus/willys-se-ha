# Willys Inbox – Home Assistant add-on

A Home Assistant add-on that watches [Willys](https://www.willys.se) deals, builds **ordered** shopping lists (in aisle-walk order) and **learns your buying habits** so it can suggest when to buy milk before you run out.

- Uses [willys-agent](https://github.com/ErikHellman/willys-agent) (vendored, MIT) for the Willys API
- Deal watcher → `sensor.willys_deals`, watchlist price tracking → `sensor.willys_watchlist`
- Habit learning from shopping-list check-offs → replenishment suggestions with actionable notifications
- Ingress web panel: catalog search, staples ("always buy"), aisle walk order, watchlist, deals, per-item auto/suggest/never
- No MQTT required – talks to HA through the Supervisor API

## Repo layout

```
willys-inbox/          the add-on
  config.yaml          add-on manifest
  Dockerfile           multi-stage build (all archs)
  app/                 Node/TS server + Preact panel (app/panel)
homeassistant/
  packages/willys.yaml drop-in HA package (helpers + automations)
```

## Quick start

1. Add this repo under Settings → Add-ons → Add-on Store → ⋮ → Repositories (or copy to `/addons`).
2. Install **Willys Inbox**, enter your Willys credentials (personnummer + password) in Options.
3. Copy `homeassistant/packages/willys.yaml` into your HA `packages/` directory.
4. Set `notify_service` in Options (e.g. `notify.mobile_app_phone`) and restart.
5. Open the **Willys** panel: search items, mark staples, set aisle order, hit **Skapa inköpslista**.

See [willys-inbox/DOCS.md](willys-inbox/DOCS.md) for full documentation.

## Development

```bash
cd willys-inbox/app
npm install
npm run typecheck && npm test      # server
cd panel && npm install && npm run build   # panel

# run server locally (dev mode, no HA)
WILLYS_OPTIONS=./dev-options.json WILLYS_DATA_DIR=./data npm run dev
```

`dev-options.json` example: `{"username":"","password":"","store_id":""}`
# willys-se-ha
