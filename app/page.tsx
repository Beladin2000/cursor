import { Suspense } from "react";
import { SwanApp } from "@/components/swan-app";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Assembling SWAN…</div>
      }
    >
      <SwanApp />
    </Suspense>
  );
}
