'use client';

import * as React from 'react';
import { Menu } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TopBarProps {
  onMenuClick?: () => void;
  className?: string;
}

export function TopBar({ onMenuClick, className }: TopBarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-sticky bg-surface/80 backdrop-blur-xl border-b border-border-light lg:hidden',
        className
      )}
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 0.5rem)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div className="flex h-14 items-center gap-3 px-4">
        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-10 w-10 p-0"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </Button>

        {/* Logo */}
        <div className="flex-1 flex justify-center">
          <span className="text-2xl font-black tracking-tight text-brand-primary leading-none">
            LumiMD
          </span>
        </div>

        {/* Spacer for symmetry */}
        <div className="h-10 w-10 shrink-0" />
      </div>
    </header>
  );
}

