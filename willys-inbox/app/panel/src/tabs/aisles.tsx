import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/api";
import type { AppStateData } from "@/types";
import type { Notify } from "@/hooks";

export function AislesTab({ state, reload, notify }: { state: AppStateData; reload: () => void; notify: Notify }) {
  const [aisles, setAisles] = useState(() => [...state.aisles].sort((a, b) => a.order - b.order));

  const move = (idx: number, dir: number): void => {
    const next = [...aisles];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setAisles(next);
  };

  const rename = (idx: number, name: string): void => {
    const next = [...aisles];
    next[idx] = { ...next[idx], name };
    setAisles(next);
  };

  const save = async (): Promise<void> => {
    await api.reorderAisles(
      aisles.map((a) => a.id),
      Object.fromEntries(aisles.map((a) => [a.id, a.name])),
    );
    notify("Gångordning sparad");
    reload();
  };

  return (
    <div className="flex flex-col gap-2">
      <Card className="py-3">
        <div className="flex flex-wrap items-center gap-2 px-1">
          <p className="flex-1 text-sm text-muted-foreground min-w-48">
            Ordningen styr i vilken ordning varor läggs på inköpslistan.
          </p>
          <Button onClick={() => void save()}>Spara ordning</Button>
        </div>
      </Card>
      {aisles.map((a, idx) => (
        <Card key={a.id} className="py-2.5">
          <div className="flex items-center gap-2 px-1">
            <span className="text-muted-foreground text-sm w-6">{idx + 1}.</span>
            <Input
              className="flex-1"
              value={a.name}
              onChange={(e) => rename(idx, e.target.value)}
            />
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => move(idx, -1)}>
                ↑
              </Button>
              <Button size="sm" variant="outline" onClick={() => move(idx, 1)}>
                ↓
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
