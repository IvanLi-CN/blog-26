"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variantClasses = {
      default: "nature-button nature-button-primary",
      destructive: "nature-button nature-button-danger",
      outline: "nature-button nature-button-outline",
      secondary: "nature-button nature-button-outline",
      ghost: "nature-button nature-button-ghost",
      link: "nature-link-inline px-0 py-0 bg-transparent border-none shadow-none",
    } as const;

    const sizeClasses = {
      default: "min-h-11 px-4 py-2.5",
      sm: "min-h-9 px-3 py-2 text-sm",
      lg: "min-h-12 px-6 py-3 text-base",
      icon: "nature-icon-button size-10 p-0",
    } as const;

    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
