import { loadConfig } from "./config.js";
import { WillysApp } from "./app.js";
import { createServer } from "./api/server.js";
import { setLogLevel, log } from "./log.js";

const LOG = log.child("main");

async function main(): Promise<void> {
  if (process.env.WILLYS_DEBUG) setLogLevel("debug");
  const cfg = loadConfig();
  const app = new WillysApp(cfg);

  const server = createServer(app, cfg.ingressPort);
  await new Promise<void>((resolve) => server.listen(cfg.ingressPort, () => resolve()));
  LOG.info(`panel listening on :${cfg.ingressPort} (ingress)`);

  await app.boot();

  const bye = () => {
    LOG.info("shutting down");
    void app.shutdown().finally(() => process.exit(0));
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
}

main().catch((e) => {
  LOG.error(`fatal: ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
