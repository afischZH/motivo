"use client";

/**
 * Founders waitlist form (M2-AP10). Asks the API whether the waitlist is on
 * and shows the form with the honest counter, or "coming soon". Talks only
 * to our own API; the Turnstile widget loads only when the build has a site
 * key (the CSP then allows challenges.cloudflare.com).
 *
 * JURISTISCH ZU PRÜFEN: consent and waitlist texts (`Waitlist` in the messages).
 */
import { WAITLIST_DB_LIMITS } from "@motivo/db";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { TURNSTILE_SCRIPT } from "@/lib/telemetry/config";
import {
  fetchAvailability,
  looksLikeEmail,
  submitSignup,
  type Availability,
} from "@/lib/waitlist/client";
import type { WaitlistErrorCode } from "@/lib/waitlist/constants";
import { cn } from "@/lib/utils";

type FieldError = "email" | "consent" | null;
type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; error: WaitlistErrorCode };

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileLoader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  turnstileLoader ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile"));
    script.onerror = () => {
      turnstileLoader = null;
      reject(new Error("turnstile"));
    };
    document.head.append(script);
  });
  return turnstileLoader;
}

const INPUT =
  "h-10 w-full rounded-control border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none aria-invalid:border-destructive sm:text-sm";

export function WaitlistForm({ siteKey }: { siteKey: string | null }) {
  const t = useTranslations("Waitlist");
  const locale = useLocale();
  const id = useId();
  const [availability, setAvailability] = useState<Availability>({ state: "loading" });
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchAvailability().then((result) => {
      if (active) setAvailability(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const formShown = availability.state === "on" && status.kind !== "success";

  useEffect(() => {
    if (!siteKey || !formShown || !widgetRef.current || widgetId.current) return;
    const container = widgetRef.current;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widgetId.current = turnstile.render(container, {
          sitekey: siteKey,
          action: "waitlist",
          language: locale,
          theme: "auto",
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(null),
          "error-callback": () => setTurnstileToken(null),
        });
      })
      .catch(() => setStatus({ kind: "error", error: "captcha" }));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, formShown, locale]);

  useEffect(() => {
    if (status.kind === "success") successRef.current?.focus();
  }, [status.kind]);

  const resetChallenge = useCallback(() => {
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    setTurnstileToken(null);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "submitting") return;
    if (!looksLikeEmail(email)) {
      setFieldError("email");
      emailRef.current?.focus();
      return;
    }
    if (!consent) {
      setFieldError("consent");
      consentRef.current?.focus();
      return;
    }
    setFieldError(null);
    setStatus({ kind: "submitting" });
    const result = await submitSignup({
      email: email.trim(),
      locale,
      consent,
      turnstileToken: turnstileToken ?? undefined,
      website: website || undefined,
    });
    // Turnstile tokens are single use.
    if (siteKey) resetChallenge();
    setStatus(result.ok ? { kind: "success" } : { kind: "error", error: result.error });
  }

  if (availability.state === "loading") {
    return (
      <p className="text-sm text-muted-foreground" data-testid="waitlist-loading">
        {t("loading")}
      </p>
    );
  }

  if (availability.state === "off") {
    return (
      <p className="text-muted-foreground" data-testid="waitlist-coming-soon">
        {t("comingSoon")}
      </p>
    );
  }

  const { confirmed, seats } = availability;
  const counter =
    confirmed === null
      ? null
      : confirmed >= seats
        ? t("countFull", { seats })
        : t("count", { count: confirmed, seats });
  const emailError = fieldError === "email" ? t("errors.email") : null;
  const consentError = fieldError === "consent" ? t("errors.consent") : null;
  const submitting = status.kind === "submitting";
  const challengePending = Boolean(siteKey) && !turnstileToken;

  return (
    <div className="flex flex-col gap-4" data-testid="waitlist">
      {counter && (
        <p className="text-sm font-medium" data-testid="waitlist-count">
          {counter}
        </p>
      )}

      {status.kind === "success" ? (
        <div
          ref={successRef}
          tabIndex={-1}
          role="status"
          className="flex flex-col gap-1 rounded-card border border-border bg-card p-4 focus:outline-none"
          data-testid="waitlist-success"
        >
          <p className="font-semibold">{t("successTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("success", { hours: WAITLIST_DB_LIMITS.tokenTtlHours })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("successHint", { minutes: WAITLIST_DB_LIMITS.resendCooldownMinutes })}
          </p>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={submitting}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-email`} className="text-sm font-medium">
              {t("emailLabel")}
            </label>
            <input
              ref={emailRef}
              id={`${id}-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? `${id}-email-error` : undefined}
              className={INPUT}
            />
            {emailError && (
              <p id={`${id}-email-error`} className="text-sm text-destructive">
                {emailError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-3">
              <input
                ref={consentRef}
                id={`${id}-consent`}
                name="consent"
                type="checkbox"
                required
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                aria-invalid={consentError ? true : undefined}
                aria-describedby={consentError ? `${id}-consent-error` : undefined}
                className="mt-1 size-4 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
              />
              <label htmlFor={`${id}-consent`} className="text-sm text-muted-foreground">
                {t.rich("consent", {
                  link: (chunks) => (
                    <Link
                      href="/privacy"
                      className="text-link underline underline-offset-4 hover:no-underline"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </label>
            </div>
            {consentError && (
              <p id={`${id}-consent-error`} className="text-sm text-destructive">
                {consentError}
              </p>
            )}
          </div>

          {/* Honeypot: hidden from people and assistive tech, filled in by naive bots. */}
          <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
            <label htmlFor={`${id}-website`}>{t("honeypotLabel")}</label>
            <input
              id={`${id}-website`}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          {siteKey && (
            <div className="flex min-h-[65px] flex-col gap-1">
              <div ref={widgetRef} />
              {challengePending && (
                <p className="text-xs text-muted-foreground">{t("captchaLoading")}</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={submitting || challengePending}>
              {submitting ? t("submitting") : t("submit")}
            </Button>
          </div>
        </form>
      )}

      <p
        role="alert"
        className={cn("text-sm text-destructive", status.kind !== "error" && "sr-only")}
        data-testid="waitlist-error"
      >
        {status.kind === "error" ? t(`errors.${status.error}`) : ""}
      </p>
    </div>
  );
}
