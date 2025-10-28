import OpenAI from 'openai';
import fs from 'fs';
import config from '../config';
import logger from '../utils/logger';
import {
  TranscriptionResult,
  SummarizationResult,
  ExtractedEntity,
  VisitSummary,
} from '../types';
import { InternalServerError } from '../utils/errors';

const VISIT_SUMMARY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overview: { type: 'string' },
    keyPoints: {
      type: 'array',
      items: { type: 'string' },
    },
    discussedConditions: {
      type: 'array',
      items: { type: 'string' },
    },
    diagnoses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          isNew: { type: 'boolean' },
          notes: { type: ['string', 'null'] },
        },
        required: ['name', 'isNew', 'notes'],
      },
    },
    medications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          changeType: {
            type: 'string',
            enum: ['START', 'CHANGE', 'STOP'],
          },
          dosage: { type: ['string', 'null'] },
          instructions: { type: ['string', 'null'] },
        },
        required: ['name', 'changeType', 'dosage', 'instructions'],
      },
    },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: [
              'FOLLOW_UP_APPOINTMENT',
              'LAB_WORK',
              'IMAGING',
              'MEDICATION_START',
              'MEDICATION_CHANGE',
              'OTHER',
            ],
          },
          title: { type: 'string' },
          detail: { type: ['string', 'null'] },
          dueDate: { type: ['string', 'null'] },
        },
        required: ['type', 'title', 'detail', 'dueDate'],
      },
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: ['MEDICATION', 'CONDITION', 'PROCEDURE', 'TEST_TREATMENT_PROCEDURE'],
          },
          text: { type: 'string' },
          category: { type: ['string', 'null'] },
        },
        required: ['type', 'text', 'category'],
      },
    },
  },
  required: ['overview', 'keyPoints', 'discussedConditions', 'diagnoses', 'medications', 'actionItems', 'entities'],
};

const ENTITY_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: ['MEDICATION', 'CONDITION', 'PROCEDURE', 'TEST_TREATMENT_PROCEDURE'],
          },
          text: { type: 'string' },
          category: { type: ['string', 'null'] },
        },
        required: ['type', 'text', 'category'],
      },
    },
  },
  required: ['entities'],
};

/**
 * OpenAI service for transcription and summarization
 * Uses Whisper API for audio transcription and GPT-4 for visit summarization
 */
