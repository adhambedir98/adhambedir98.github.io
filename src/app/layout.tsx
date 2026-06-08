import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_TITLE } from "@/lib/constants";

export const metadata: Metadata = {
  title: APP_TITLE,
  description:
    "Coordinating volunteers for the Harvard Reception at the World Economic Forum (Davos) 2027.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#16130f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-ink">{children}</body>
    </html>
  );
}
