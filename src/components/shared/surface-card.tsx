import { PropsWithChildren } from "react";
import clsx from "clsx";

export function SurfaceCard({
  children,
  className,
  tone = "default",
}: PropsWithChildren<{ className?: string; tone?: "default" | "accent" | "ink" }>) {
  return <section className={clsx("surface-card", `surface-card--${tone}`, className)}>{children}</section>;
}
