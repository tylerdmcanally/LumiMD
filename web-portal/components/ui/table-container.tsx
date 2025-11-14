'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TableContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * TableContainer - Prevents horizontal overflow on mobile/tablet
 * Wraps tables with horizontal scroll on small screens
 */
export function TableContainer({ children, className }: TableContainerProps) {
  return (
    <div className={cn('w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0', className)}>
      <div className="min-w-full inline-block align-middle">
        {children}
      </div>
    </div>
  );
}
