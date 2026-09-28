import type { SupervisorBridge } from "./supervisor.js";
import type { ShoppingListClient } from "./shoppinglist.js";
import type { TodoItemLite } from "../engine/composer.js";
import { normalizeItem } from "../util.js";
import { log } from "../log.js";

const LOG = log.child("events");

export interface DecisionInput {
  suggestionId: string;
  choice: "add" | "pass" | "never";
}

export type CommandInput = { cmd: "compose" } | { cmd: "refresh" } | { cmd: string };

/**
 * Bridges HA state into the add-on without websocket dependency:
 *  - polls the shopping list entity to detect completed items (purchases)
 *  - polls input_text.willys_decision helper that automations write
 *    notification-action decisions into
 *  - polls input_text.willys_command helper for compose/refresh commands
 */
export class HaEventsBridge {
  private lastTodoSnapshot = new Map<string, TodoItemLite>();
  private lastDecisionState = "";
  private lastCommandState = "";
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private supervisor: SupervisorBridge,
    private shoppingList: ShoppingListClient,
    private cfg: { todoEntity: string; decisionEntity: string; commandEntity: string; pollSeconds: number },
  ) {}

  private primed = false;

  start(
    onPurchase: (key: string, name: string) => void,
    onDecision: (d: DecisionInput) => void,
    onCommand: (c: CommandInput) => void,
  ): void {
    const tick = async () => {
      try {
        if (!this.primed) {
          // input_text values persist across restarts: prime with current
          // state so we never replay a stale persisted decision/command.
          this.lastDecisionState = (await this.getState(this.cfg.decisionEntity)) ?? "";
          this.lastCommandState = (await this.getState(this.cfg.commandEntity)) ?? "";
          this.primed = true;
        }
        await this.pollTodos(onPurchase);
        await this.pollEntity(this.cfg.decisionEntity, (v) => {
          this.lastDecisionState = v;
          try {
            const parsed = JSON.parse(v) as { id?: string; choice?: string };
            if (!parsed.id || !parsed.choice) return;
            const choice = parsed.choice as DecisionInput["choice"];
            if (!["add", "pass", "never"].includes(choice)) return;
            LOG.info(`decision: ${parsed.id} -> ${choice}`);
            onDecision({ suggestionId: parsed.id, choice });
          } catch {
            /* not JSON; ignore */
          }
        }, () => this.lastDecisionState);
        await this.pollEntity(this.cfg.commandEntity, (v) => {
          this.lastCommandState = v;
          try {
            const parsed = JSON.parse(v) as { cmd?: string };
            if (!parsed.cmd) return;
            LOG.info(`command: ${parsed.cmd}`);
            onCommand(parsed as CommandInput);
          } catch {
            /* ignore */
          }
        }, () => this.lastCommandState);      } catch (e) {
        LOG.warn(`poll failed: ${e instanceof Error ? e.message : e}`);
      }
    };
    this.timer = setInterval(() => void tick(), this.cfg.pollSeconds * 1000);
    void tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async pollEntity(
    entityId: string,
    onChange: (value: string) => void,
    lastValue: () => string,
  ): Promise<void> {
    const raw = await this.getState(entityId);
    if (!raw || raw === lastValue()) return;
    onChange(raw);
  }

  private async pollTodos(onPurchase: (key: string, name: string) => void): Promise<void> {
    const items = await this.shoppingList.getItems(this.cfg.todoEntity);
    const current = new Map(items.map((i) => [i.uid ?? normalizeItem(i.summary), i]));
    for (const [uid, item] of current) {
      const prev = this.lastTodoSnapshot.get(uid);
      const justCompleted =
        item.status === "completed" && prev && prev.status === "needs_action";
      if (justCompleted) {
        LOG.info(`todo completed: ${item.summary}`);
        onPurchase(item.summary, item.summary);
      }
    }
    this.lastTodoSnapshot = current;
  }

  private async getState(entityId: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.supervisor.urlFor(`/core/api/states/${entityId}`)}`, {
        headers: { Authorization: `Bearer ${this.supervisor.token}` },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { state?: string };
      return data.state ?? null;
    } catch {
      return null;
    }
  }
}
