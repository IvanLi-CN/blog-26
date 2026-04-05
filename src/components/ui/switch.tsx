"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export type SwitchProps = React.InputHTMLAttributes<HTMLInputElement>;

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, ...props }, ref) => {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <input type="checkbox" className="peer sr-only" ref={ref} {...props} />
      <div
        className={cn(
          "nature-switch peer-focus-visible:outline-none peer-disabled:cursor-not-allowed peer-disabled:opacity-55",
          className
        )}
        data-state={props.checked ? "checked" : "unchecked"}
        aria-disabled={props.disabled ? "true" : "false"}
      />
    </label>
  );
});
Switch.displayName = "Switch";

export { Switch };
