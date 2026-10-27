"use client";

/**
 * Confirmation button of the double opt-in. The e-mail links to this page
 * with the token in the URL fragment (`#token=…`), which browsers never send
 * to a server; it is removed from the address bar at once. Confirming needs
 * a click that POSTs, so mail link scanners that open the link cannot
 * confirm a sign-up. Afterwards the page moves on to the result page.
 */
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { submitConfirm, tokenFromHash } from "@/lib/waitlist/client";

type State = "init" | "ready" | "missing" | "working" | "error";

export interface ConfirmFormProps {
  /** Localized paths of the result pages (computed on the server). */
  confirmedPath: string;
  invalidPath: string;
}

export function ConfirmForm({ confirmedPath, invalidPath }: ConfirmFormProps) {
  const t = useTranslations("WaitlistResult.confirm");
  const router = useRouter();
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
    const result = await submitConfirm(token.current);
    if (result === "error") {
      setState("error");
      return;
    }
    router.replace(result === "confirmed" ? confirmedPath : invalidPath);
  }

  const message = state === "missing" ? t("noToken") : state === "error" ? t("error") : "";

  return (
    <div className="flex flex-col gap-4">
      {(state === "ready" || state === "working" || state === "error") && (
        <Button
          type="button"
          size="lg"
          className="w-fit"
          onClick={onClick}
          disabled={state === "working"}
          data-testid="confirm-button"
        >
          {state === "working" ? t("working") : t("button")}
        </Button>
      )}
      <p role="status" aria-live="polite" className="font-medium" data-testid="confirm-status">
        {message}
      </p>
    </div>
  );
}
