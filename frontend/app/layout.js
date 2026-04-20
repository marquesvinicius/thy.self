import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "thy.self",
  description: "Conhece-te a ti mesmo — plataforma de autoconhecimento baseada no Big Five",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      {/*
        suppressHydrationWarning: browser extensions (ColorZilla, Grammarly, LastPass, etc.)
        injetam atributos como `cz-shortcut-listen` no <body> antes do React hidratar,
        gerando mismatches impossíveis de evitar pelo nosso código. Essa flag é aplicada
        SÓ ao próprio <body> — filhos continuam sendo verificados normalmente.
      */}
      <body
        className={`${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
