import { h, type JSX } from "preact";
import htm from "htm";
import type { DealItem, SearchHit } from "./types";

type Html = (strings: TemplateStringsArray, ...values: unknown[]) => JSX.Element;
const html = htm.bind(h as unknown as (...args: unknown[]) => unknown) as Html;

export interface ProductCardData {
  code: string;
  name: string;
  price: number;
  unit?: string;
  savings: number;
  percentOff: number;
  labels?: string[];
  image?: string | null;
  comparePrice?: number;
}

export function ProductCard(
  props: { product: ProductCardData; onAdd?: () => void; extraActions?: JSX.Element },
): JSX.Element {
  const p: ProductCardData = {
    ...props.product,
    unit: props.product.unit ?? "",
    labels: props.product.labels ?? [],
    comparePrice: props.product.comparePrice ?? 0,
  };
  const off = p.percentOff > 0
    ? Math.round(p.percentOff)
    : p.savings > 0 && p.price + p.savings > 0
      ? Math.round((p.savings / (p.price + p.savings)) * 100)
      : 0;
  return html`
    <div class="pcard">
      ${p.image
        ? html`<img class="pimg" loading="lazy" src=${p.image} alt=${p.name}
                    onError=${(e: Event) => { (e.target as HTMLImageElement).style.display = "none"; }} />`
        : html`<div class="pimg-ph">🛒</div>`}
      <div class="pname" title=${p.name}>${p.name}</div>
      <div class="pbadges">
        ${off > 0 && html`<span class="badge off">-${off} %</span>`}
        ${(p.labels ?? []).includes("Willys plus") && html`<span class="badge loyalty">Willys plus</span>`}
      </div>
      <div class="pprice">
        ${formatKr(p.price)} kr
        ${(p.comparePrice ?? 0) > p.price && html`<s>${formatKr(p.comparePrice ?? 0)}</s>`}
      </div>
      ${p.unit && html`<div class="punit">${p.unit}</div>`}
      <div class="pactions">
        ${props.onAdd && html`<button class="btn primary small" onClick=${() => props.onAdd?.()}>Lägg till</button>`}
        ${props.extraActions}
      </div>
    </div>
  `;
}

export function ProductGrid(
  props: { children: preact.ComponentChildren },
): JSX.Element {
  return html`<div class="pgrid">${props.children}</div>`;
}

export function formatKr(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(".", ",");
}
