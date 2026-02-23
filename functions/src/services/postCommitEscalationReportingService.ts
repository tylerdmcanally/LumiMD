import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { escalationIncidentConfig } from '../config';
import { VisitDomainService } from './domain/visits/VisitDomainService';
import { FirestoreVisitRepository } from './repositories/visits/FirestoreVisitRepository';

const db = () => admin.firestore();
const DEFAULT_REPORT_SCAN_LIMIT = 200;
const MAX_REPORT_SCAN_LIMIT = 1000;
const DEFAULT_SAMPLE_SIZE = 20;
const MIN_INCIDENT_TIMEOUT_MS = 1000;

type PostCommitEscalationDependencies = {
  visitService?: Pick<VisitDomainService, 'listPostCommitEscalated'>;
};

function buildDefaultDependencies(): Required<PostCommitEscalationDependencies> {
  return {
    visitService: new VisitDomainService(new FirestoreVisitRepository(db())),
  };
}

function resolveDependencies(
  overrides: PostCommitEscalationDependencies,
): Required<PostCommitEscalationDependencies> {
  const defaults = buildDefaultDependencies();
  return {
    visitService: overrides.visitService ?? defaults.visitService,
  };
}

export type PostCommitEscalationReportResult = {
  scanned: number;
  totalEscalated: number;
  unacknowledged: number;
  acknowledged: number;
  sampleUnacknowledgedVisitIds: string[];
};

type IncidentDispatchResult = {
  configured: boolean;
  delivered: boolean;
  status: number | null;
  skippedReason: string | null;
};

const normalizeLimit = (rawLimit?: number): number => {
  if (!rawLimit || !Number.isFinite(rawLimit) || rawLimit <= 0) {
    return DEFAULT_REPORT_SCAN_LIMIT;
  }
  return Math.min(Math.floor(rawLimit), MAX_REPORT_SCAN_LIMIT);
};

const normalizeSampleSize = (rawSampleSize?: number): number => {
  if (!rawSampleSize || !Number.isFinite(rawSampleSize) || rawSampleSize <= 0) {
    return DEFAULT_SAMPLE_SIZE;
  }
  return Math.min(Math.floor(rawSampleSize), DEFAULT_SAMPLE_SIZE);
};

const normalizeWebhookUrl = (rawUrl: string | undefined): string =>
  typeof rawUrl === 'string' ? rawUrl.trim() : '';

const buildIncidentPayload = (
  result: PostCommitEscalationReportResult,
): Record<string, unknown> => {
  return {
    source: 'lumimd-functions',
    eventType: 'visit_post_commit_escalations',
    severity: 'high',
    generatedAt: new Date().toISOString(),
    summary: `${result.unacknowledged} unacknowledged post-commit visit escalation(s)`,
    report: result,
    operatorEndpoint: '/v1/visits/ops/post-commit-escalations',
    operatorDashboardPath: '/ops/escalations',
  };
};

const dispatchEscalationIncident = async (
  result: PostCommitEscalationReportResult,
): Promise<IncidentDispatchResult> => {
  const webhookUrl = normalizeWebhookUrl(escalationIncidentConfig.webhookUrl);
  if (!webhookUrl) {
    return {
      configured: false,
      delivered: false,
      status: null,
      skippedReason: 'webhook_not_configured',
    };
  }

  if (result.unacknowledged <= 0) {
    return {
      configured: true,
      delivered: false,
      status: null,
      skippedReason: 'no_unacknowledged_escalations',
    };
  }

  const timeoutMs = Math.max(escalationIncidentConfig.timeoutMs, MIN_INCIDENT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (escalationIncidentConfig.webhookToken.trim().length > 0) {
    headers.Authorization = `Bearer ${escalationIncidentConfig.webhookToken.trim()}`;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildIncidentPayload(result)),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Incident destination responded with status ${response.status}`);
    }

    return {
      configured: true,
      delivered: true,
      status: response.status,
      skippedReason: null,
    };
  } catch (error) {
    functions.logger.error('[visitPostCommitEscalationReport] Incident dispatch failed', {
      message: error instanceof Error ? error.message : String(error),
      webhookConfigured: true,
    });
    return {
      configured: true,
      delivered: false,
      status: null,
      skippedReason: 'delivery_failed',
    };
  } finally {
    clearTimeout(timeout);
  }
};

export async function reportPostCommitEscalations(
  options: { limit?: number; sampleSize?: number } = {},
  dependencyOverrides: PostCommitEscalationDependencies = {},
): Promise<PostCommitEscalationReportResult> {
  const limit = normalizeLimit(options.limit);
  const sampleSize = normalizeSampleSize(options.sampleSize);
  const dependencies = resolveDependencies(dependencyOverrides);

  const visits = await dependencies.visitService.listPostCommitEscalated(limit);

  const result: PostCommitEscalationReportResult = {
    scanned: visits.length,
    totalEscalated: visits.length,
    unacknowledged: 0,
    acknowledged: 0,
    sampleUnacknowledgedVisitIds: [],
  };

  visits.forEach((visit) => {
    const isAcknowledged = Boolean(visit.postCommitEscalationAcknowledgedAt);
    if (isAcknowledged) {
      result.acknowledged += 1;
      return;
    }

    result.unacknowledged += 1;
    if (result.sampleUnacknowledgedVisitIds.length < sampleSize) {
      result.sampleUnacknowledgedVisitIds.push(visit.id);
    }
  });

  if (result.unacknowledged > 0) {
    functions.logger.error(
      `[visitPostCommitEscalationReport][ALERT] ${result.unacknowledged} unacknowledged escalated visit(s)`,
      {
        scanned: result.scanned,
        sampleVisitIds: result.sampleUnacknowledgedVisitIds,
      },
    );
  } else {
    functions.logger.info('[visitPostCommitEscalationReport] No unacknowledged escalations', {
      scanned: result.scanned,
    });
  }

  const dispatchResult = await dispatchEscalationIncident(result);
  if (dispatchResult.configured && dispatchResult.delivered) {
    functions.logger.info('[visitPostCommitEscalationReport] Escalation incident dispatched', {
      status: dispatchResult.status,
      unacknowledged: result.unacknowledged,
      sampleVisitIds: result.sampleUnacknowledgedVisitIds,
    });
  }

  return result;
}
