"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useBreadcrumbContext } from "@/components/breadcrumbs-context";

type BreadcrumbItem = {
  title: string;
  link: string;
};

const routeMapping: Record<string, BreadcrumbItem[]> = {
  "/dashboard/employee": [{ title: "Employee", link: "/dashboard/employee" }],
};

export function useBreadcrumbs() {
  const pathname = usePathname();
  let dynamicTitles: Map<string, string> | undefined;

  try {
    const context = useBreadcrumbContext();
    dynamicTitles = context.dynamicTitles;
  } catch {}

  const breadcrumbs = useMemo(() => {
    if (routeMapping[pathname]) {
      return routeMapping[pathname];
    }

    const segments = pathname.split("/").filter(Boolean);
    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join("/")}`;

      let dynamicTitle = dynamicTitles?.get(path);

      if (!dynamicTitle && dynamicTitles) {
        for (const [titlePath, title] of dynamicTitles.entries()) {
          if (titlePath !== path && path.startsWith(titlePath + "/")) {
            const parentSegments = titlePath.split("/").filter(Boolean);
            const currentSegments = path.split("/").filter(Boolean);
            if (currentSegments.length === parentSegments.length + 1) {
              dynamicTitle = title;
              break;
            }
          }
        }
      }

      const title =
        dynamicTitle || segment.charAt(0).toUpperCase() + segment.slice(1);

      return {
        title,
        link: path,
      };
    });
  }, [pathname, dynamicTitles]);

  return breadcrumbs;
}
