import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils/helpers"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-[#AC244D] text-white hover:bg-[#8F1D40]",
        outline: "border-2 border-[#AC244D] text-[#AC244D] hover:bg-[#AC244D] hover:text-white",
        ghost: "hover:bg-pink-50 hover:text-[#8F1D40]",
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    if (asChild) {
      // If asChild is true, we need to clone the child with the button styles
      // This is a simplified version - for production, consider using Slot from @radix-ui/react-slot
      return React.cloneElement(props.children as React.ReactElement, {
        className: cn(buttonVariants({ variant, size, className })),
        ref,
      })
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
