import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button, buttonVariants } from "./button";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav role="navigation" aria-label="pagination" className={cn("flex justify-center items-center gap-1 py-2", className)} {...props} />;
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("flex items-center gap-1", className)} {...props} />;
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li {...props} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
  disabled?: boolean;
} & React.ComponentProps<typeof Button>;

function PaginationLink({ className, isActive, disabled, ...props }: PaginationLinkProps) {
  return (
    <Button
      aria-current={isActive ? "page" : undefined}
      variant={isActive ? "default" : "outline"}
      size="icon"
      disabled={disabled}
      className={cn("size-9", className)}
      {...props}
    />
  );
}

function PaginationPrevious({ className, disabled, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="outline" size="sm" disabled={disabled} className={cn("gap-1", className)} {...props}>
      <ChevronLeftIcon className="size-4" />
      Föregående
    </Button>
  );
}

function PaginationNext({ className, disabled, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button variant="outline" size="sm" disabled={disabled} className={cn("gap-1", className)} {...props}>
      Nästa
      <ChevronRightIcon className="size-4" />
    </Button>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("flex size-9 items-center justify-center text-muted-foreground", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
  buttonVariants,
};

/** Page list with "1 … 4 5 6 … 12" style window. */
export function pageWindow(current: number, pages: number): Array<number | "ellipsis"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const out: Array<number | "ellipsis"> = [0];
  const start = Math.max(1, current - 1);
  const end = Math.min(pages - 2, current + 1);
  if (start > 1) out.push("ellipsis");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 2) out.push("ellipsis");
  out.push(pages - 1);
  return out;
}
