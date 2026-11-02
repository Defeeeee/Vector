"use client";

import { Loader2 } from "lucide-react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface LoadingButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  isLoading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export function LoadingButton({
  isLoading,
  loadingText,
  children,
  className,
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <motion.button
      whileHover={!disabled && !isLoading ? { scale: 1.01 } : {}}
      whileTap={!disabled && !isLoading ? { scale: 0.99 } : {}}
      disabled={disabled || isLoading}
      className={cn(
        "relative flex items-center justify-center transition-all disabled:opacity-50",
        className
      )}
      {...props}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}
      <div className={cn(isLoading && "opacity-0 flex items-center justify-center")}>
        {children}
      </div>
      {isLoading && loadingText && (
        <span className="sr-only">{loadingText}</span>
      )}
    </motion.button>
  );
}
