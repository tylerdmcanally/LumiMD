'use client';

import * as React from 'react';
import { Clock, Plus, Trash2, Bell, AlertTriangle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api/client';
import type { MedicationReminder } from '@/lib/api/hooks';

interface ReminderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    medication: {
        id: string;
        name: string;
        dose?: string | null;
    } | null;
    existingReminder?: MedicationReminder | null;
}

function formatTimeDisplay(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function timeToHHMM(hour: number, minute: number, isPM: boolean): string {
    let h = isPM && hour !== 12 ? hour + 12 : hour;
    if (!isPM && hour === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function parseTimeHHMM(time: string): { hour: number; minute: number; isPM: boolean } {
    const [hours, minutes] = time.split(':').map(Number);
    const isPM = hours >= 12;
    const displayHour = hours % 12 || 12;
    return { hour: displayHour, minute: minutes, isPM };
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 15, 30, 45];

export function ReminderDialog({
    open,
    onOpenChange,
    medication,
    existingReminder,
}: ReminderDialogProps) {
    const queryClient = useQueryClient();
    const [times, setTimes] = React.useState<string[]>(['08:00']);

    // Reset times when dialog opens
    React.useEffect(() => {
        if (open) {
            setTimes(existingReminder?.times?.length ? [...existingReminder.times] : ['08:00']);
        }
    }, [open, existingReminder]);

    const createReminder = useMutation({
        mutationFn: async (data: { medicationId: string; times: string[] }) => {
            return api.medicationReminders.create(data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['medication-reminders'] });
            toast.success('Reminder created');
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast.error(error?.message || 'Failed to create reminder');
        },
    });

    const updateReminder = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: { times: string[]; enabled: boolean } }) => {
            return api.medicationReminders.update(id, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['medication-reminders'] });
            toast.success('Reminder updated');
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast.error(error?.message || 'Failed to update reminder');
        },
    });

    const deleteReminder = useMutation({
        mutationFn: async (id: string) => {
            return api.medicationReminders.delete(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['medication-reminders'] });
            toast.success('Reminder removed');
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast.error(error?.message || 'Failed to remove reminder');
        },
    });

    const handleAddTime = () => {
        if (times.length >= 4) return;
        const lastTime = times[times.length - 1] || '08:00';
        const [hours] = lastTime.split(':').map(Number);
        const newHours = (hours + 12) % 24;
        const newTime = `${newHours.toString().padStart(2, '0')}:00`;
        setTimes([...times, newTime]);
    };

    const handleRemoveTime = (index: number) => {
        if (times.length <= 1) return;
        setTimes(times.filter((_, i) => i !== index));
    };

    const handleTimeChange = (index: number, hour: number, minute: number, isPM: boolean) => {
        const newTime = timeToHHMM(hour, minute, isPM);
        const newTimes = [...times];
        newTimes[index] = newTime;
        // Sort chronologically
        newTimes.sort((a, b) => {
            const [aH, aM] = a.split(':').map(Number);
            const [bH, bM] = b.split(':').map(Number);
            return (aH * 60 + aM) - (bH * 60 + bM);
        });
        setTimes(newTimes);
    };

    const handleSave = () => {
        if (!medication) return;
        if (existingReminder) {
            updateReminder.mutate({ id: existingReminder.id, data: { times, enabled: true } });
        } else {
            createReminder.mutate({ medicationId: medication.id, times });
        }
    };

    const handleDelete = () => {
        if (!existingReminder) return;
        deleteReminder.mutate(existingReminder.id);
    };

    const isLoading = createReminder.isPending || updateReminder.isPending || deleteReminder.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5 text-brand-primary" />
                        {existingReminder ? 'Edit Reminder' : 'Set Reminder'}
                    </DialogTitle>
                    <DialogDescription>
                        {medication?.name}
                        {medication?.dose && ` - ${medication.dose}`}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <Label className="text-sm font-medium text-text-secondary uppercase tracking-wide">
                        Reminder Times
                    </Label>

                    <div className="space-y-3">
                        {times.map((time, index) => {
                            const { hour, minute, isPM } = parseTimeHHMM(time);
                            return (
                                <div key={index} className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 flex-1 p-3 rounded-lg bg-background-subtle border border-border-light">
                                        <Clock className="h-4 w-4 text-text-tertiary" />

                                        <Select
                                            value={hour.toString()}
                                            onValueChange={(val) => handleTimeChange(index, parseInt(val), minute, isPM)}
                                        >
                                            <SelectTrigger className="w-20 border-0 bg-transparent focus:ring-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {HOURS.map((h) => (
                                                    <SelectItem key={h} value={h.toString()}>
                                                        {h}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        <span className="text-text-secondary font-medium">:</span>

                                        <Select
                                            value={minute.toString()}
                                            onValueChange={(val) => handleTimeChange(index, hour, parseInt(val), isPM)}
                                        >
                                            <SelectTrigger className="w-20 border-0 bg-transparent focus:ring-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {MINUTES.map((m) => (
                                                    <SelectItem key={m} value={m.toString()}>
                                                        {m.toString().padStart(2, '0')}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        <Select
                                            value={isPM ? 'PM' : 'AM'}
                                            onValueChange={(val) => handleTimeChange(index, hour, minute, val === 'PM')}
                                        >
                                            <SelectTrigger className="w-20 border-0 bg-transparent focus:ring-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="AM">AM</SelectItem>
                                                <SelectItem value="PM">PM</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {times.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-error hover:text-error hover:bg-error/10"
                                            onClick={() => handleRemoveTime(index)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {times.length < 4 && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={handleAddTime}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add another time
                        </Button>
                    )}

                    {/* Disclaimer */}
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-light/20 text-warning-dark text-sm">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>
                            Reminders are for convenience only and are not a substitute for medical advice.
                            Always follow your healthcare provider&apos;s instructions.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    {existingReminder && (
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-error hover:text-error"
                            onClick={handleDelete}
                            disabled={isLoading}
                        >
                            Remove reminder
                        </Button>
                    )}
                    <div className="flex-1" />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        onClick={handleSave}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Saving...' : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
