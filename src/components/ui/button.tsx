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
      default: "px-4",
      sm: "px-3 text-sm",
      lg: "px-5 text-base",
      icon: "nature-icon-button inline-flex p-0",
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
