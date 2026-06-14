import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as LabelPrimitive from "@radix-ui/react-label";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { Slot } from "@radix-ui/react-slot";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type TextareaHTMLAttributes,
  type ThHTMLAttributes,
} from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "quiet";
  size?: "default" | "sm" | "lg" | "icon";
};

export function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 lg:rounded-[0.75rem] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        "active:scale-[0.98]",
        variant === "default" &&
          "bg-primary text-primary-foreground shadow-lg shadow-primary/18 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/24",
        variant === "secondary" &&
          "bg-secondary/16 text-secondary-foreground shadow-md shadow-secondary/10 hover:-translate-y-0.5 hover:bg-secondary/22 hover:shadow-lg hover:shadow-secondary/16",
        variant === "outline" &&
          "border border-border/70 bg-card/72 text-foreground shadow-sm shadow-shadow-soft hover:-translate-y-0.5 hover:bg-card hover:shadow-md",
        variant === "ghost" && "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        variant === "quiet" &&
          "bg-muted/54 text-muted-foreground hover:bg-muted/78 hover:text-foreground",
        variant === "destructive" &&
          "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/16 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-destructive/22",
        size === "default" && "h-11 px-5 py-2.5 lg:h-10 lg:px-4 lg:py-2",
        size === "sm" && "h-11 rounded-2xl px-3.5 text-xs sm:h-9 lg:rounded-[0.75rem]",
        size === "lg" && "h-12 px-6 text-base lg:h-11 lg:px-5",
        size === "icon" && "size-11 p-0 sm:size-10 lg:size-9",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-border/58 bg-card/88 text-card-foreground shadow-xl shadow-shadow-soft backdrop-blur-sm transition-shadow duration-300 lg:rounded-[1.25rem]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-2 px-6 pb-0 pt-6 lg:px-5 lg:pt-5", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "text-xl font-semibold leading-tight tracking-normal text-foreground",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 lg:p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2 px-6 pb-6 pt-0 lg:px-5 lg:pb-5", className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "default",
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "muted" | "success" | "warning" | "danger" | "outline";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium leading-none",
        tone === "default" && "border-transparent bg-primary/14 text-primary",
        tone === "muted" && "border-transparent bg-muted/72 text-muted-foreground",
        tone === "success" && "border-transparent bg-success/14 text-success",
        tone === "warning" && "border-transparent bg-warning/16 text-warning",
        tone === "danger" && "border-transparent bg-destructive/14 text-destructive",
        tone === "outline" && "border-border/68 bg-card/62 text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export const Label = forwardRef<
  ElementRef<typeof LabelPrimitive.Root>,
  ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("text-sm font-medium leading-none text-muted-foreground", className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-2xl border-0 bg-input-surface px-4 py-3 text-sm text-foreground shadow-inner shadow-shadow-inset transition-all duration-200 placeholder:text-muted-foreground/72 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-50 lg:h-10 lg:rounded-[0.75rem] lg:px-3.5 lg:py-2",
        className
      )}
      {...props}
    />
  );
}

type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

function parseSelectOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  for (const child of Array.isArray(children) ? children : [children]) {
    if (!isValidElement(child)) continue;
    const element = child as ReactElement<{
      value?: string | number;
      disabled?: boolean;
      children?: ReactNode;
    }>;
    if (element.type === "option") {
      options.push({
        value: String(element.props.value ?? ""),
        label: element.props.children,
        disabled: element.props.disabled,
      });
      continue;
    }
    if (element.props.children) {
      options.push(...parseSelectOptions(element.props.children));
    }
  }
  return options;
}

type SelectProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

export function Select({
  value,
  defaultValue,
  onChange,
  onValueChange,
  children,
  className,
  disabled,
  ...props
}: SelectProps) {
  const options = parseSelectOptions(children);
  const selected = options.find((option) => option.value === value);

  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      onValueChange={(nextValue) => {
        onValueChange?.(nextValue);
        onChange?.({ target: { value: nextValue } });
      }}
    >
      <SelectPrimitive.Trigger
        id={props.id}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-3 rounded-2xl border-0 bg-input-surface px-4 py-3 text-left text-sm text-foreground shadow-inner shadow-shadow-inset transition-all duration-200 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-50 lg:h-10 lg:rounded-[0.75rem] lg:px-3.5 lg:py-2",
          className
        )}
        {...props}
      >
        <SelectPrimitive.Value>{selected?.label}</SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="z-50 overflow-hidden rounded-3xl border border-border/64 bg-popover text-popover-foreground shadow-2xl shadow-shadow-strong lg:rounded-[1rem]">
          <SelectPrimitive.ScrollUpButton className="flex h-8 items-center justify-center text-muted-foreground">
            <ChevronUp className="size-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex cursor-default select-none items-center gap-2 rounded-2xl px-3 py-2.5 pl-9 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground data-[disabled]:opacity-45 lg:rounded-[0.75rem] lg:py-2"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-3 inline-flex items-center">
                  <Check className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-8 items-center justify-center text-muted-foreground">
            <ChevronDown className="size-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export const Checkbox = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer size-11 shrink-0 rounded-2xl bg-input-surface shadow-inner shadow-shadow-inset ring-1 ring-border/64 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground sm:size-5",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="size-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export const RadioGroup = RadioGroupPrimitive.Root;

