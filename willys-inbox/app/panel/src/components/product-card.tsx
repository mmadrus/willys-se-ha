import type { JSX } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatKr } from "@/lib/utils";
import type { ProductCardData } from "@/product";

export function ProductCard(props: {
  product: ProductCardData;
  onAdd?: () => void;
  stapleActive?: boolean;
  onToggleStaple?: () => void;
  watchActive?: boolean;
  onToggleWatch?: () => void;
}): JSX.Element {
  const p = props.product;
  const off =
    p.percentOff > 0
      ? Math.round(p.percentOff)
      : p.savings > 0 && p.price + p.savings > 0
        ? Math.round((p.savings / (p.price + p.savings)) * 100)
        : 0;
  const isPlus = (p.labels ?? []).includes("Willys plus");
  return (
    <Card className="gap-1.5 p-2.5 overflow-hidden">
      {p.image ? (
        <img
          className="w-full aspect-square object-contain rounded-lg border border-border bg-white"
          loading="lazy"
          src={p.image}
          alt={p.name}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-full aspect-square rounded-lg border border-border bg-secondary flex items-center justify-center text-muted-foreground text-2xl">
          🛒
        </div>
      )}
      <div className="text-[13px] font-semibold leading-tight line-clamp-2 min-h-10" title={p.name}>
        {p.name}
      </div>
      <div className="flex flex-wrap gap-1 min-h-5">
        {off > 0 && <Badge variant="destructive">-{off} %</Badge>}
        {isPlus && <Badge variant="secondary">Willys plus</Badge>}
      </div>
      <div className="text-[15px] font-bold text-primary">
        {formatKr(p.price)} kr
        {(p.comparePrice ?? 0) > p.price && (
          <s className="text-muted-foreground font-normal text-xs ml-1.5">{formatKr(p.comparePrice ?? 0)}</s>
        )}
      </div>
      {p.unit && <div className="text-xs text-muted-foreground">{p.unit}</div>}
      <div className="flex flex-wrap gap-1 mt-auto pt-1">
        {props.onAdd && (
          <Button size="sm" className="flex-1" onClick={props.onAdd}>
            Lägg till
          </Button>
        )}
        {props.onToggleStaple && (
          <Button
            size="sm"
            variant={props.stapleActive ? "default" : "outline"}
            className="flex-1"
            onClick={props.onToggleStaple}
          >
            {props.stapleActive ? "✓ Standard" : "Standard"}
          </Button>
        )}
        {props.onToggleWatch && (
          <Button
            size="sm"
            variant={props.watchActive ? "default" : "outline"}
            className="flex-1"
            onClick={props.onToggleWatch}
          >
            {props.watchActive ? "✓ Bevakas" : "Bevaka"}
          </Button>
        )}
      </div>
    </Card>
  );
}

export function ProductGrid({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">{children}</div>
  );
}
