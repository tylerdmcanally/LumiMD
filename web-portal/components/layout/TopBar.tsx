'use client';

import * as React from 'react';
import { Search, Bell, Menu } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TopBarProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onMenuClick?: () => void;
}

export function TopBar({ title, subtitle, actions, onMenuClick }: TopBarProps) {
  const [searchQuery, setSearchQuery] = React.useState('');

  return (
    <header className="sticky top-0 z-sticky border-b border-border-light bg-surface/80 backdrop-blur-xl">
      <div className="flex h-16 lg:h-topbar items-center gap-3 lg:gap-6 px-4 lg:px-6">
        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden shrink-0"
          onClick={onMenuClick}
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Page Title */}
        {title && (
          <div className="hidden lg:block shrink-0">
            <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
            {subtitle && (
              <p className="text-sm text-text-muted">{subtitle}</p>
            )}
          </div>
        )}

        {/* Search Bar - Hidden on small mobile */}
        <div className="hidden sm:flex flex-1 max-w-md">
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            inputSize="md"
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>

        {/* Spacer on mobile when no search */}
        <div className="flex-1 sm:hidden" />

        {/* Actions */}
        <div className="flex items-center gap-2 lg:gap-3 shrink-0">
          {/* Search Button on Mobile */}
          <Button
            variant="ghost"
            size="sm"
            className="sm:hidden"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Button>

          {actions}

          {/* Notifications */}
          <Button
            variant="ghost"
            size="sm"
            className="relative"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {/* Notification Badge */}
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-error" />
          </Button>
        </div>
      </div>
    </header>
  );
}

