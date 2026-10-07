"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import "./compact-controls.css";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  density?: "default" | "compact";
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, density = "default", type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          density === "compact"
            ? "nature-input-shell-compact disabled:cursor-not-allowed disabled:opacity-50"
            : "nature-input-shell h-11 rounded-[var(--nature-radius-sm)] px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
