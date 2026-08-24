import type { MetadataRoute } from "next";
import { dict } from "@/shared/i18n";

export default function manifest(): MetadataRoute.Manifest {
  const t = dict();
  return {
    name: `${t.auth.storeName} — ${t.common.appName}`,
    short_name: t.common.appName,
    description: "Grocery store management system / نظام إدارة متجر البقالة",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    dir: "rtl",
    lang: "ar",
    background_color: "#ffffff",
    theme_color: "#16a34a",
    categories: ["business", "productivity", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
