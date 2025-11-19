/**
 * Utility script to delete batches of AssemblyAI transcripts.
 *
 * Usage:
 *  npx ts-node scripts/delete-assembly-transcripts.ts --status=completed --limit=100 --olderThan=2024-01-01 --apply
 *
 * Flags:
 *  --status=<value>      Filter transcripts by status (default: completed)
 *  --limit=<number>      Page size when listing transcripts (default: 100)
 *  --olderThan=<ISO>     Only delete transcripts completed before this ISO date
 *  --apply               Actually perform deletions (otherwise dry-run)
 */

import axios from 'axios';

const API_BASE_URL = 'https://api.assemblyai.com/v2';

type TranscriptSummary = {
  id: string;
  status: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  audio_url?: string;
};

type TranscriptListResponse = {
  transcripts: TranscriptSummary[];
  page_info?: {
    has_next_page?: boolean;
    next_page_token?: string;
  };
};

function getArgValue(flag: string, fallback?: string): string | undefined {
  const arg = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (!arg) return fallback;
  return arg.split('=').slice(1).join('=') || fallback;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    console.error('ASSEMPLYAI_API_KEY env var is required.');
    process.exit(1);
  }

  const statusFilter = getArgValue('--status', 'completed');
  const limit = Number(getArgValue('--limit', '100')) || 100;
  const olderThanArg = getArgValue('--olderThan');
  const applyChanges = hasFlag('--apply');

  const olderThanDate = olderThanArg ? new Date(olderThanArg) : null;
  if (olderThanArg && Number.isNaN(olderThanDate?.getTime() ?? NaN)) {
    console.error(`Invalid date supplied for --olderThan: ${olderThanArg}`);
    process.exit(1);
  }

  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      Authorization: apiKey,
    },
    timeout: 30000,
  });

  console.log(
    `[AssemblyAI Cleanup] Listing transcripts (status=${statusFilter}, limit=${limit}, olderThan=${olderThanArg ?? 'n/a'}, apply=${applyChanges})`,
  );

  const collected: TranscriptSummary[] = [];
  let pageToken: string | undefined;
  let page = 1;

  do {
    try {
      const params: Record<string, string | number> = {
        limit,
        status: statusFilter ?? '',
      };
      if (pageToken) {
        params.page_token = pageToken;
      }

      const { data } = await client.get<TranscriptListResponse>('/transcript', {
        params,
      });

      const items = data.transcripts ?? [];
      collected.push(...items);

      const hasNext = Boolean(data.page_info?.has_next_page);
      pageToken = hasNext ? data.page_info?.next_page_token ?? undefined : undefined;
      console.log(
        `[AssemblyAI Cleanup] Retrieved page ${page} (${items.length} transcripts). hasNext=${hasNext}`,
      );
      page += 1;
    } catch (error: any) {
      console.error('[AssemblyAI Cleanup] Failed to list transcripts:', error?.message ?? error);
      process.exit(1);
    }
  } while (pageToken);

  console.log(
    `[AssemblyAI Cleanup] Retrieved ${collected.length} transcripts with status=${statusFilter}`,
  );

  const targets = collected.filter((transcript) => {
    if (!olderThanDate) return true;
    const candidateDate =
      transcript.completed_at || transcript.updated_at || transcript.created_at;
    if (!candidateDate) return false;
    const parsed = new Date(candidateDate);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getTime() < olderThanDate.getTime();
  });

  if (targets.length === 0) {
    console.log('[AssemblyAI Cleanup] No transcripts matched the filter criteria.');
    return;
  }

  console.log(
    `[AssemblyAI Cleanup] ${targets.length} transcripts match filter (apply=${applyChanges}).`,
  );
  if (!applyChanges) {
    targets.slice(0, 5).forEach((transcript) => {
      console.log(` - ${transcript.id} (status=${transcript.status}, completed_at=${transcript.completed_at ?? 'n/a'})`);
    });
    console.log('Dry run complete. Re-run with --apply to delete these transcripts.');
    return;
  }

  let deleted = 0;
  for (const transcript of targets) {
    try {
      await client.delete(`/transcript/${transcript.id}`);
      deleted += 1;
      console.log(`[AssemblyAI Cleanup] Deleted transcript ${transcript.id}`);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || String(error);
      console.warn(`[AssemblyAI Cleanup] Failed to delete ${transcript.id}: ${message}`);
    }
  }

  console.log(
    `[AssemblyAI Cleanup] Finished. Deleted ${deleted} of ${targets.length} transcripts.`,
  );
}

main().catch((error) => {
  console.error('[AssemblyAI Cleanup] Fatal error:', error);
  process.exit(1);
});


