import { forwardRef, createElement, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "default" | "secondary" | "ghost" | "outline" | "destructive" | "link";
type Size = "default" | "sm" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  link: "text-primary underline-offset-4 hover:underline",
};

const SIZES: Record<Size, string> = {
  default: "h-9 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-6",
  icon: "h-9 w-9",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /**
   * `asChild` renders the button as its child (e.g. a Next.js `<Link>`),
   * preserving the button styling. A minimal shadcn-style shim — only a
   * single React element child is supported.
   */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", asChild, children, ...rest },
  ref,
) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
  if (asChild) {
    const child = children as unknown;
    if (child && typeof child === "object" && "props" in (child as object) && "type" in (child as object)) {
      const element = child as { type: unknown; props: Record<string, unknown> };
      const merged: Record<string, unknown> = {
        ...element.props,
        className: cn(classes, element.props.className as string | undefined),
      };
      return createElement(element.type as React.ElementType, merged);
    }
  }
  return (
    <button ref={ref} className={classes} {...rest}>
      {children}
    </button>
  );
});