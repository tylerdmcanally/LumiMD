import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { ensureResourceOwnerAccessOrReject } from '../../middlewares/resourceAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

type RegisterCareFollowThroughRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
};

type FollowThroughItemStatus = 'completed' | 'pending' | 'overdue';

interface FollowThroughItem {
    id: string;
    type: 'medication_started' | 'medication_stopped' | 'medication_changed' | 'action_item';
    description: string;
    status: FollowThroughItemStatus;
    dueAt: string | null;
    completedAt: string | null;
    details: Record<string, unknown> | null;
}

function toDateSafe(value: unknown): Date | null {
    if (!value) return null;
    try {
        if (
            typeof value === 'object' &&
            value !== null &&
            typeof (value as { toDate?: unknown }).toDate === 'function'
        ) {
            return (value as { toDate: () => Date }).toDate();
        }
        const date = new Date(value as string | number | Date);
        if (Number.isNaN(date.getTime())) return null;
        return date;
    } catch {
        return null;
    }
}

export function registerCareFollowThroughRoutes(
    router: Router,
    options: RegisterCareFollowThroughRoutesOptions,
): void {
    const { getDb } = options;
    const getServices = () => createDomainServiceContainer({ db: getDb() });

    // GET /v1/care/:patientId/visits/:visitId/follow-through
    router.get('/:patientId/visits/:visitId/follow-through', requireAuth, async (req: AuthRequest, res) => {
        const caregiverId = req.user!.uid;
        const { patientId, visitId } = req.params;

        try {
            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res))) {
                return;
            }

            const { visitService, actionService } = getServices();

            // Fetch visit
            const visit = await visitService.getById(visitId);
            if (
                !ensureResourceOwnerAccessOrReject(patientId, visit, res, {
                    resourceName: 'visit',
                    notFoundCode: 'not_found',
                    forbiddenCode: 'not_found',
                    notFoundMessage: 'Visit not found',
                    message: 'Visit not found',
                })
            ) {
                return;
            }

            const visitData = visit as Record<string, unknown>;
            const items: FollowThroughItem[] = [];
            const todayDateStr = new Date().toISOString().slice(0, 10);

            // 1. Medication changes from confirmedMedicationChanges (or pendingMedicationChanges)
            const medChanges =
                (visitData.confirmedMedicationChanges as Record<string, unknown[]> | null) ||
                (visitData.pendingMedicationChanges as Record<string, unknown[]> | null) ||
                (visitData.medications as Record<string, unknown[]> | null);

            if (medChanges && typeof medChanges === 'object') {
                const started = Array.isArray(medChanges.started) ? medChanges.started : [];
                const stopped = Array.isArray(medChanges.stopped) ? medChanges.stopped : [];
                const changed = Array.isArray(medChanges.changed) ? medChanges.changed : [];

                for (const med of started) {
                    const m = med as Record<string, unknown>;
                    const name = typeof m.name === 'string' ? m.name : 'Unknown medication';
                    const dose = typeof m.dose === 'string' ? m.dose : '';
                    items.push({
                        id: `med_started_${name.toLowerCase().replace(/\s+/g, '_')}`,
                        type: 'medication_started',
                        description: dose ? `Start ${name} ${dose}` : `Start ${name}`,
                        status: 'completed', // Medication starts are committed at confirmation
                        dueAt: null,
                        completedAt: visitData.medicationConfirmedAt
                            ? String(visitData.medicationConfirmedAt)
                            : null,
                        details: { name, dose, frequency: m.frequency || null },
                    });
                }

                for (const med of stopped) {
                    const m = med as Record<string, unknown>;
                    const name = typeof m.name === 'string' ? m.name : 'Unknown medication';
                    items.push({
                        id: `med_stopped_${name.toLowerCase().replace(/\s+/g, '_')}`,
                        type: 'medication_stopped',
                        description: `Stop ${name}`,
                        status: 'completed',
                        dueAt: null,
                        completedAt: visitData.medicationConfirmedAt
                            ? String(visitData.medicationConfirmedAt)
                            : null,
                        details: { name, note: m.note || null },
                    });
                }

                for (const med of changed) {
                    const m = med as Record<string, unknown>;
                    const name = typeof m.name === 'string' ? m.name : 'Unknown medication';
                    const dose = typeof m.dose === 'string' ? m.dose : '';
                    items.push({
                        id: `med_changed_${name.toLowerCase().replace(/\s+/g, '_')}`,
                        type: 'medication_changed',
                        description: dose ? `Change ${name} to ${dose}` : `Change ${name}`,
                        status: 'completed',
                        dueAt: null,
                        completedAt: visitData.medicationConfirmedAt
                            ? String(visitData.medicationConfirmedAt)
                            : null,
                        details: { name, dose, frequency: m.frequency || null, note: m.note || null },
                    });
                }
            }

            // 2. Action items linked to this visit
            const allActions = await actionService.listAllForUser(patientId, {
                sortDirection: 'desc',
            });

            const visitActions = allActions.filter(
                (a) => a.visitId === visitId,
            );

            for (const action of visitActions) {
                const dueDate = toDateSafe(action.dueAt);
                const dueDateStr = dueDate ? dueDate.toISOString().slice(0, 10) : null;
                const completedAt = toDateSafe(action.completedAt);

                let status: FollowThroughItemStatus;
                if (action.completed) {
                    status = 'completed';
                } else if (dueDateStr && dueDateStr < todayDateStr) {
                    status = 'overdue';
                } else {
                    status = 'pending';
                }

                items.push({
                    id: action.id,
                    type: 'action_item',
                    description: action.description || action.text || 'Follow-up item',
                    status,
                    dueAt: dueDate ? dueDate.toISOString() : null,
                    completedAt: completedAt ? completedAt.toISOString() : null,
                    details: {
                        actionType: action.type || null,
                        notes: action.notes || null,
                        source: action.source || null,
                    },
                });
            }

            // 3. Build summary
            const summary = {
                total: items.length,
                completed: items.filter((i) => i.status === 'completed').length,
                overdue: items.filter((i) => i.status === 'overdue').length,
                pending: items.filter((i) => i.status === 'pending').length,
            };

            res.set('Cache-Control', 'private, no-cache');
            res.json({ items, summary });
        } catch (error) {
            functions.logger.error('[care] Error fetching follow-through:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch follow-through data',
            });
        }
    });
}
