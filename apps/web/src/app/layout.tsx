import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { messages } from "@/i18n/pt-br";
import { MockBoot } from "@/mocks/mock-boot";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: messages.app.name,
    template: messages.app.titleTemplate,
  },
  description: "Operação editorial do perfil de Rodrigo no LinkedIn.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <MockBoot>
          <AppProviders>{children}</AppProviders>
        </MockBoot>
      </body>
    </html>
  );
}
