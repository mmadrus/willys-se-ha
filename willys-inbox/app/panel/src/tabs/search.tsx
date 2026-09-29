import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductCard, ProductGrid } from "@/components/product-card";
import { findRegistryKey, registryLookups } from "@/product";
import type { AppStateData, SearchHit } from "@/types";
import type { Notify } from "@/hooks";

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 25;

export function SearchTab({ state, reload, notify }: { state: AppStateData; reload: () => void; notify: Notify }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [brandName, setBrandName] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [selectedAisle, setSelectedAisle] = useState<string>("none");
  const gridRef = useRef<HTMLDivElement | null>(null);
  const lookups = registryLookups(state);
  const stapleKeys = new Set(state.staples.map((st) => st.key));
  const watchKeys = new Set(state.watchlist);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setPages(1);
      setTotal(0);
      setBrandName("");
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = window.setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      api
        .search(term, page, ac.signal)
        .then((d) => {
          setResults(d.results ?? []);
          setPages(Math.max(1, d.pages ?? 1));
          setTotal(d.total ?? 0);
          setBrandName(d.brandName ?? "");
        })
        .catch((err: Error) => {
          if (err.name !== "AbortError") notify(`Sök fel: ${err.message}`);
        })
        .finally(() => {
          if (!ac.signal.aborted) setBusy(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [q, page]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const changePage = (p: number): void => {
    setPage(p);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** Toggle actions: update existing registry item, or create it first. */
  const toggleStaple = (r: SearchHit): void => {
    const key = findRegistryKey(lookups, r);
    if (key) {
      const active = stapleKeys.has(key);
      void (active ? api.unsetStaple(key) : api.setStaple(key, { active: true, qty: 1 })).then(reload);
    } else {
      void api
        .addItem({
          name: r.name,
          code: r.code,
          query: q.trim(),
          aisle: selectedAisle === "none" ? undefined : selectedAisle,
          basketType: r.basketType,
          asStaple: true,
        })
        .then(() => {
          notify(`"${r.name}" sparad som standardvara`);
          reload();
        })
        .catch((e: Error) => notify(`Fel: ${e.message}`));
    }
  };

  const toggleWatch = (r: SearchHit): void => {
    const key = findRegistryKey(lookups, r);
    if (key) {
      const active = watchKeys.has(key);
      void (active ? api.unwatch(key) : api.watch(key)).then(reload);
    } else {
      void api
        .addItem({
          name: r.name,
          code: r.code,
          query: q.trim(),
          aisle: selectedAisle === "none" ? undefined : selectedAisle,
          basketType: r.basketType,
          watch: true,
        })
        .then(() => {
          notify(`Bevakar "${r.name}"`);
          reload();
        })
        .catch((e: Error) => notify(`Fel: ${e.message}`));
    }
  };

  const addToList = (r: SearchHit): void => {
    void api
      .addItem({
        name: r.name,
        code: r.code,
        query: q.trim(),
        aisle: selectedAisle === "none" ? undefined : selectedAisle,
        basketType: r.basketType,
      })
      .then(() => {
        notify(`"${r.name}" på inköpslistan`);
        reload();
      })
      .catch((e: Error) => notify(`Fel: ${e.message}`));
  };

  const registryKeyOf = (r: SearchHit): string | null => findRegistryKey(lookups, r);

  return (
    <div className="flex flex-col gap-2">
      <Input
        className="h-11 text-base"
        type="search"
        placeholder="Sök i Willys sortiment (söker direkt) …"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(0);
        }}
      />
      <Card className="py-2.5">
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-sm text-muted-foreground">Avdelning för nya varor:</span>
          <Select value={selectedAisle} onValueChange={setSelectedAisle}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">(gissa automatiskt)</SelectItem>
              {[...state.aisles]
                .sort((a, b) => a.order - b.order)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </Card>
      <div ref={gridRef}>
        {brandName && <div className="text-xs font-bold uppercase tracking-wider text-primary mt-2 mb-1">Varumärke: {brandName}</div>}
        <ProductGrid>
          {results.map((r) => {
            const key = registryKeyOf(r);
            const stapleActive = key ? stapleKeys.has(key) : false;
            const watchActive = key ? watchKeys.has(key) : false;
            return (
              <ProductCard
                key={r.code}
                product={r}
                onAdd={() => addToList(r)}
                stapleActive={stapleActive}
                onToggleStaple={() => toggleStaple(r)}
                watchActive={watchActive}
                onToggleWatch={() => toggleWatch(r)}
              />
            );
          })}
        </ProductGrid>
      </div>
      {total > 0 && (
        <div className="flex justify-center items-center gap-3 py-3 text-sm text-muted-foreground flex-wrap">
          <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => changePage(page - 1)}>
            ← Föregående
          </Button>
          <span>
            Sida {page + 1} av {pages} · {total} träffar
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => changePage(page + 1)}>
            Nästa →
          </Button>
        </div>
      )}
      {q.trim().length >= 2 && !busy && !results.length && (
        <p className="text-center text-muted-foreground py-8">Inga träffar för "{q}".</p>
      )}
      {q.trim().length < 2 && (
        <p className="text-center text-muted-foreground py-8">Skriv minst två bokstäver – resultaten visas direkt.</p>
      )}
    </div>
  );
}
