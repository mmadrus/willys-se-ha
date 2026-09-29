import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/api";
import { useState } from "react";
import type { AppStateData } from "@/types";
import type { Notify } from "@/hooks";

export function ItemsTab({ state, reload, notify }: { state: AppStateData; reload: () => void; notify: Notify }) {
  const aisles = [...state.aisles].sort((a, b) => a.order - b.order);
  const predByKey = new Map(state.predictions.map((p) => [p.key, p]));
  const items = [...state.items].sort((a, b) => {
    const ai = aisles.findIndex((x) => x.id === a.aisle);
    const bi = aisles.findIndex((x) => x.id === b.aisle);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name, "sv");
  });
  const stapleKeys = new Set(state.staples.map((st) => st.key));
  const watchKeys = new Set(state.watchlist);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const patch = (key: string, data: Parameters<typeof api.patchItem>[1]): void => {
    void api.patchItem(key, data).then(reload);
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map((i) => {
        const st = predByKey.get(i.key);
        const aisle = aisles.find((a) => a.id === i.aisle);
        return (
          <Card key={i.key} className="py-3">
            <div className="flex flex-wrap items-centergap-2">
              <div className="flex-1 min-w-40">
                <span className="font-semibold text-sm">{i.name}</span>
                <div className="text-muted-foreground text-sm">
                  {aisle?.name ?? "Övrigt"} ·{" "}
                  {st?.suggestionsCount ? `köpt ${st.suggestionsCount}x` : "ingen historik"}
                  {st && ` · ${Math.round(st.confidence * 100)} % säker`}
                </div>
              </div>
              <Select
                value={st?.mode ?? "suggest"}
                onValueChange={(mode) => patch(i.key, { mode: mode as "suggest" | "auto" | "never" })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suggest">Föreslå</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="never">Aldrig</SelectItem>
                </SelectContent>
              </Select>
              <Select value={i.aisle} onValueChange={(v) => patch(i.key, { aisle: v })}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aisles.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrapgap-1.5 mt-2">
              <Button
                size="sm"
                variant={stapleKeys.has(i.key) ? "default" : "outline"}
                onClick={() => {
                  const on = stapleKeys.has(i.key);
                  void (on ? api.unsetStaple(i.key) : api.setStaple(i.key, { active: true, qty: 1 })).then(reload);
                }}
              >
                {stapleKeys.has(i.key) ? "✓ Standard" : "Standard"}
              </Button>
              <Button
                size="sm"
                variant={watchKeys.has(i.key) ? "default" : "outline"}
                onClick={() => {
                  const on = watchKeys.has(i.key);
                  void (on ? api.unwatch(i.key) : api.watch(i.key)).then(reload);
                }}
              >
                {watchKeys.has(i.key) ? "✓ Bevakas" : "Bevaka"}
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmKey(i.key)}>
                Ta bort
              </Button>
            </div>
          </Card>
        );
      })}
      {!items.length && <p className="text-center text-muted-foreground py-8">Inga varor än – sök och lägg till.</p>}

      <AlertDialog open={confirmKey !== null} onOpenChange={(o) => !o && setConfirmKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort varan?</AlertDialogTitle>
            <AlertDialogDescription>
              "{items.find((i) => i.key === confirmKey)?.name ?? ""}" tas bort ur registret tillsammans med
              standard-/bevakningsstatus. Historik finns kvar i händelseloggen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmKey) void api.deleteItem(confirmKey).then(reload);
                setConfirmKey(null);
              }}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