class OpenAIService {
  private client: OpenAI;
  private summaryModel: string;
  private entityModel: string;
  private transcriptionModels: string[];

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      organization: config.openai.organizationId,
    });
    this.summaryModel = process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini';
    this.entityModel =
      process.env.OPENAI_ENTITY_MODEL || process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini';
    const transcriptionList = process.env.OPENAI_TRANSCRIPTION_MODEL
      ? process.env.OPENAI_TRANSCRIPTION_MODEL.split(',').map((model) => model.trim()).filter(Boolean)
      : null;
    this.transcriptionModels = transcriptionList && transcriptionList.length > 0
      ? transcriptionList
      : ['whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe'];
  }

  /**
   * Transcribe audio file using Whisper API
   * @param audioFilePath - Local path to audio file
   * @returns Transcription result
   */
  async transcribeAudio(audioFilePath: string): Promise<TranscriptionResult> {
    try {
      logger.info('Starting audio transcription', { audioFilePath });

      // Check if file exists
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      let lastError: any = null;

      for (const model of this.transcriptionModels) {
        let audioStream: fs.ReadStream | null = null;
        try {
          audioStream = fs.createReadStream(audioFilePath);

          const transcription = await this.client.audio.transcriptions.create({
            file: audioStream,
            model,
            language: 'en', // Can be made dynamic
            response_format: 'verbose_json',
          });

          logger.info('Audio transcription completed', {
            duration: transcription.duration,
            textLength: transcription.text.length,
            model,
          });

          return {
            text: transcription.text,
            duration: transcription.duration || 0,
            language: transcription.language,
          };
        } catch (attemptError: any) {
          lastError = attemptError;
          logger.warn('Audio transcription attempt failed', {
            model,
            error: attemptError.message,
          });
        } finally {
          if (audioStream) {
            audioStream.close();
          }
        }
      }

      throw new Error(lastError?.message || 'All transcription models failed');
    } catch (error: any) {
      logger.error('Audio transcription failed', {
        error: error.message,
        audioFilePath,
      });
      throw new InternalServerError(
        `Transcription failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Generate visit summary using GPT-4
   * Extracts key points, diagnoses, medications, and action items
   * @param transcription - Visit transcription text
   * @param healthProfileContext - Optional patient health profile context
   * @returns Structured visit summary
   */
  async generateVisitSummary(
    transcription: string,
    healthProfileContext?: string
  ): Promise<SummarizationResult> {
    try {
      logger.info('Starting visit summarization', {
        transcriptionLength: transcription.length,
        hasHealthProfile: Boolean(healthProfileContext),
      });

      const healthProfileSection = healthProfileContext
        ? `\n\nPatient Health Profile:\n${healthProfileContext}\n\nUse this context to better understand the patient's medical history, but only include conditions in "discussedConditions" if they were actually mentioned or discussed during THIS visit.`
        : '';

      const systemPrompt = `You are a medical AI assistant specialized in analyzing healthcare visit transcriptions. Your task is to create a structured summary from the doctor-patient conversation.${healthProfileSection}

Extract and organize the following information:
1. Overview - A brief 2-3 sentence summary of the visit
2. Key Points - Main discussion points (3-5 bullet points)
3. Discussed Conditions - ONLY conditions from the patient's health profile that were actually mentioned or discussed in THIS specific visit
4. Diagnoses - Any conditions discussed (new or existing)
5. Medications - Any medication changes (start, change, stop)
6. Action Items - Follow-up tasks (appointments, lab work, etc.)

Return your response as a JSON object with this exact structure:
{
  "overview": "Brief summary of the visit...",
  "keyPoints": ["Point 1", "Point 2", ...],
  "discussedConditions": ["Condition 1", "Condition 2", ...],
  "diagnoses": [
    {"name": "Condition name", "isNew": true/false, "notes": "Additional info"}
  ],
  "medications": [
    {
      "name": "Medication name",
      "changeType": "START"|"CHANGE"|"STOP",
      "dosage": "Dosage info",
      "instructions": "How to take it"
    }
  ],
  "actionItems": [
    {
      "type": "FOLLOW_UP_APPOINTMENT"|"LAB_WORK"|"IMAGING"|"MEDICATION_START"|"MEDICATION_CHANGE"|"OTHER",
      "title": "Action title",
      "detail": "Detailed description",
      "dueDate": "YYYY-MM-DD or null"
    }
  ],
  "entities": [
    {
      "type": "MEDICATION"|"CONDITION"|"PROCEDURE"|"TEST_TREATMENT_PROCEDURE",
      "text": "Entity text",
      "category": "Category if applicable"
    }
  ]
}

Important:
- Be accurate and preserve medical terminology
- CRITICAL: Double-check medication spellings against common medications. Common corrections:
  * "carbadolol" → "Carvedilol" (beta-blocker for HTN/CHF)
  * "metropolol" → "Metoprolol" (beta-blocker)
  * "lysinopril" → "Lisinopril" (ACE inhibitor)
  * "lipator" → "Atorvastatin" or "Lipitor" (statin)
  * Use context clues (diagnosis, indication) to verify medication names
- If information is unclear, use your best judgment
- Include dates if mentioned in the transcription
- Mark diagnoses as "isNew" if explicitly stated as new
- Extract all medications mentioned
- For misspelled medication names, correct them to the proper generic or brand name`;

      const response = await this.client.responses.create({
        model: this.summaryModel,
        temperature: 0.3,
        max_output_tokens: 2000,
        text: {
          format: {
            type: 'json_schema',
            name: 'VisitSummaryResponse',
            schema: VISIT_SUMMARY_JSON_SCHEMA,
          },
        },
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Please analyze this healthcare visit transcription and provide a structured summary:\n\n${transcription}`,
              },
            ],
          },
        ],
      });

      const content = response.output_text?.trim();
      if (!content) {
        throw new Error('No content returned from OpenAI summary model');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        logger.error('Failed to parse summarization response', {
          rawContent: content,
          parseError,
        });
        throw new Error('Unable to parse summarization response JSON');
      }

      // Extract summary and entities
      const summary: VisitSummary = {
        overview: parsed.overview || '',
        keyPoints: parsed.keyPoints || [],
        discussedConditions: parsed.discussedConditions || [],
        diagnoses: parsed.diagnoses || [],
        medications: parsed.medications || [],
        actionItems: parsed.actionItems || [],
      };

      const entities: ExtractedEntity[] = parsed.entities || [];

      logger.info('Visit summarization completed', {
        diagnosesCount: summary.diagnoses.length,
        medicationsCount: summary.medications.length,
        actionItemsCount: summary.actionItems.length,
        entitiesCount: entities.length,
      });

      return {
        summary,
        entities,
      };
    } catch (error: any) {
      logger.error('Visit summarization failed', {
        error: error.message,
        transcriptionLength: transcription.length,
      });
      throw new InternalServerError(
        `Summarization failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Extract medical entities from transcription using GPT-4
   * Alternative to AWS Comprehend Medical
   * @param transcription - Visit transcription text
   * @returns Extracted medical entities
   */
  async extractMedicalEntities(
    transcription: string
  ): Promise<ExtractedEntity[]> {
    try {
      logger.info('Extracting medical entities', {
        transcriptionLength: transcription.length,
      });

      const response = await this.client.responses.create({
        model: this.entityModel,
        temperature: 0.2,
        max_output_tokens: 1000,
        text: {
          format: {
            type: 'json_schema',
            name: 'VisitEntitiesResponse',
            schema: ENTITY_EXTRACTION_SCHEMA,
          },
        },
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: `You are a medical entity extraction AI. Extract all medical entities from the text and categorize them. Return a JSON object with an "entities" array using this structure:
{
  "entities": [
    {
      "type": "MEDICATION"|"CONDITION"|"PROCEDURE"|"TEST_TREATMENT_PROCEDURE",
      "text": "The extracted entity text",
      "category": "More specific category if applicable"
    }
  ]
}`,
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: transcription }],
          },
        ],
      });

      const content = response.output_text?.trim();
      if (!content) {
        return [];
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        logger.error('Failed to parse entity extraction response', {
          rawContent: content,
          parseError,
        });
        return [];
      }

      const entities = parsed.entities || [];

      logger.info('Medical entity extraction completed', {
        entitiesCount: entities.length,
      });

      return entities;
    } catch (error: any) {
      logger.error('Medical entity extraction failed', {
        error: error.message,
      });
      // Don't throw - entity extraction is optional
      return [];
    }
  }

  /**
   * Complete visit processing pipeline
   * Transcribes audio and generates summary in one call
   * @param audioFilePath - Path to audio file
   * @param healthProfileContext - Optional patient health profile
   * @returns Transcription and summary
   */
  async processVisit(
    audioFilePath: string,
    healthProfileContext?: string
  ): Promise<{
    transcription: TranscriptionResult;
    summary: SummarizationResult;
  }> {
    try {
      // Step 1: Transcribe audio
      const transcription = await this.transcribeAudio(audioFilePath);

      // Step 2: Generate summary with health profile context
      const summary = await this.generateVisitSummary(
        transcription.text,
        healthProfileContext
      );

      return {
        transcription,
        summary,
      };
    } catch (error) {
      logger.error('Visit processing failed', { error });
      throw error;
    }
  }

  /**
   * Test OpenAI API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.responses.create({
        model: this.summaryModel,
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: 'Say hello in one word.' }],
          },
        ],
        max_output_tokens: 5,
      });

      return Boolean(response.output_text);
    } catch (error: any) {
      logger.error('OpenAI connection test failed', { error: error.message });
      return false;
    }
  }
}

export default new OpenAIService();
