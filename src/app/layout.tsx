import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

/*
 * Archivo carries the whole "sporty" voice (see DESIGN.md): one grotesque
 * family for wordmark, headings, numbers and body — differentiated by weight,
 * size and letter-spacing rather than by face.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
  fallback: [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  title: "healcha · train with your data",
  description: "Personal health dashboard",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
