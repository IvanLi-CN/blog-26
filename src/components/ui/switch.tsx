"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export type SwitchProps = React.InputHTMLAttributes<HTMLInputElement>;

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, ...props }, ref) => {
  return (
    <label
      className={cn(
        "relative inline-flex h-[1.7rem] w-[3.1rem] items-center",
        props.disabled ? "cursor-not-allowed" : "cursor-pointer"
      )}
    >
      <input
        type="checkbox"
        className="nature-switch-input peer absolute inset-0 z-10 m-0 cursor-inherit opacity-0"
        ref={ref}
        {...props}
      />
      <div
        className={cn(
          "nature-switch pointer-events-none peer-focus-visible:outline-none peer-disabled:cursor-not-allowed peer-disabled:opacity-55",
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
