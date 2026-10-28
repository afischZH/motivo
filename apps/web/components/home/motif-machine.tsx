"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface MachineReel {
  toolId: string;
  /** Tool name, used for the reel link and the live announcement. */
  name: string;
  /** Landing page of the tool. */
  href: string;
  /** Prerendered motif SVGs: the defaults first, then every preset. */
  frames: readonly string[];
}

interface MotifMachineProps {
  reels: readonly MachineReel[];
  labels: {
    /** Accessible name of the machine region. */
    machine: string;
    /** Lever button text. */
    spin: string;
    /** Key cap next to the lever. */
    key: string;
    /** Counter label, e.g. "Variante {n}" with `{n}` replaced here. */
    round: string;
    /** Announced after the reels land, `{tools}` replaced here. */
    landed: string;
    /** Link name of a reel, `{tool}` replaced here. */
    open: string;
  };
}

/** Copies of each reel strip: the middle copy is the resting position. */
const COPIES = 3;
/** Each reel stops a little after the one before, like a real machine. */
const REEL_DURATION_MS = [700, 900, 1100] as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  // Space already activates buttons and links: do not spin twice.
  return /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName);
}

/**
 * The home hero's slot machine: three reels of real tool presets. Space (or
 * the lever) spins them and each lands on the next preset, which is the
 * product's own "space for a new variant" gesture in miniature. Deterministic:
 * every pull advances each reel by a fixed step, no randomness involved.
 */
export function MotifMachine({ reels, labels }: MotifMachineProps) {
  const [round, setRound] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // Logical position per reel; the rendered offset adds whole strip loops.
  const [positions, setPositions] = useState<number[]>(() => reels.map(() => 0));
  const [loops, setLoops] = useState(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = query.matches;
    const update = () => (reducedMotion.current = query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const spin = useCallback(() => {
    if (spinning) return;
    const animate = !reducedMotion.current;
    setRound((r) => r + 1);
    // Reels step by 1, 2 and 3 frames so the combinations keep changing.
    setPositions((p) => p.map((pos, i) => pos + i + 1));
    if (animate) {
      setSpinning(true);
      setLoops(1);
    }
    window.setTimeout(
      () => {
        setSpinning(false);
        setLoops(0);
        setAnnouncement(labels.landed.replace("{tools}", reels.map((r) => r.name).join(", ")));
      },
      animate ? Math.max(...REEL_DURATION_MS) : 0,
    );
  }, [spinning, labels.landed, reels]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== " " || event.repeat || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      spin();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spin]);

  return (
    <section
      aria-label={labels.machine}
      className="machine-cabinet relative mx-auto w-full max-w-xl rounded-[2rem] p-4 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <span className="font-display text-sm font-bold tracking-wide text-machine-foreground/80 uppercase">
          Motivo
        </span>
        <span
          className="rounded-full bg-machine-ink px-3 py-1 font-mono text-xs text-machine-foreground tabular-nums"
          aria-hidden="true"
        >
          {labels.round.replace("{n}", String(round + 1).padStart(3, "0"))}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 rounded-[1.25rem] bg-machine-ink p-2.5 sm:gap-3 sm:p-3">
        {reels.map((reel, i) => {
          const count = reel.frames.length;
          const index = (((positions[i] ?? 0) % count) + count) % count;
          // Rest in the middle copy; while spinning, run one extra loop down the strip.
          const offset = count + index + (spinning ? loops * count : 0);
          const strip = Array.from({ length: COPIES + 1 }, () => reel.frames).flat();
          return (
            <a
              key={reel.toolId}
              href={reel.href}
              aria-label={labels.open.replace("{tool}", reel.name)}
              className={cn(
                "reel-window group relative block aspect-[3/4] overflow-hidden rounded-xl bg-white",
                spinning && "is-spinning",
              )}
            >
              <span
                className="reel-strip flex h-full flex-col"
                style={{
                  transform: `translateY(-${offset * 100}%)`,
                  transitionDuration: spinning ? `${REEL_DURATION_MS[i] ?? 900}ms` : "0ms",
                }}
              >
                {strip.map((src, k) => (
                  // Static SVG files; next/image would add nothing but a loader.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${src}-${k}`}
                    src={src}
                    alt=""
                    width={300}
                    height={400}
                    decoding="async"
                    draggable={false}
                    className="block h-full w-full shrink-0 object-cover"
                  />
                ))}
              </span>
              <span className="reel-glass pointer-events-none absolute inset-0 rounded-xl" />
              <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 truncate rounded-md bg-machine-ink/85 px-2 py-1 text-[11px] font-medium text-machine-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {reel.name}
              </span>
            </a>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 px-1">
        <button
          type="button"
          onClick={spin}
          aria-keyshortcuts="Space"
          className="lever-button font-display inline-flex h-14 items-center gap-3 rounded-full px-6 text-lg font-bold"
        >
          <span aria-hidden="true" className="lever-knob size-5 rounded-full" />
          {labels.spin}
        </button>
        <kbd
          aria-hidden="true"
          className="key-cap hidden h-11 min-w-28 items-center justify-center rounded-lg px-4 font-sans text-sm font-semibold sm:inline-flex"
        >
          {labels.key}
        </kbd>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
