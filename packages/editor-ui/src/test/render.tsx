/** Test helpers: render with real editor messages plus fixture tool texts. */
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import de from "../messages/de.json";

const optionLabels = (values: string[]) => Object.fromEntries(values.map((v) => [v, v]));

export const fixtureMessages = {
  ...de,
  tools: {
    "test-fixture": {
      groups: { shape: "Form", style: "Stil" },
      params: {
        background: { label: "Hintergrund" },
        palette: { label: "Palette" },
        count: { label: "Anzahl" },
        opacity: { label: "Deckkraft", help: "Wie stark die Formen decken" },
        rotation: { label: "Drehung" },
        shape: { label: "Form", options: optionLabels(["circle", "square", "triangle"]) },
        blend: {
          label: "Mischmodus",
          options: optionLabels(["normal", "multiply", "screen", "overlay", "darken", "lighten"]),
        },
        outline: { label: "Kontur" },
        outlineColor: { label: "Konturfarbe" },
        title: { label: "Titel" },
        offset: { label: "Versatz" },
        internal: { label: "Intern" },
        fixed: { label: "Fixiert" },
      },
    },
    "test-list": {
      item: "Ebene {index}",
      params: {
        background: { label: "Hintergrund" },
        items: { label: "Ebenen" },
        kind: { label: "Art", options: optionLabels(["a", "b", "c", "d", "e", "f", "g"]) },
        size: { label: "Grösse" },
      },
    },
  },
};

/** Renders inside `NextIntlClientProvider`; a missing message fails the test. */
export function renderWithIntl(ui: ReactElement, messages: object = fixtureMessages): RenderResult {
  return render(
    <NextIntlClientProvider
      locale="de"
      messages={messages}
      onError={(error) => {
        throw error;
      }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}
