import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';
import { RepositoryValidationError } from '../../services/repositories/common/errors';

type RegisterCareHealthLogRoutesOptions = {
  getDb: () => FirebaseFirestore.Firestore;
  pageSizeDefault: number;
  pageSizeMax: number;
};

function calculateTrend(values: number[]): 'up' | 'down' | 'stable' | null {
  if (values.length < 3) {
    return null;
  }

  const midpoint = Math.floor(values.length / 2);
  const recentAvg = values.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  const olderAvg =
    values.slice(midpoint).reduce((a, b) => a + b, 0) / (values.length - midpoint);
  const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (percentChange > 5) return 'up';
  if (percentChange < -5) return 'down';
  return 'stable';
}

export function registerCareHealthLogRoutes(
  router: Router,
  options: RegisterCareHealthLogRoutesOptions,
): void {
  const { getDb, pageSizeDefault, pageSizeMax } = options;
  const getHealthLogDomainService = () => createDomainServiceContainer({ db: getDb() }).healthLogService;

  // GET /v1/care/:patientId/health-logs
  // Fetch health logs for a patient with summary statistics
  router.get('/:patientId/health-logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const caregiverId = req.user!.uid;
      const patientId = req.params.patientId;
      const { type = 'all', days = '30', limit: limitParam } = req.query;
      const cursor =
        typeof req.query.cursor === 'string' && req.query.cursor.trim().length > 0
          ? req.query.cursor.trim()
          : null;
      const paginationRequested = limitParam !== undefined || cursor !== null;

      if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res))) {
        return;
      }

      const daysNum = Math.min(Math.max(parseInt(days as string, 10) || 30, 1), 365);
      let limitNum: number | undefined;
      if (limitParam !== undefined) {
        const parsedLimit = parseInt(String(limitParam), 10);
        if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
          res.status(400).json({
            code: 'validation_failed',
            message: 'limit must be a positive integer',
          });
          return;
        }
        limitNum = Math.min(parsedLimit, pageSizeMax);
      }
      const pageSize = limitNum ?? Math.min(pageSizeDefault, pageSizeMax);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      const hasTypeFilter = type !== 'all' && ['bp', 'glucose', 'weight'].includes(type as string);
      const healthLogService = getHealthLogDomainService();
      const typeFilterValue = hasTypeFilter ? String(type) : undefined;

      let logs:
        | Array<FirebaseFirestore.DocumentData & { id: string }>
        | Array<Record<string, unknown>> = [];
      let hasMore = false;
      let nextCursor: string | null = null;

      if (paginationRequested) {
        const page = await healthLogService.listPageForUser(patientId, {
          type: typeFilterValue,
          startDate,
          sortDirection: 'desc',
          limit: pageSize,
          cursor,
        });
        logs = page.items;
        hasMore = page.hasMore;
        nextCursor = page.nextCursor;

        res.set('X-Has-More', hasMore ? 'true' : 'false');
        res.set('X-Next-Cursor', nextCursor || '');
      } else {
        logs = await healthLogService.listForUser(patientId, {
          type: typeFilterValue,
          startDate,
          sortDirection: 'desc',
        });
      }

      const responseLogs = logs.map((data) => {
        return {
          id: data.id,
          type: data.type,
          value: data.value,
          alertLevel: data.alertLevel || 'normal',
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          source: data.source || 'manual',
        };
      });

      const bpLogs = responseLogs.filter((l) => l.type === 'bp');
      const glucoseLogs = responseLogs.filter((l) => l.type === 'glucose');
      const weightLogs = responseLogs.filter((l) => l.type === 'weight');

      const bpSummary = {
        count: bpLogs.length,
        latest: bpLogs[0]?.value || null,
        latestDate: bpLogs[0]?.createdAt || null,
        latestAlertLevel: bpLogs[0]?.alertLevel || null,
        avgSystolic:
          bpLogs.length > 0
            ? Math.round(
                bpLogs.reduce((sum, l) => sum + ((l.value as any)?.systolic || 0), 0) /
                  bpLogs.length,
              )
            : null,
        avgDiastolic:
          bpLogs.length > 0
            ? Math.round(
                bpLogs.reduce((sum, l) => sum + ((l.value as any)?.diastolic || 0), 0) /
                  bpLogs.length,
              )
            : null,
        trend: calculateTrend(bpLogs.map((l) => (l.value as any)?.systolic).filter(Boolean)),
      };

      const glucoseSummary = {
        count: glucoseLogs.length,
        latest: glucoseLogs[0]?.value || null,
        latestDate: glucoseLogs[0]?.createdAt || null,
        latestAlertLevel: glucoseLogs[0]?.alertLevel || null,
        avg:
          glucoseLogs.length > 0
            ? Math.round(
                glucoseLogs.reduce((sum, l) => sum + ((l.value as any)?.reading || 0), 0) /
                  glucoseLogs.length,
              )
            : null,
        min:
          glucoseLogs.length > 0
            ? Math.min(...glucoseLogs.map((l) => (l.value as any)?.reading || 999))
            : null,
        max:
          glucoseLogs.length > 0
            ? Math.max(...glucoseLogs.map((l) => (l.value as any)?.reading || 0))
            : null,
        trend: calculateTrend(glucoseLogs.map((l) => (l.value as any)?.reading).filter(Boolean)),
      };

      const weightValues = weightLogs.map((l) => (l.value as any)?.weight).filter(Boolean);
      const weightSummary = {
        count: weightLogs.length,
        latest: weightLogs[0]?.value || null,
        latestDate: weightLogs[0]?.createdAt || null,
        oldest: weightLogs[weightLogs.length - 1]?.value || null,
        change:
          weightValues.length >= 2
            ? Math.round((weightValues[0] - weightValues[weightValues.length - 1]) * 10) / 10
            : null,
        trend: calculateTrend(weightValues),
      };

      const alertCounts = {
        emergency: responseLogs.filter((l) => l.alertLevel === 'emergency').length,
        warning: responseLogs.filter((l) => l.alertLevel === 'warning').length,
        caution: responseLogs.filter((l) => l.alertLevel === 'caution').length,
      };

      res.set('Cache-Control', 'private, max-age=30');
      res.json({
        logs: responseLogs,
        summary: {
          bp: bpSummary,
          glucose: glucoseSummary,
          weight: weightSummary,
        },
        alerts: alertCounts,
        period: {
          days: daysNum,
          from: startDate.toISOString(),
          to: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof RepositoryValidationError) {
        res.status(400).json({
          code: 'validation_failed',
          message: 'Invalid cursor',
        });
        return;
      }

      functions.logger.error('[care] Error fetching health logs:', error);
      res.status(500).json({
        code: 'server_error',
        message: 'Failed to fetch health logs',
      });
    }
  });
}