export const RadioGroupItem = forwardRef<
  ElementRef<typeof RadioGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "aspect-square size-5 rounded-full bg-input-surface shadow-inner shadow-shadow-inset ring-1 ring-border/64 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:ring-primary",
      className
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="size-2.5 fill-primary text-primary" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-11 w-14 shrink-0 cursor-pointer items-center rounded-full bg-muted px-1 shadow-inner shadow-shadow-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary sm:h-6 sm:w-11 sm:px-0",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-6 rounded-full bg-card shadow-md shadow-shadow-soft transition-transform data-[state=checked]:translate-x-6 sm:size-5 sm:translate-x-0.5 sm:data-[state=checked]:translate-x-5" />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-32 w-full rounded-3xl border-0 bg-input-surface px-4 py-3 text-sm leading-6 text-foreground shadow-inner shadow-shadow-inset transition-all placeholder:text-muted-foreground/72 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-50 lg:rounded-[1rem] lg:px-3.5 lg:py-2.5",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export function FieldLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-2 inline-flex text-sm font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export function Alert({
  className,
  tone = "default",
  children,
}: {
  className?: string;
  tone?: "default" | "danger" | "success" | "warning";
  children: ReactNode;
}) {
  const Icon =
    tone === "danger" || tone === "warning" ? TriangleAlert : tone === "success" ? Check : Info;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-3xl border px-4 py-3 text-sm leading-6 shadow-sm lg:rounded-[1rem] lg:px-3.5 lg:py-2.5",
        tone === "default" && "border-border/60 bg-muted/62 text-foreground",
        tone === "danger" && "border-destructive/22 bg-destructive/11 text-foreground",
        tone === "success" && "border-success/22 bg-success/11 text-foreground",
        tone === "warning" && "border-warning/24 bg-warning/12 text-foreground",
        className
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "default" && "text-primary"
        )}
      />
      <div>{children}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-4 animate-spin text-primary", className)} aria-hidden />;
}

export const Separator = forwardRef<
  ElementRef<typeof SeparatorPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "shrink-0 bg-border/72 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
      className
    )}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border/70 bg-muted/36 px-6 py-14 text-center shadow-inner shadow-shadow-inset lg:rounded-[1rem] lg:py-10">
      <div className="rounded-full bg-primary/12 p-3 text-primary">
        <Info className="size-5" />
      </div>
      <div className="space-y-2">
        <div className="text-lg font-semibold">{title}</div>
        {description ? (
          <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-2xl bg-muted/72", className)} {...props} />;
}

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full caption-bottom text-sm", className)} {...props} />;
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-border/58", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border/46 transition-colors duration-200 hover:bg-muted/38",
        className
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:h-10 lg:px-3",
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("p-4 align-middle lg:px-3 lg:py-3", className)} {...props} />;
}

export function CodeBlock({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <pre
      className={cn(
        "admin-scrollbar overflow-x-auto rounded-3xl border border-border/58 bg-code-surface p-4 text-xs leading-6 shadow-inner shadow-shadow-inset lg:rounded-[1rem]",
        className
      )}
    >
      <code>{children}</code>
    </pre>
  );
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid max-h-[min(88vh,760px)] w-[min(calc(100vw-2rem),34rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-border/60 bg-card text-card-foreground shadow-2xl shadow-shadow-strong outline-none lg:rounded-[1rem]",
          className
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
            <X className="size-4" />
            <span className="sr-only">关闭</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-2 px-6 pt-6", className)} {...props} />
);
export const DialogFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 px-6 pb-6 pt-4 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
);
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export const Drawer = DrawerPrimitive.Root;
export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerPortal = DrawerPrimitive.Portal;
export const DrawerHandle = DrawerPrimitive.Handle;
export const DrawerTitle = DrawerPrimitive.Title;
export const DrawerDescription = DrawerPrimitive.Description;

export const DrawerOverlay = forwardRef<
  ElementRef<typeof DrawerPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-scrim/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out",
      className
    )}
    {...props}
  />
));
DrawerOverlay.displayName = "DrawerOverlay";

export const DrawerContent = forwardRef<
  ElementRef<typeof DrawerPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPrimitive.Portal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 max-h-[82vh] overflow-hidden rounded-t-3xl border-x-0 border-b-0 border-t border-border/60 bg-card pb-[max(env(safe-area-inset-bottom),0.75rem)] text-card-foreground shadow-2xl shadow-shadow-strong outline-none",
        className
      )}
      {...props}
    >
      {children}
    </DrawerPrimitive.Content>
  </DrawerPrimitive.Portal>
));
DrawerContent.displayName = "DrawerContent";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-8 text-xl font-semibold">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-sm leading-6 text-muted-foreground">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuSubTrigger = DropdownMenuPrimitive.SubTrigger;
export const DropdownMenuSubContent = DropdownMenuPrimitive.SubContent;
export const DropdownMenuCheckboxItem = DropdownMenuPrimitive.CheckboxItem;
export const DropdownMenuRadioItem = DropdownMenuPrimitive.RadioItem;
export const DropdownMenuLabel = DropdownMenuPrimitive.Label;
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator;

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-44 overflow-hidden rounded-3xl border border-border/60 bg-popover p-1.5 text-popover-foreground shadow-2xl shadow-shadow-strong lg:rounded-[1rem]",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-2xl px-3 py-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground data-[disabled]:opacity-45 lg:rounded-[0.75rem] lg:py-1.5",
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 rounded-3xl border border-border/60 bg-popover p-4 text-popover-foreground shadow-2xl shadow-shadow-strong outline-none lg:rounded-[1rem] lg:p-3",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export const Tabs = TabsPrimitive.Root;
export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center rounded-2xl bg-muted/68 p-1 shadow-inner shadow-shadow-inset lg:rounded-[0.75rem]",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium text-muted-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:shadow-shadow-soft disabled:pointer-events-none disabled:opacity-50 sm:min-h-9 lg:min-h-8 lg:rounded-[0.75rem] lg:px-3 lg:py-1.5",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = TabsPrimitive.Content;

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 rounded-2xl bg-foreground px-3 py-2 text-xs font-medium text-background shadow-lg shadow-shadow-strong",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
