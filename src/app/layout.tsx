import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { Cairo } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ZodLocale } from "@/components/zod-locale";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { dict } from "@/shared/i18n";

const cairo = Cairo({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = dict();
  return {
    title: `${t.auth.storeName} — ${t.common.appName}`,
    description: "Grocery store management system / نظام إدارة متجر البقالة",
    manifest: "/manifest.webmanifest",
    applicationName: t.common.appName,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: t.common.appName,
    },
    icons: {
      icon: [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} ${geistMono.variable} h-full font-sans antialiased`}
      >
        <ThemeProvider>
          <PwaRegister />
          <ZodLocale />
          {children}
          <Toaster position="bottom-left" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
