/**
 * Walkthrough Q&A Service
 *
 * Handles patient questions about their visit. Searches existing visit data
 * first (education, summary, follow-ups), falls back to a guarded LLM call
 * only when no match is found.
 */

import * as functions from 'firebase-functions';
import { openAIConfig } from '../config';
import axios from 'axios';
import { withRetry } from '../utils/retryUtils';

// =============================================================================
// Types
// =============================================================================

export interface VisitQAContext {
  summary: string;
  education: {
    diagnoses: Array<{ name: string; summary?: string; watchFor?: string }>;
    medications: Array<{
      name: string;
      purpose?: string;
      usage?: string;
      sideEffects?: string;
      whenToCallDoctor?: string;
    }>;
  };
  diagnoses: string[];
  medications: {
    started: Array<{ name: string; dose?: string; frequency?: string; note?: string }>;
    stopped: Array<{ name: string; note?: string }>;
    changed: Array<{ name: string; dose?: string; frequency?: string; note?: string }>;
  };
  followUps?: Array<{ task: string; timeframe?: string; dueAt?: string }>;
  nextSteps?: string[];
  visitDate?: string;
}

export interface QAResult {
  answer: string;
  source: 'visit_education' | 'visit_summary' | 'ai_generated';
  disclaimer: string;
}

// =============================================================================
// Constants
// =============================================================================

const DISCLAIMER = 'This is based on information from your visit. Your care team is always the best resource.';
const MAX_QUESTION_LENGTH = 500;

const QA_SYSTEM_PROMPT = `You are LumiBot, a friendly healthcare information assistant. A patient is asking about their recent medical visit.

CRITICAL SAFETY RULES:
- You are informational only. You are NOT a medical professional.
- Never recommend starting, stopping, or changing medications or treatments.
- Never diagnose conditions or interpret symptoms clinically.
- Never attribute health changes to specific medications.
- Never use phrases like "since starting [medication]" or "[medication] is working".
- For any clinical question, respond: "That's a great question for your care team at your next visit."
- Use simple, patient-friendly language (6th-8th grade reading level).
- Keep answers to 2-3 sentences max.
- Always end with a suggestion to discuss with their care team.

You will be given the patient's visit education data as context. Only answer based on this context.
If the question is outside the visit context, deflect to the care team.`;

// Unsafe patterns — reject questions that try to get medical advice
const UNSAFE_QUESTION_PATTERNS = [
  /should i (stop|start|increase|decrease|change|take|skip)/i,
  /can i (stop|start|skip|change|mix|combine)/i,
  /is it (safe|okay|ok|dangerous) to/i,
  /what dose should/i,
  /am i (having|getting|developing)/i,
  /do i have/i,
  /diagnos/i,
];

const SAFE_DEFLECTION = "That's a great question for your care team. They know your health history and can give you the best guidance.";

// =============================================================================
// Main Q&A Function
// =============================================================================

export async function answerVisitQuestion(
  question: string,
  visitContext: VisitQAContext,
): Promise<QAResult> {
  // Validate input
  const trimmed = question.trim();
  if (!trimmed || trimmed.length < 3) {
    return {
      answer: 'Could you tell me a bit more about what you\'d like to know?',
      source: 'visit_summary',
      disclaimer: DISCLAIMER,
    };
  }

  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return {
      answer: 'That question is a bit long. Could you try asking in a shorter way?',
      source: 'visit_summary',
      disclaimer: DISCLAIMER,
    };
  }

  // Check for unsafe patterns — deflect to care team
  for (const pattern of UNSAFE_QUESTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        answer: SAFE_DEFLECTION,
        source: 'visit_education',
        disclaimer: DISCLAIMER,
      };
    }
  }

  // Step 1: Try to answer from education data
  const educationMatch = matchFromEducation(trimmed, visitContext);
  if (educationMatch) {
    return {
      answer: educationMatch,
      source: 'visit_education',
      disclaimer: DISCLAIMER,
    };
  }

  // Step 2: Try to answer from visit summary / follow-ups
  const summaryMatch = matchFromSummary(trimmed, visitContext);
  if (summaryMatch) {
    return {
      answer: summaryMatch,
      source: 'visit_summary',
      disclaimer: DISCLAIMER,
    };
  }

  // Step 3: LLM fallback (guarded)
  try {
    const aiAnswer = await askWithLLM(trimmed, visitContext);
    return {
      answer: aiAnswer,
      source: 'ai_generated',
      disclaimer: DISCLAIMER,
    };
  } catch (error) {
    functions.logger.error('[walkthroughQA] LLM fallback failed:', error);
    return {
      answer: "I'm not sure about that one. Your care team would be the best people to ask — they know your health history best.",
      source: 'visit_summary',
      disclaimer: DISCLAIMER,
    };
  }
}

// =============================================================================
// Local Matching
// =============================================================================

