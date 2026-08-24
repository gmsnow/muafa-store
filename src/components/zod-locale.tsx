"use client";

import { useEffect } from "react";
import { z } from "zod";
import { ar } from "zod/locales";

export function ZodLocale() {
  useEffect(() => {
    z.config(ar());
  }, []);
  return null;
}
