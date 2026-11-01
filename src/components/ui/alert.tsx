"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

type AlertVariant = "default" | "destructive";

const alertVariantClasses: Record<AlertVariant, string> = {
  default:
    "border-[color:var(--nature-line)] bg-[color:color-mix(in_srgb,var(--nature-surface-muted)_78%,transparent)] text-[color:var(--nature-text)]",
  destructive:
    "border-[color:color-mix(in_srgb,var(--nature-danger)_36%,var(--nature-line))] bg-[color:color-mix(in_srgb,var(--nature-danger)_10%,var(--nature-surface-strong))] text-[color:var(--nature-text)]",
};

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }
>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    data-slot="alert"
    className={cn(
      "@container relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-[var(--nature-radius-sm)] border px-4 py-3 text-sm leading-6",
      alertVariantClasses[variant],
      className
    )}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      data-slot="alert-title"
      className={cn("col-start-2 row-start-1 font-semibold leading-5 tracking-tight", className)}
      {...props}
    />
  )
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="alert-description"
      className={cn(
        "col-start-2 row-start-2 min-w-0 text-sm leading-6 text-[color:var(--nature-text-soft)] [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
);
AlertDescription.displayName = "AlertDescription";

const AlertAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="alert-action"
      className={cn(
        "col-start-3 row-span-2 row-start-1 self-center justify-self-end",
        "@max-[20rem]:col-span-2 @max-[20rem]:col-start-2 @max-[20rem]:row-span-1 @max-[20rem]:row-start-3 @max-[20rem]:justify-self-end",
        className
      )}
      {...props}
    />
  )
);
AlertAction.displayName = "AlertAction";

export { Alert, AlertAction, AlertDescription, AlertTitle };
