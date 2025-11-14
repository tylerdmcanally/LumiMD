'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const mergeRefs = <T,>(...refs: (React.Ref<T> | undefined)[]) => {
  return (value: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(value);
      } else if (ref != null) {
        (ref as React.MutableRefObject<T | null>).current = value;
      }
    });
  };
};

type VisualViewportSnapshot = {
  height: number | null;
  offsetTop: number;
  innerHeight: number | null;
  baselineHeight: number | null;
};

function useVisualViewportSnapshot(): VisualViewportSnapshot {
  const baselineRef = React.useRef<number | null>(null);
  const [viewport, setViewport] = React.useState<{ height: number | null; offsetTop: number }>({
    height: null,
    offsetTop: 0,
  });
  const [innerHeight, setInnerHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setInnerHeight(window.innerHeight);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const { visualViewport } = window;

    const updateViewport = () => {
      if (visualViewport == null) {
        return;
      }

      if (
        visualViewport.offsetTop === 0 &&
        baselineRef.current !== null &&
        Math.abs(visualViewport.height - baselineRef.current) > 120
      ) {
        baselineRef.current = visualViewport.height;
      }

      if (
        baselineRef.current === null ||
        visualViewport.height > (baselineRef.current ?? 0) + 32
      ) {
        baselineRef.current = visualViewport.height;
      }

      setViewport({
        height: visualViewport.height,
        offsetTop: visualViewport.offsetTop,
      });
    };

    updateViewport();
    visualViewport.addEventListener('resize', updateViewport);
    visualViewport.addEventListener('scroll', updateViewport);

    return () => {
      visualViewport.removeEventListener('resize', updateViewport);
      visualViewport.removeEventListener('scroll', updateViewport);
    };
  }, []);

  return {
    height: viewport.height,
    offsetTop: viewport.offsetTop,
    innerHeight,
    baselineHeight: baselineRef.current,
  };
}

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-modal bg-overlay backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      'data-[state=closed]:pointer-events-none',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, style, ...props }, ref) => {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const mergedRef = React.useMemo(() => mergeRefs(ref, contentRef), [ref]);
  const { height, offsetTop, innerHeight, baselineHeight } = useVisualViewportSnapshot();

  // Disable dynamic viewport adjustment on mobile and tablet - we use fixed sizing instead
  // Only apply dynamic styles on desktop (lg breakpoint and above - 1024px+)
  const shouldAdapt = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    // Only adapt on desktop (1024px and above)
    if (window.innerWidth < 1024) {
      return false;
    }
    if (!height) {
      return false;
    }
    const baseline = baselineHeight ?? innerHeight ?? height;
    const heightDelta = baseline != null ? baseline - height : 0;
    // Detect keyboard: viewport scrolled OR height decreased by >60px (more sensitive)
    return (offsetTop ?? 0) > 0 || heightDelta > 60;
  }, [baselineHeight, height, innerHeight, offsetTop]);

  const dynamicStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!shouldAdapt || !height) {
      return undefined;
    }
    const offset = Math.max(offsetTop ?? 0, 8);
    const availableHeight = Math.max(height - offset - 16, 280);
    return {
      top: `calc(${offset}px + env(safe-area-inset-top, 0px))`,
      maxHeight: `${availableHeight}px`,
      paddingBottom: '1rem', // Reduce padding when keyboard is open
    };
  }, [height, offsetTop, shouldAdapt]);

  const contentStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!dynamicStyle) {
      return style;
    }
    return {
      ...style,
      ...dynamicStyle,
    };
  }, [dynamicStyle, style]);

  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) {
      return;
    }

    const handleFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !node.contains(target)) {
        return;
      }
      if (typeof target.scrollIntoView !== 'function') {
        return;
      }
      requestAnimationFrame(() => {
        target.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      });
    };

    node.addEventListener('focusin', handleFocus);

    return () => {
      node.removeEventListener('focusin', handleFocus);
    };
  }, []);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={mergedRef}
        style={contentStyle}
        className={cn(
          'fixed inset-x-4 top-4 z-modal w-auto max-w-full rounded-3xl border border-border-light bg-surface shadow-floating',
          'h-[70vh] max-h-[500px] overflow-hidden flex flex-col',
          'lg:h-auto lg:max-h-[85vh]',
          'lg:left-[50%] lg:top-[50%] lg:translate-x-[-50%] lg:translate-y-[-50%] lg:max-w-2xl lg:rounded-2xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
          className
        )}
        {...props}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pt-6 pb-8 lg:p-8 [&_input]:text-base [&_select]:text-base [&_textarea]:text-base">
          <div className="flex flex-col gap-4 lg:gap-6">
            {children}
          </div>
        </div>
        <DialogPrimitive.Close
          className={cn(
            'absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full z-10',
            'bg-background-subtle text-text-tertiary hover:text-text-primary hover:bg-hover',
            'transition-smooth focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            'disabled:pointer-events-none'
          )}
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col gap-2', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-3 lg:flex-row lg:justify-end',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-2xl font-semibold leading-tight tracking-tight text-text-primary',
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-base text-text-secondary hidden lg:block', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
