"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface ButtonProps extends HTMLMotionProps<"button"> {
    variant?: "primary" | "ghost" | "outline";
    isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", isLoading, children, ...props }, ref) => {

        const variants = {
            primary: "bg-[#254153] text-white hover:bg-[#1e3443] shadow-lg hover:shadow-[#254153]/30",
            ghost: "bg-transparent text-[#254153] hover:bg-[#254153]/10",
            outline: "border-2 border-[#254153] text-[#254153] hover:bg-[#254153] hover:text-white"
        } as const;

        return (
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    "inline-flex items-center justify-center rounded-xl h-12 px-6 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#254153] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    variants[variant as keyof typeof variants] || variants.primary,
                    className
                )}
                ref={ref}
                {...props}
            >
                {isLoading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                    children
                )}
            </motion.button>
        );
    }
);
Button.displayName = "Button";

export { Button };
