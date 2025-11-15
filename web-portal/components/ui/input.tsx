import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const inputVariants = cva(
  'flex w-full rounded-md border bg-surface px-4 py-3 text-[16px] text-text-primary placeholder:text-text-muted transition-smooth file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-background-subtle',
  {
    variants: {
      variant: {
        default:
          'border-border focus-visible:border-brand-primary focus-visible:ring-brand-primary/20',
        error:
          'border-error focus-visible:border-error focus-visible:ring-error/20',
        success:
          'border-success focus-visible:border-success focus-visible:ring-success/20',
      },
      inputSize: {
        sm: 'h-9 px-3 py-2 text-[16px]',
        md: 'h-11 px-4 py-3 text-[16px]',
        lg: 'h-[52px] px-4 py-3 text-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'md',
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      inputSize,
      type,
      leftIcon,
      rightIcon,
      error,
      id,
      ...props
    },
    ref
  ) => {
    const hasError = Boolean(error);
    const effectiveVariant = hasError ? 'error' : variant;
    const errorId = id ? `${id}-error` : undefined;

    if (leftIcon || rightIcon) {
      return (
        <div className="relative w-full">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-text-muted" aria-hidden="true">
              {leftIcon}
            </div>
          )}
          <input
            type={type}
            id={id}
            className={cn(
              inputVariants({ variant: effectiveVariant, inputSize }),
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            ref={ref}
            aria-invalid={hasError ? 'true' : undefined}
            aria-describedby={hasError && errorId ? errorId : undefined}
            {...props}
          />
          {rightIcon && (
            <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-text-muted" aria-hidden="true">
              {rightIcon}
            </div>
          )}
          {hasError && errorId && (
            <p id={errorId} className="mt-1.5 text-sm text-error animate-fade-in-up" role="alert">
              {error}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="w-full">
        <input
          type={type}
          id={id}
          className={cn(
            inputVariants({ variant: effectiveVariant, inputSize }),
            className
          )}
          ref={ref}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError && errorId ? errorId : undefined}
          {...props}
        />
        {hasError && errorId && (
          <p id={errorId} className="mt-1.5 text-sm text-error animate-fade-in-up" role="alert">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input, inputVariants };
