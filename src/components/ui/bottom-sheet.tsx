"use client";

import { type ReactElement, type ReactNode, type RefObject, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";

/** Public bottom sheet with Radix focus/scroll management and Vaul keyboard handling. */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  trigger,
  children,
  returnFocusRef,
  surface = "public",
  floatingTrigger = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  trigger: ReactElement;
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
  surface?: "public" | "admin";
  floatingTrigger?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const triggerElement = <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>;
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} modal repositionInputs autoFocus>
      {floatingTrigger
        ? mounted &&
          createPortal(
            <div className={surface === "admin" ? "clipping-admin-surface" : undefined}>
              {triggerElement}
            </div>,
            document.body
          )
        : triggerElement}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[80] bg-black/35 motion-reduce:animate-none" />
        <Drawer.Content
          className={`${surface === "admin" ? "clipping-admin-surface" : ""} fixed inset-x-0 bottom-0 z-[81] flex h-[85dvh] max-h-[85dvh] min-h-0 flex-col rounded-t-2xl border-t border-[color:var(--nature-line)] bg-[color:var(--nature-bg)] text-[color:var(--nature-text)] outline-none motion-reduce:animate-none`}
          aria-describedby={undefined}
          onCloseAutoFocus={
            returnFocusRef
              ? (event) => {
                  event.preventDefault();
                  returnFocusRef.current?.focus();
                }
              : undefined
          }
        >
          <div
            className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[color:var(--nature-line)]"
            aria-hidden="true"
          />
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
            <Drawer.Title className="font-semibold">{title}</Drawer.Title>
            <Drawer.Close className="nature-button nature-button-outline min-h-11 min-w-11">
              关闭
            </Drawer.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
