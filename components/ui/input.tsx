import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-xl border border-glass-border " +
          "bg-white/50 dark:bg-white/5 backdrop-blur-glass-sm px-4 py-2 " +
          "text-sm placeholder:text-muted-foreground " +
          "focus:outline-none focus:ring-2 focus:ring-foreground/20 " +
          "focus:border-foreground/40 " +
          "disabled:cursor-not-allowed disabled:opacity-50 " +
          "transition-all duration-200 ease-apple " +
          // Touch devices: większy + większa czcionka (16px = brak zoom na iOS focus)
          "pointer-coarse:h-12 pointer-coarse:text-base",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
