import { useEffect, useMemo, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  pageWindow,
} from "@/components/ui/pagination";
import { ProductCard, ProductGrid } from "@/components/product-card";
import { findRegistryKey, registryLookups } from "@/product";
import type { AppStateData, DealItem } from "@/types";
import type { Notify } from "@/hooks";

const PAGE_SIZE = 25;

type DealSort = "gang" | "rabatt" | "spar" | "pris";

export function DealsTab({ state, reload, notify }: { state: AppStateData; reload: () => void; notify: Notify }) {
  const deals = state.deals ?? [];
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [aisleFilter, setAisleFilter] = useState("all");
  const [plusOnly, setPlusOnly] = useState(false);
  const [sort, setSort] = useState<DealSort>("gang");
  const lookups = registryLookups(state);
  const watchKeys = new Set(state.watchlist);
  const stapleKeys = new Set(state.staples.map((st) => st.key));

  const aisleIdx = useMemo(
    () => new Map([...state.aisles].sort((a, b) => a.order - b.order).map((a, i) => [a.id, i])),
    [state.aisles],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = deals.filter((d) => {
      if (aisleFilter !== "all" && (d.aisle ?? "andra") !== aisleFilter) return false;
      if (plusOnly && !(d.labels ?? []).includes("Willys plus")) return false;
      if (q && !`${d.name} ${d.unit ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === "gang") {
        const ai = aisleIdx.get(a.aisle ?? "andra") ?? 999;
        const bi = aisleIdx.get(b.aisle ?? "andra") ?? 999;
        if (ai !== bi) return ai - bi;
        return b.percentOff - a.percentOff;
      }
      if (sort === "pris") return a.price - b.price;
      if (sort === "spar") return b.savings - a.savings;
      return b.percentOff - a.percentOff;
    });
  }, [deals, query, aisleFilter, plusOnly, sort, aisleIdx]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [query, aisleFilter, plusOnly, sort]);

  const changePage = (p: number): void => {
    setPage(Math.min(pages - 1, Math.max(0, p)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleWatch = (d: DealItem): void => {
    const key = findRegistryKey(lookups, d);
    if (key) {
      const on = watchKeys.has(key);
      void (on ? api.unwatch(key) : api.watch(key)).then(reload);
    } else {
      void api
        .addItem({ name: d.name, code: d.code, query: d.name, watch: true })
        .then(() => {
          notify(`Bevakar "${d.name}"`);
          reload();
        })
        .catch((e: Error) => notify(`Fel: ${e.message}`));
    }
  };

  const toggleStaple = (d: DealItem): void => {
    const key = findRegistryKey(lookups, d);
    if (key) {
      const on = stapleKeys.has(key);
      void (on ? api.unsetStaple(key) : api.setStaple(key, { active: true, qty: 1 })).then(reload);
    } else {
      void api
        .addItem({ name: d.name, code: d.code, query: d.name, asStaple: true })
        .then(() => {
          notify(`"${d.name}" sparad som standardvara`);
          reload();
        })
        .catch((e: Error) => notify(`Fel: ${e.message}`));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Card className="py-3">
        <div className="flex flex-wrap items-center gap-2 px-1">
          <Input
            type="search"
            placeholder="Filtrera reor …"
            className="flex-1 min-w-44"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select value={sort} onValueChange={(v) => setSort(v as DealSort)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gang">Gångordning</SelectItem>
              <SelectItem value="rabatt">Rabatt %</SelectItem>
              <SelectItem value="spar">Sparar kr</SelectItem>
              <SelectItem value="pris">Lägsta pris</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2 px-1">
          <Select value={aisleFilter} onValueChange={setAisleFilter}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla avdelningar</SelectItem>
              {[...state.aisles]
                .sort((a, b) => a.order - b.order)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Label className="flex items-center gap-2 text-muted-foreground">
            <Checkbox checked={plusOnly} onCheckedChange={(v) => setPlusOnly(v === true)} />
            Endast Willys plus
          </Label>
          <span className="text-sm text-muted-foreground">{filtered.length} reor</span>
        </div>
      </Card>

      <ProductGrid>
        {slice.map((d) => {
          const key = findRegistryKey(lookups, d);
          return (
            <ProductCard
              key={d.code}
              product={d}
              watchActive={key ? watchKeys.has(key) : false}
              onToggleWatch={() => toggleWatch(d)}
              stapleActive={key ? stapleKeys.has(key) : false}
              onToggleStaple={() => toggleStaple(d)}
            />
          );
        })}
      </ProductGrid>

      {filtered.length > PAGE_SIZE && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious disabled={current <= 0} onClick={() => changePage(current - 1)} />
            </PaginationItem>
            {pageWindow(current, pages).map((p, i) =>
              p === "ellipsis" ? (
                <PaginationItem key={`e${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink isActive={p === current} onClick={() => changePage(p)}>
                    {p + 1}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext disabled={current >= pages - 1} onClick={() => changePage(current + 1)} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
      {deals.length > 0 && filtered.length !== deals.length && (
        <p className="text-center text-xs text-muted-foreground">{filtered.length} av {deals.length} reor visas.</p>
      )}
      {!filtered.length && (
        <p className="text-center text-muted-foreground py-8">
          {deals.length
            ? "Inga reor matchar filtret."
            : 'Inga reor hämtade än – tryck "Uppdatera reor" under Inställningar.'}
        </p>
      )}
    </div>
  );
}
