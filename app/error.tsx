"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
      <p className="text-xs font-medium tracking-[0.16em] text-signal uppercase">SWAN</p>
      <h1 className="text-2xl font-semibold tracking-tight">This view did not assemble.</h1>
      <p className="text-sm text-muted-foreground">
        The investigation could not be rendered. The indexed slice is still available if you try again.
      </p>
      <div>
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
