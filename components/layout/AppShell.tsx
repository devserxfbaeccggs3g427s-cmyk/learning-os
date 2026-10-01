"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, ListTree, BookOpen, Settings, BrainCircuit, Search, Home as HomeIco } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Mobile only primary tabs */
  primary?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: HomeIco, primary: true },
  { href: "/roadmap", label: "Roadmap", icon: ListTree, primary: true },
  { href: "/calendar", label: "Calendar", icon: Calendar, primary: true },
  { href: "/review", label: "Review", icon: BookOpen, primary: true },
  { href: "/ai", label: "AI", icon: BrainCircuit, primary: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

const SECONDARY: NavItem[] = [
  { href: "/tasks", label: "All Tasks", icon: ListTree },
  { href: "/search", label: "Search", icon: Search },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 border-r border-border bg-card/40 lg:block">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Link href="/" className="font-semibold tracking-tight">
            <span className="text-primary">Learning</span> <span className="text-foreground">OS</span>
          </Link>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <div className="my-2 border-t border-border" />
          {SECONDARY.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-0 bottom-12 border-t border-border p-3 text-xs text-muted-foreground">
          <Link href="/search" className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 hover:bg-accent">
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-56">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur lg:hidden">
          <Link href="/" className="font-semibold tracking-tight">
            <span className="text-primary">Learning</span> OS
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/search" className="rounded-md p-2 hover:bg-accent" aria-label="Search">
              <Search className="h-4 w-4" />
            </Link>
            <Link href="/settings" className="rounded-md p-2 hover:bg-accent" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full pb-20 lg:pb-6">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur lg:hidden">
          {NAV.filter((n) => n.primary).map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}