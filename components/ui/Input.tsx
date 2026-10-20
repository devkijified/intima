import * as React from "react"
import { cn } from "@/lib/utils/helpers"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm text-charcoal placeholder:text-neutral-400 shadow-[inset_0_1px_3px_rgba(26,26,26,0.04)] focus:border-[#AC244D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#AC244D]/30 disabled:opacity-50 transition-colors",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
