'use client';

import { ChangeEvent } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type VisitFiltersState = {
  search: string;
  status: string;
  provider: string;
  location: string;
  specialty: string;
  folder: string;
  tag: string;
  sortBy: 'date_desc' | 'date_asc' | 'provider_asc' | 'provider_desc';
};

export type VisitFilterOptions = {
  statuses: string[];
  providers: string[];
  locations: string[];
  specialties: string[];
  folders: string[];
  tags: string[];
};

type VisitFiltersProps = {
  filters: VisitFiltersState;
  onChange: (next: VisitFiltersState) => void;
  options: VisitFilterOptions;
};

function updateFilter<K extends keyof VisitFiltersState>(
  filters: VisitFiltersState,
  onChange: (next: VisitFiltersState) => void,
  key: K,
  value: VisitFiltersState[K],
) {
  onChange({ ...filters, [key]: value });
}

export function VisitFilters({
  filters,
  onChange,
  options,
}: VisitFiltersProps) {
  const handleTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateFilter(filters, onChange, 'search', event.target.value);
  };

  return (
    <div className="border rounded-lg p-6 bg-card space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="md:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
            Search
          </label>
          <Input
            value={filters.search}
            onChange={handleTextChange}
            placeholder="Search visits, diagnoses, medications, or notes"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
            Sort by
          </label>
          <Select
            value={filters.sortBy}
            onValueChange={(value: VisitFiltersState['sortBy']) =>
              updateFilter(filters, onChange, 'sortBy', value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest first</SelectItem>
              <SelectItem value="date_asc">Oldest first</SelectItem>
              <SelectItem value="provider_asc">Provider A → Z</SelectItem>
              <SelectItem value="provider_desc">Provider Z → A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(value) => updateFilter(filters, onChange, 'status', value)}
          options={options.statuses}
          placeholder="All statuses"
        />
        <FilterSelect
          label="Provider"
          value={filters.provider}
          onChange={(value) =>
            updateFilter(filters, onChange, 'provider', value)
          }
          options={options.providers}
          placeholder="All providers"
        />
        <FilterSelect
          label="Location"
          value={filters.location}
          onChange={(value) =>
            updateFilter(filters, onChange, 'location', value)
          }
          options={options.locations}
          placeholder="All locations"
        />
        <FilterSelect
          label="Specialty"
          value={filters.specialty}
          onChange={(value) =>
            updateFilter(filters, onChange, 'specialty', value)
          }
          options={options.specialties}
          placeholder="All specialties"
        />
        <FilterSelect
          label="Folder"
          value={filters.folder}
          onChange={(value) => updateFilter(filters, onChange, 'folder', value)}
          options={options.folders}
          placeholder="All folders"
        />
        <FilterSelect
          label="Tag"
          value={filters.tag}
          onChange={(value) => updateFilter(filters, onChange, 'tag', value)}
          options={options.tags}
          placeholder="All tags"
        />
      </div>
    </div>
  );
}

type FilterSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
};

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: FilterSelectProps) {
  const normalizedOptions = ['all', ...options.filter(Boolean)];

  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{placeholder}</SelectItem>
          {normalizedOptions
            .filter((option) => option !== 'all')
            .map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
