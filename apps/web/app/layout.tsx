import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

// TODO(i18n): replace with next-intl messages and a [locale] segment (AP05/M2).
export const metadata: Metadata = {
  title: "Motivo",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // TODO(i18n): derive `lang` from the active locale.
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
