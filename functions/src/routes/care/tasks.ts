import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
    AuthRequest,
    hasOperatorAccess,
    requireAuth,
    ensureOperatorRestoreReasonOrReject,
} from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { ensureResourceOwnerAccessOrReject } from '../../middlewares/resourceAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';
import type { CareTaskStatus } from '../../services/repositories/careTasks/CareTaskRepository';
import { RepositoryValidationError } from '../../services/repositories/common/errors';
import { RESTORE_REASON_MAX_LENGTH, recordRestoreAuditEvent } from '../../services/restoreAuditService';
import { sanitizePlainText } from '../../utils/inputSanitization';

type RegisterCareTaskRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    pageSizeDefault: number;
    pageSizeMax: number;
    taskTitleMaxLength: number;
    taskDescriptionMaxLength: number;
};

function toISOStringSafe(value: unknown): string | null {
    if (!value) return null;

    try {
        if (
            typeof value === 'object' &&
            value !== null &&
            typeof (value as { toDate?: unknown }).toDate === 'function'
        ) {
            return (value as { toDate: () => Date }).toDate().toISOString();
        }

        const date = new Date(value as string | number | Date);
        if (Number.isNaN(date.getTime())) return null;
        return date.toISOString();
    } catch {
        return null;
    }
}

export function registerCareTaskRoutes(
    router: Router,
    options: RegisterCareTaskRoutesOptions,
): void {
    const {
        getDb,
        pageSizeDefault,
        pageSizeMax,
        taskTitleMaxLength,
        taskDescriptionMaxLength,
    } = options;
    const getCareTaskServices = () => createDomainServiceContainer({ db: getDb() });

    // GET /v1/care/:patientId/tasks
    router.get('/:patientId/tasks', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;
            const statusFilter = req.query.status as string | undefined;
            const { careTaskService } = getCareTaskServices();
            const rawLimit = req.query.limit;
            const cursor =
                typeof req.query.cursor === 'string' && req.query.cursor.trim().length > 0
                    ? req.query.cursor.trim()
                    : null;
            const paginationRequested = rawLimit !== undefined || cursor !== null;

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                message: 'Access denied',
            }))) {
                return;
            }

            const hasSupportedStatusFilter =
                !!statusFilter &&
                ['pending', 'in_progress', 'completed', 'cancelled'].includes(statusFilter);
            const normalizedStatusFilter: CareTaskStatus | undefined = hasSupportedStatusFilter
                ? (statusFilter as CareTaskStatus)
                : undefined;

            let limit = pageSizeDefault;
            if (rawLimit !== undefined) {
                const parsedLimit = parseInt(String(rawLimit), 10);
                if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
                    res.status(400).json({
                        code: 'validation_failed',
                        message: 'limit must be a positive integer',
                    });
                    return;
                }
                limit = Math.min(parsedLimit, pageSizeMax);
            }

            const listOptions = normalizedStatusFilter ? { status: normalizedStatusFilter } : {};
            const summaryTasks = await careTaskService.listAllForCaregiverPatient(
                caregiverId,
                patientId,
                listOptions,
            );

            let taskRecords:
                | Array<FirebaseFirestore.DocumentData & { id: string }>
                | Array<Record<string, unknown>> = [];
            let hasMore = false;
            let nextCursor: string | null = null;

            if (paginationRequested) {
                const page = await careTaskService.listForCaregiverPatient(caregiverId, patientId, {
                    limit,
                    cursor,
                    ...listOptions,
                });
                taskRecords = page.items;
                hasMore = page.hasMore;
                nextCursor = page.nextCursor;

                res.set('X-Has-More', hasMore ? 'true' : 'false');
                res.set('X-Next-Cursor', nextCursor || '');
            } else {
                taskRecords = summaryTasks;
            }

            const now = new Date();
            const tasks = taskRecords.map((data) => {
                return {
                    id: data.id,
                    patientId: data.patientId,
                    caregiverId: data.caregiverId,
                    title: data.title,
                    description: data.description || null,
                    dueDate: toISOStringSafe(data.dueDate),
                    priority: data.priority || 'medium',
                    status: data.status || 'pending',
                    completedAt: toISOStringSafe(data.completedAt),
                    createdAt: toISOStringSafe(data.createdAt) || now.toISOString(),
                    updatedAt: toISOStringSafe(data.updatedAt) || now.toISOString(),
                };
            });

            const summary = {
                pending: summaryTasks.filter((task) => (task.status || 'pending') === 'pending').length,
                inProgress: summaryTasks.filter((task) => task.status === 'in_progress').length,
                completed: summaryTasks.filter((task) => task.status === 'completed').length,
                overdue: summaryTasks.filter((task) => {
                    const status = task.status || 'pending';
                    if (status === 'completed' || status === 'cancelled') {
                        return false;
                    }

                    const dueDate = toISOStringSafe(task.dueDate);
                    if (!dueDate) {
                        return false;
                    }

                    return new Date(dueDate) < now;
                }).length,
            };

            res.set('Cache-Control', 'private, max-age=30');
            res.json({ tasks, summary });
        } catch (error) {
            if (error instanceof RepositoryValidationError) {
                res.status(400).json({
                    code: 'validation_failed',
                    message: 'Invalid cursor',
                });
                return;
            }

            functions.logger.error('[care] Error fetching tasks:', error);
            res.status(500).json({ code: 'server_error', message: 'Failed to fetch tasks' });
        }
    });

    // POST /v1/care/:patientId/tasks
    router.post('/:patientId/tasks', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;
            const { title, description, dueDate, priority } = req.body;
            const { careTaskService } = getCareTaskServices();
            const sanitizedTitle = sanitizePlainText(title, taskTitleMaxLength);

            if (!sanitizedTitle) {
                res.status(400).json({ code: 'invalid_request', message: 'Title is required' });
                return;
            }

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                message: 'Access denied',
            }))) {
                return;
            }

            const now = admin.firestore.FieldValue.serverTimestamp();
            const taskData: Record<string, unknown> = {
                patientId,
                caregiverId,
                title: sanitizedTitle,
                description:
                    sanitizePlainText(description, taskDescriptionMaxLength) || null,
                dueDate: dueDate ? admin.firestore.Timestamp.fromDate(new Date(dueDate)) : null,
                priority: ['high', 'medium', 'low'].includes(priority) ? priority : 'medium',
                status: 'pending',
                deletedAt: null,
                deletedBy: null,
                createdAt: now,
                updatedAt: now,
            };

            const createdTask = await careTaskService.createRecord(taskData);
            res.status(201).json({
                id: createdTask.id,
                patientId: createdTask.patientId,
                caregiverId: createdTask.caregiverId,
                title: createdTask.title,
                description: createdTask.description,
                dueDate: toISOStringSafe(createdTask.dueDate),
                priority: createdTask.priority,
                status: createdTask.status,
                completedAt: null,
                createdAt: toISOStringSafe(createdTask.createdAt) || new Date().toISOString(),
                updatedAt: toISOStringSafe(createdTask.updatedAt) || new Date().toISOString(),
            });
        } catch (error) {
            functions.logger.error('[care] Error creating task:', error);
            res.status(500).json({ code: 'server_error', message: 'Failed to create task' });
        }
    });

    // PATCH /v1/care/:patientId/tasks/:taskId
    router.patch('/:patientId/tasks/:taskId', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const { patientId, taskId } = req.params;
            const { title, description, dueDate, priority, status } = req.body;
            const { careTaskService } = getCareTaskServices();

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                message: 'Access denied',
            }))) {
                return;
            }

            const taskData = await careTaskService.getById(taskId);
            if (!taskData) {
                res.status(404).json({ code: 'not_found', message: 'Task not found' });
                return;
            }

            if (
                !ensureResourceOwnerAccessOrReject(patientId, taskData, res, {
                    resourceName: 'task',
                    ownerField: 'patientId',
                    notFoundMessage: 'Task not found',
                    message: 'Not authorized to modify this task',
                    allowDeleted: true,
                })
            ) {
                return;
            }

            if (
                !ensureResourceOwnerAccessOrReject(caregiverId, taskData, res, {
                    resourceName: 'task',
                    ownerField: 'caregiverId',
                    notFoundMessage: 'Task not found',
                    message: 'Not authorized to modify this task',
                    allowDeleted: true,
                })
            ) {
                return;
            }

            if (taskData.deletedAt) {
                res.status(404).json({ code: 'not_found', message: 'Task not found' });
                return;
            }

            const updateData: Record<string, unknown> = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (typeof title === 'string') {
                const sanitizedTitle = sanitizePlainText(title, taskTitleMaxLength);
                if (!sanitizedTitle) {
                    res.status(400).json({
                        code: 'invalid_request',
                        message: 'Title cannot be empty',
                    });
                    return;
                }
                updateData.title = sanitizedTitle;
            }
            if (typeof description === 'string') {
                updateData.description =
                    sanitizePlainText(description, taskDescriptionMaxLength) || null;
            }
            if (dueDate !== undefined) {
                updateData.dueDate = dueDate
                    ? admin.firestore.Timestamp.fromDate(new Date(dueDate))
                    : null;
            }
            if (['high', 'medium', 'low'].includes(priority)) updateData.priority = priority;
            if (['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
                updateData.status = status;
                if (status === 'completed') {
                    updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
                } else {
                    updateData.completedAt = null;
                }
            }

            const updatedTask = await careTaskService.updateRecord(taskId, updateData);
            if (!updatedTask) {
                res.status(404).json({ code: 'not_found', message: 'Task not found' });
                return;
            }

            res.json({
                id: taskId,
                patientId: updatedTask.patientId,
                caregiverId: updatedTask.caregiverId,
                title: updatedTask.title,
                description: updatedTask.description,
                dueDate: toISOStringSafe(updatedTask.dueDate),
                priority: updatedTask.priority,
                status: updatedTask.status,
                completedAt: toISOStringSafe(updatedTask.completedAt),
                createdAt: toISOStringSafe(updatedTask.createdAt),
                updatedAt: toISOStringSafe(updatedTask.updatedAt),
            });
        } catch (error) {
            functions.logger.error('[care] Error updating task:', error);
            res.status(500).json({ code: 'server_error', message: 'Failed to update task' });
        }
    });

    // DELETE /v1/care/:patientId/tasks/:taskId
    router.delete('/:patientId/tasks/:taskId', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const { patientId, taskId } = req.params;
            const { careTaskService } = getCareTaskServices();

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                message: 'Access denied',
            }))) {
                return;
            }

            const taskData = await careTaskService.getById(taskId);
            if (!taskData) {
                res.status(404).json({ code: 'not_found', message: 'Task not found' });
                return;
            }

            if (
                !ensureResourceOwnerAccessOrReject(patientId, taskData, res, {
                    resourceName: 'task',
                    ownerField: 'patientId',
                    notFoundMessage: 'Task not found',
                    message: 'Not authorized to delete this task',
                    allowDeleted: true,
                })
            ) {
                return;
            }

            if (
                !ensureResourceOwnerAccessOrReject(caregiverId, taskData, res, {
                    resourceName: 'task',
                    ownerField: 'caregiverId',
                    notFoundMessage: 'Task not found',
                    message: 'Not authorized to delete this task',
                    allowDeleted: true,
                })
            ) {
                return;
            }

            if (taskData.deletedAt) {
                res.status(404).json({ code: 'not_found', message: 'Task not found' });
                return;
            }

            const now = admin.firestore.Timestamp.now();
            await careTaskService.updateRecord(taskId, {
                deletedAt: now,
                deletedBy: caregiverId,
                updatedAt: now,
            });
            res.json({ success: true });
        } catch (error) {
            functions.logger.error('[care] Error deleting task:', error);
            res.status(500).json({ code: 'server_error', message: 'Failed to delete task' });
        }
    });

    // POST /v1/care/:patientId/tasks/:taskId/restore
    router.post('/:patientId/tasks/:taskId/restore', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const { patientId, taskId } = req.params;
            const isOperator = hasOperatorAccess(req.user);
            const { careTaskService } = getCareTaskServices();
            const restoreReason =
                typeof req.body?.reason === 'string'
                    ? sanitizePlainText(req.body.reason, RESTORE_REASON_MAX_LENGTH)
                    : '';

            if (!isOperator) {
                if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                    message: 'Access denied',
                }))) {
                    return;
                }
            }

            const taskData = await careTaskService.getById(taskId);
            if (!taskData) {
                res.status(404).json({ code: 'not_found', message: 'Task not found' });
                return;
            }

            if (
                !ensureResourceOwnerAccessOrReject(patientId, taskData, res, {
                    resourceName: 'task',
                    ownerField: 'patientId',
                    notFoundMessage: 'Task not found',
                    message: 'Not authorized to restore this task',
                    allowDeleted: true,
                })
            ) {
                return;
            }

            if (
                !isOperator &&
                !ensureResourceOwnerAccessOrReject(caregiverId, taskData, res, {
                    resourceName: 'task',
                    ownerField: 'caregiverId',
                    notFoundMessage: 'Task not found',
                    message: 'Not authorized to restore this task',
                    allowDeleted: true,
                })
            ) {
                return;
            }

            if (!ensureOperatorRestoreReasonOrReject({
                actorUserId: caregiverId,
                ownerUserId: taskData.patientId,
                isOperator,
                reason: restoreReason,
                res,
            })) {
                return;
            }

            if (!taskData.deletedAt) {
                res.status(409).json({ code: 'not_deleted', message: 'Task is not deleted' });
                return;
            }

            const now = admin.firestore.Timestamp.now();
            await careTaskService.updateRecord(taskId, {
                deletedAt: null,
                deletedBy: null,
                updatedAt: now,
            });

            try {
                await recordRestoreAuditEvent({
                    resourceType: 'care_task',
                    resourceId: taskId,
                    ownerUserId: taskData.patientId,
                    actorUserId: caregiverId,
                    actorIsOperator: isOperator,
                    reason: restoreReason || undefined,
                    metadata: {
                        route: 'care.tasks.restore',
                        caregiverId: taskData.caregiverId,
                    },
                    createdAt: now,
                });
            } catch (auditError) {
                functions.logger.error('[care] Failed to record restore audit event', {
                    taskId,
                    actorUserId: caregiverId,
                    ownerUserId: taskData.patientId,
                    message: auditError instanceof Error ? auditError.message : String(auditError),
                });
            }

            res.json({
                success: true,
                id: taskId,
                restoredBy: caregiverId,
                restoredFor: taskData.patientId,
                reason: restoreReason || null,
                restoredAt: now.toDate().toISOString(),
            });
        } catch (error) {
            functions.logger.error('[care] Error restoring task:', error);
            res.status(500).json({ code: 'server_error', message: 'Failed to restore task' });
        }
    });
}
