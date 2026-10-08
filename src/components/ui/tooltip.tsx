"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import { cn } from "../../lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, collisionPadding = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        "z-[100] max-w-[min(22rem,calc(100vw-16px))] whitespace-normal break-words rounded-[var(--nature-radius-small,6px)] border px-2 py-1.5 text-xs leading-5 shadow-lg outline-none",
        "border-[color:var(--nature-line,rgba(132,167,181,0.32))] bg-[color:var(--nature-surface-strong,rgba(24,36,29,0.96))] text-[color:var(--nature-text,#f7fff8)]",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

const TooltipArrow = TooltipPrimitive.Arrow;

export { Tooltip, TooltipArrow, TooltipContent, TooltipProvider, TooltipTrigger };
