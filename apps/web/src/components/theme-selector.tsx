"use client";

import { useThemeConfig } from "@/components/active-theme";
import { useEffect } from "react";

export function ThemeSelector() {
  const { setActiveTheme } = useThemeConfig();

  useEffect(() => {
    setActiveTheme("mono-scaled");
  }, [setActiveTheme]);

  return null;
}
