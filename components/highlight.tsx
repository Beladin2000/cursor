import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function Highlight({
  text,
  tokens,
}: {
  text: string;
  tokens: string[];
}) {
  const useful = [...new Set(tokens.map((token) => token.trim()).filter((token) => token.length >= 2))]
    .sort((a, b) => b.length - a.length);
  if (useful.length === 0) return <>{text}</>;
  const pattern = new RegExp(useful.map(escapeRegExp).join("|"), "gi");
  const matches = text.match(pattern);
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {matches?.[index] ? (
            <mark className="rounded-sm bg-signal/20 px-0.5 text-foreground">{matches[index]}</mark>
          ) : null}
        </span>
      ))}
    </>
  );
}

export function Pivot({
  query,
  onOpen,
  children,
  className,
}: {
  query: string;
  onOpen: (query: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(query)}
      className={cn("text-left font-mono text-signal hover:underline", className)}
    >
      {children}
    </button>
  );
}
