import type { AppConfig } from "../config.js";
import { fetchWithTimeout } from "../util.js";
import { log } from "../log.js";

const LOG = log.child("supervisor");

export interface SensorUpdate {
  state: string | number | boolean | null;
  attributes?: Record<string, unknown>;
  icon?: string;
  unit?: string;
}

/**
 * Supervisor API bridge. Uses the SUPERVISOR_TOKEN that HAOS injects into
 * every add-on container. Endpoints used:
 *   POST /core/api/states/{entity_id}   - push sensor states
 *   POST /core/api/services/{domain}    - call services (todo, notify, ...)
 *   GET  /core/api                      - connectivity check
 */
export class SupervisorBridge {
  constructor(private cfg: AppConfig) {}

  get token(): string {
    return this.cfg.supervisorToken;
  }

  urlFor(path: string): string {
    return `${this.cfg.supervisorUrl}${path}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.cfg.supervisorToken}`,
      "Content-Type": "application/json",
    };
  }

  private url(path: string): string {
    return this.urlFor(path);
  }

  async coreApiAvailable(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(this.url("/core/api"), {
        headers: this.headers(),
      }, 5000);
      return res.ok;
    } catch {
      return false;
    }
  }

  async setState(entityId: string, update: SensorUpdate): Promise<void> {
    try {
      const res = await fetchWithTimeout(
        this.url(`/core/api/states/${entityId}`),
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            state: update.state,
            attributes: { friendly_name: makeFriendly(entityId), ...(update.icon ? { icon: update.icon } : {}), ...(update.unit ? { unit_of_measurement: update.unit } : {}), ...update.attributes },
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        LOG.warn(`setState ${entityId} -> ${res.status} ${body.slice(0, 120)}`);
      }
    } catch (e) {
      LOG.warn(`setState ${entityId} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async callService(domainService: string, payload: Record<string, unknown>): Promise<boolean> {
    const dot = domainService.indexOf(".");
    if (dot <= 0) {
      LOG.warn(`service "${domainService}" must be in domain.service form`);
      return false;
    }
    const domain = domainService.slice(0, dot);
    const service = domainService.slice(dot + 1);
    try {
      const res = await fetchWithTimeout(this.url(`/core/api/services/${domain}/${service}`), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        LOG.warn(`service ${domainService} -> ${res.status} ${t.slice(0, 120)}`);
        return false;
      }
      return true;
    } catch (e) {
      LOG.warn(`service ${domainService} failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  /** Fire a persistent notification (always visible in HA sidebar). */
  async notifyPersistent(title: string, message: string): Promise<void> {
    await this.callService("persistent_notification.create", {
      title,
      message,
      notification_id: "willys_inbox",
    });
  }

  /** Send to a notify.* service (mobile). data.actions appear as notification buttons. */
  async notify(title: string, message: string, actions?: Array<{ action: string; title: string }>): Promise<void> {
    const service = this.cfg.notifyService || "persistent_notification";
    if (service === "persistent_notification" || !service) {
      await this.notifyPersistent(title, message);
      return;
    }
    await this.callService(service, {
      title,
      message,
      data: {
        push: { sound: { name: "default", critical: 0 } },
        ...(actions ? { actions } : {}),
      },
    });
  }
}

function makeFriendly(entityId: string): string {
  const base = entityId.split(".")[1] ?? entityId;
  return base
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
    .replace("Willys", "Willys");
}
