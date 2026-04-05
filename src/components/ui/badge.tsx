"use client";

import type * as React from "react";
import { cn } from "../../lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variantClasses = {
    default: "nature-chip nature-chip-accent",
    secondary: "nature-chip nature-chip-info",
    destructive: "nature-chip nature-chip-danger",
    outline: "nature-chip",
  } as const;

  return (
    <div
      className={cn("inline-flex items-center gap-1", variantClasses[variant], className)}
      {...props}
    />
  );
}

export { Badge };
