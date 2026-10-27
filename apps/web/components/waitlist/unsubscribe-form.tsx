"use client";

/**
 * Unsubscribe button. The token comes from the URL fragment (`#token=…`),
 * which browsers never send to a server; it is removed from the address bar
 * at once. Unsubscribing needs a click, so link scanners cannot trigger it.
 */
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { submitUnsubscribe, tokenFromHash, type UnsubscribeResult } from "@/lib/waitlist/client";

type State = "init" | "ready" | "missing" | "working" | UnsubscribeResult;

export function UnsubscribeForm() {
  const t = useTranslations("WaitlistResult.unsubscribe");
  const [state, setState] = useState<State>("init");
  const token = useRef<string | null>(null);

  useEffect(() => {
    // StrictMode runs this twice in dev; the second run sees the cleared hash.
    token.current ??= tokenFromHash(window.location.hash);
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    // Reading the fragment is only possible after hydration.
    setState(token.current ? "ready" : "missing");
  }, []);

  async function onClick() {
    if (!token.current) return;
    setState("working");
    setState(await submitUnsubscribe(token.current));
  }

  const message =
    state === "missing"
      ? t("noToken")
      : state === "unsubscribed"
        ? t("done")
        : state === "invalid"
          ? t("invalid")
          : state === "error"
            ? t("error")
            : "";

  return (
    <div className="flex flex-col gap-4">
      {(state === "ready" || state === "working" || state === "error") && (
        <Button
          type="button"
          size="lg"
          className="w-fit"
          onClick={onClick}
          disabled={state === "working"}
          data-testid="unsubscribe-button"
        >
          {state === "working" ? t("working") : t("button")}
        </Button>
      )}
      <p role="status" aria-live="polite" className="font-medium" data-testid="unsubscribe-status">
        {message}
      </p>
    </div>
  );
}