function matchFromEducation(question: string, ctx: VisitQAContext): string | null {
  const lower = question.toLowerCase();

  // Check medication questions
  for (const med of ctx.education.medications) {
    const medLower = med.name.toLowerCase();
    if (!lower.includes(medLower)) continue;

    // "What is X used for?" / "purpose" / "why"
    if (lower.includes('used for') || lower.includes('purpose') || lower.includes('why') || lower.includes('what is') || lower.includes('what does')) {
      if (med.purpose) return med.purpose;
    }

    // "Side effects" / "watch for" / "problems"
    if (lower.includes('side effect') || lower.includes('watch for') || lower.includes('problem') || lower.includes('concern')) {
      if (med.sideEffects) return med.sideEffects;
    }

    // "When to call" / "emergency" / "urgent"
    if (lower.includes('call') || lower.includes('emergency') || lower.includes('urgent') || lower.includes('doctor')) {
      if (med.whenToCallDoctor) return med.whenToCallDoctor;
    }

    // "How to take" / "usage" / "when"
    if (lower.includes('how') || lower.includes('take') || lower.includes('usage') || lower.includes('when')) {
      if (med.usage) return med.usage;
    }

    // Generic medication question — return purpose as default
    if (med.purpose) return med.purpose;
  }

  // Check diagnosis questions
  for (const diag of ctx.education.diagnoses) {
    const diagLower = diag.name.toLowerCase();
    if (!lower.includes(diagLower)) continue;

    if (lower.includes('watch') || lower.includes('look out') || lower.includes('concern') || lower.includes('symptom')) {
      if (diag.watchFor) return diag.watchFor;
    }

    if (diag.summary) return diag.summary;
  }

  return null;
}

function matchFromSummary(question: string, ctx: VisitQAContext): string | null {
  const lower = question.toLowerCase();

  // "What happened" / "summary" / "overview"
  if (lower.includes('what happened') || lower.includes('summary') || lower.includes('overview')) {
    if (ctx.summary) {
      const truncated = ctx.summary.length > 300
        ? ctx.summary.slice(0, 297) + '...'
        : ctx.summary;
      return truncated;
    }
  }

  // "Next steps" / "follow up" / "what's next" / "what do I need to do"
  if (lower.includes('next') || lower.includes('follow') || lower.includes('do i need') || lower.includes('action')) {
    const items: string[] = [];
    if (ctx.followUps) {
      for (const fu of ctx.followUps) {
        const timeInfo = fu.timeframe || fu.dueAt || '';
        items.push(timeInfo ? `${fu.task} (${timeInfo})` : fu.task);
      }
    }
    if (items.length === 0 && ctx.nextSteps) {
      items.push(...ctx.nextSteps.filter((s) => s.trim()));
    }
    if (items.length > 0) {
      return `Here are your follow-up items:\n${items.map((i) => `• ${i}`).join('\n')}`;
    }
  }

  // "What medications" / "new meds" / "prescriptions"
  if (lower.includes('medication') || lower.includes('medicine') || lower.includes('prescription') || lower.includes('drug')) {
    const parts: string[] = [];
    if (ctx.medications.started.length > 0) {
      parts.push('Started: ' + ctx.medications.started.map((m) => m.name).join(', '));
    }
    if (ctx.medications.stopped.length > 0) {
      parts.push('Stopped: ' + ctx.medications.stopped.map((m) => m.name).join(', '));
    }
    if (ctx.medications.changed.length > 0) {
      parts.push('Changed: ' + ctx.medications.changed.map((m) => m.name).join(', '));
    }
    if (parts.length > 0) {
      return `Here are the medication changes from your visit:\n${parts.join('\n')}`;
    }
  }

  return null;
}

// =============================================================================
// LLM Fallback (Guarded)
// =============================================================================

async function askWithLLM(question: string, ctx: VisitQAContext): Promise<string> {
  const apiKey = openAIConfig.apiKey;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  // Build context string from visit data (names only, no correlation with outcomes)
  const contextParts: string[] = [];
  if (ctx.diagnoses.length > 0) {
    contextParts.push(`Conditions discussed: ${ctx.diagnoses.join(', ')}`);
  }
  if (ctx.medications.started.length > 0) {
    contextParts.push(`Medications started: ${ctx.medications.started.map((m) => m.name).join(', ')}`);
  }
  if (ctx.education.medications.length > 0) {
    for (const med of ctx.education.medications) {
      const parts: string[] = [`${med.name}:`];
      if (med.purpose) parts.push(`Purpose: ${med.purpose}`);
      if (med.sideEffects) parts.push(`Side effects: ${med.sideEffects}`);
      if (med.whenToCallDoctor) parts.push(`When to call doctor: ${med.whenToCallDoctor}`);
      contextParts.push(parts.join(' '));
    }
  }
  if (ctx.education.diagnoses.length > 0) {
    for (const diag of ctx.education.diagnoses) {
      const parts: string[] = [`${diag.name}:`];
      if (diag.summary) parts.push(diag.summary);
      if (diag.watchFor) parts.push(`Watch for: ${diag.watchFor}`);
      contextParts.push(parts.join(' '));
    }
  }

  const contextString = contextParts.join('\n');

  const response = await withRetry(
    async () => axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: openAIConfig.model || 'gpt-4o',
        store: false, // HIPAA: Zero data retention
        temperature: 0.3,
        max_tokens: 300,
        messages: [
          { role: 'system', content: QA_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              'Visit education context:',
              contextString,
              '',
              `Patient question: "${question}"`,
              '',
              'Answer briefly using only the context above. If you cannot answer from the context, suggest asking their care team.',
            ].join('\n'),
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    ),
    {
      shouldRetry: (error: unknown) => {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          return status === 429 || (!!status && status >= 500);
        }
        return false;
      },
    },
  );

  const content = response.data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  // Validate response for unsafe patterns
  const UNSAFE_RESPONSE_PATTERNS = [
    /since (starting|beginning|taking)/i,
    /appears to be working/i,
    /is (working|helping|effective)/i,
    /caused by|causing/i,
    /you should (stop|start|increase|decrease|change)/i,
    /i recommend/i,
    /diagnosis|diagnose/i,
  ];

  for (const pattern of UNSAFE_RESPONSE_PATTERNS) {
    if (pattern.test(content)) {
      functions.logger.warn('[walkthroughQA] Unsafe AI response detected, deflecting');
      return SAFE_DEFLECTION;
    }
  }

  return content;
}
