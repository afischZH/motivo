import { createRng } from "@motivo/engine";

export default function HomePage() {
  // Proves the workspace wiring: the engine is consumed as TypeScript source.
  const sample = createRng(1).next().toFixed(4);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center gap-6 px-4">
      {/* TODO(i18n): neutral placeholder copy, move to next-intl keys. */}
      <h1 className="text-3xl font-semibold tracking-tight">Motivo</h1>
      <p className="text-muted-foreground">
        Engine check: <output data-testid="engine-sample">{sample}</output>
      </p>
    </main>
  );
}
