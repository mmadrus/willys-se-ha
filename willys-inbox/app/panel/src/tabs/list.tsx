import { useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { AppStateData, TodoItem } from "@/types";
import type { Notify } from "@/hooks";

function sortedAisles(state: AppStateData) {
  return [...state.aisles].sort((a, b) => a.order - b.order);
}

export function ListTab({
  state,
  reload,
  notify,
}: {
  state: AppStateData;
  reload: () => void;
  notify: Notify;
}) {
  const todos: TodoItem[] = state.list ?? [];
  const [nlText, setNlText] = useState("");
  const [nlBusy, setNlBusy] = useState(false);
  const [lastCompose, setLastCompose] = useState<
    null | { kind: "empty" | "write-error" | "suggestions" | "ok"; msg: string }
  >(null);

  const groups = new Map<string, TodoItem[]>();
  for (const t of todos) {
    if (t.status !== "needs_action") continue;
    const norm = (t.summary ?? "").toLowerCase();
    const item = state.items.find(
      (i) => norm.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(norm),
    );
    const aisle = item ? item.aisle : "andra";
    const arr = groups.get(aisle) ?? [];
    arr.push(t);
    groups.set(aisle, arr);
  }

  const compose = async (): Promise<void> => {
    notify("Komponerar …");
    const res = await api.compose(true);
    if (res.composed === 0 && res.suggested === 0) {
      const s = res.sources;
      setLastCompose({
        kind: "empty",
        msg:
          `Inget att lägga till (standardvaror: ${s.staples}, förfallna: ${s.due}, reor: ${s.deals}). ` +
          (s.staples === 0
            ? "Markera standardvaror i Sök- eller Varor-fliken först."
            : "Modellen lär sig efter några inköp."),
      });
      reload();
      return;
    }
    if (res.composed === 0) {
      setLastCompose({
        kind: "suggestions",
        msg: `${res.suggested} förslag väntar på ditt svar nedan (förslag läggs aldrig till automatiskt).`,
      });
      reload();
      return;
    }
    if (res.added === 0) {
      const avail = res.availableEntities?.map((t) => t.entity_id).join(", ");
      setLastCompose({
        kind: "write-error",
        msg:
          `Kunde inte skriva till ${res.todoEntity}` +
          (avail
            ? ` – befintliga listor: ${avail}. Välj en under Inställningar.`
            : " – kontrollera entiteten (se Diagnostik)."),
      });
      reload();
      return;
    }
    setLastCompose(null);
    notify(`La till ${res.added} varor på ${res.todoEntity}${res.suggested ? `, ${res.suggested} förslag` : ""}`);
    reload();
  };

  const nlAdd = async (): Promise<void> => {
    if (!nlText.trim()) return;
    setNlBusy(true);
    try {
      const r = await api.aiAdd(nlText.trim());
      notify(`AI la till: ${r.added.map((a) => a.name).join(", ") || "inget"}`);
      setNlText("");
      reload();
    } catch (e) {
      notify(`AI: ${(e as Error).message}`);
    } finally {
      setNlBusy(false);
    }
  };

  const pending = state.suggestions.filter((s) => s.status === "pending");

  const decide = async (id: string, choice: "add" | "pass" | "never"): Promise<void> => {
    await api.decide(id, choice);
    notify(choice === "add" ? "Lade till" : choice === "never" ? "Förslaget ignoreras framgent" : "Avstår");
    reload();
  };

  return (
    <div className="flex flex-col gap-2">
      <Card className="py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm text-muted-foreground min-w-48">
            Komponerar standardvaror, prediktioner och reor i gångordning.
          </p>
          <Button onClick={() => void compose()}>Skapa inköpslista</Button>
        </div>
        {lastCompose && (
          <p
            className={`mt-2 text-sm ${lastCompose.kind === "write-error" ? "text-primary font-medium" : "text-muted-foreground"}`}
          >
            {lastCompose.msg}
          </p>
        )}
      </Card>

      {state.aiConfigured && (
        <Card className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="flex-1 min-w-48"
              placeholder='Be AI: "2 liter mjölk, ett fullkornsbröd och smör"'
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
            />
            <Button variant="secondary" disabled={nlBusy} onClick={() => void nlAdd()}>
              {nlBusy ? "…" : "Lägg till"}
            </Button>
          </div>
        </Card>
      )}

      {todos.filter((t) => t.status === "needs_action").length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          Listan är tom. Tryck "Skapa inköpslista".
        </p>
      )}

      {sortedAisles(state).map((a) => {
        const items = groups.get(a.id);
        if (!items?.length) return null;
        return (
          <div key={a.id}>
            <div className="text-xs font-bold uppercase tracking-wider text-primary mt-3 mb-1.5">{a.name}</div>
            {items.map((t) => (
              <Card key={t.uid} className="py-2.5 mb-2">
                <div className="text-sm">{t.summary}</div>
              </Card>
            ))}
          </div>
        );
      })}

      {pending.length > 0 && (
        <>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mt-4">Förslag</h2>
          {pending.map((s) => (
            <Card key={s.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-40">
                  <span className="font-semibold text-sm">{s.name}</span>
                  {s.reason === "due" && (
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      · behövs nu (var {s.intervalDays}e dag, {Math.round(s.confidence * 100)} %)
                    </span>
                  )}
                  {s.reason === "deal" && (
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      · <Badge>-{Math.round(s.dealPercentOff ?? 0)} %</Badge> {s.dealPrice} kr
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Button size="sm" onClick={() => void decide(s.id, "add")}>
                  Lägg i listan
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void decide(s.id, "pass")}>
                  Inte nu
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void decide(s.id, "never")}>
                  Aldrig
                </Button>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
