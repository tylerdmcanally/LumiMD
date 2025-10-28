import { VisitRecording, VisitSummary, FollowUpAction, NextAppointment } from './RecordingService';
import { TranscriptionResult, TranscriptionService } from './TranscriptionService';
import { SecureStorageService } from './SecureStorageService';
import { ENV } from '@/shared/config/env';

export interface SummarizationOptions {
  includeKeyPoints: boolean;
  includeMedications: boolean;
  includeFollowUpActions: boolean;
  includeNextAppointments: boolean;
  confidenceThreshold: number; // 0-1 scale
  maxSummaryLength: number; // words
}

export interface SummaryAnalysis {
  medicalTerms: {
    medications: string[];
    symptoms: string[];
    procedures: string[];
    diagnoses: string[];
  };
  sentiment: {
    overall: 'positive' | 'neutral' | 'concerning';
    confidence: number;
    concerns: string[];
  };
  completeness: {
    score: number; // 0-1 scale
    missingElements: string[];
  };
}

export class VisitSummaryService {
  private static getApiKey() {
    return ENV.OPENAI_API_KEY;
  }

  /**
   * Generate comprehensive visit summary from recording and transcription
   */
  static async generateVisitSummary(
    recording: VisitRecording,
    transcription: TranscriptionResult,
    options: Partial<SummarizationOptions> = {}
  ): Promise<VisitSummary | null> {
    try {
      const apiKey = this.getApiKey();
      console.log('Summary API Key check:', apiKey ? 'Found' : 'Missing');

      if (!apiKey) {
        console.error('OpenAI API key not configured');
        return null;
      }

      if (!transcription || transcription.status !== 'completed' || !transcription.fullText.trim()) {
        console.error('Valid transcription required for summarization');
        return null;
      }

      console.log(`Generating visit summary for recording: ${recording.id}`);

      const defaultOptions: SummarizationOptions = {
        includeKeyPoints: true,
        includeMedications: true,
        includeFollowUpActions: true,
        includeNextAppointments: true,
        confidenceThreshold: 0.7,
        maxSummaryLength: 500,
        ...options
      };

      // Create comprehensive prompt for medical visit summarization
      const prompt = this.buildSummarizationPrompt(recording, transcription, defaultOptions);

      // Call OpenAI API for summarization
      const response = await this.callOpenAIForSummarization(prompt);

      if (!response) {
        throw new Error('Failed to generate summary from OpenAI');
      }

      // Parse the structured response
      const parsedSummary = this.parseSummaryResponse(response, recording.id);

      // Store summary
      await this.storeSummarySecurely(parsedSummary, recording.userId);

      console.log(`Summary generated successfully for recording: ${recording.id}`);
      return parsedSummary;

    } catch (error) {
      console.error('Error generating visit summary:', error);
      return this.createFallbackSummary(recording, transcription);
    }
  }

  /**
   * Update recording with generated summary
   */
  static async updateRecordingWithSummary(
    recordingId: string,
    summary: VisitSummary
  ): Promise<boolean> {
    try {
      // This would integrate with RecordingService
      const RecordingService = require('./RecordingService').RecordingService;
      const recordings = RecordingService.getStoredRecordings();

      const recordingIndex = recordings.findIndex(r => r.id === recordingId);
      if (recordingIndex === -1) {
        return false;
      }

      recordings[recordingIndex].summary = summary;
      recordings[recordingIndex].updatedAt = new Date();

      // Update stored recordings
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('healthnav_recordings', JSON.stringify(recordings));
      }

      return true;
    } catch (error) {
      console.error('Error updating recording with summary:', error);
      return false;
    }
  }

  /**
   * Analyze visit transcription for medical insights
   */
  static analyzeVisitContent(transcription: TranscriptionResult): SummaryAnalysis {
    try {
      // Extract medical terms
      const medicalTerms = TranscriptionService.extractMedicalTerms(transcription);

      // Analyze sentiment and concerns
      const sentiment = this.analyzeSentiment(transcription.fullText);

      // Assess completeness
      const completeness = this.assessCompleteness(transcription.fullText);

      return {
        medicalTerms,
        sentiment,
        completeness
      };
    } catch (error) {
      console.error('Error analyzing visit content:', error);
      return this.getDefaultAnalysis();
    }
  }

  /**
   * Get summary by recording ID
   */
  static getSummary(recordingId: string): VisitSummary | null {
    const stored = this.getStoredSummaries();
    return stored.find(s => s.recordingId === recordingId) || null;
  }

  /**
   * Search summaries by content
   */
  static searchSummaries(
    userId: string,
    query: string,
    filters?: {
      dateFrom?: Date;
      dateTo?: Date;
      providerType?: string;
      hasFollowUp?: boolean;
    }
  ): VisitSummary[] {
    try {
      const summaries = this.getStoredSummaries();
      const RecordingService = require('./RecordingService').RecordingService;
      const userRecordings = RecordingService.getUserRecordings(userId);
      const userRecordingIds = new Set(userRecordings.map(r => r.id));

      const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);

      return summaries.filter(summary => {
        // Must be user's recording
        if (!userRecordingIds.has(summary.recordingId)) return false;

        // Apply filters
        if (filters) {
          const recording = userRecordings.find(r => r.id === summary.recordingId);
          if (!recording) return false;

          if (filters.dateFrom && new Date(recording.visitDate) < filters.dateFrom) return false;
          if (filters.dateTo && new Date(recording.visitDate) > filters.dateTo) return false;
          if (filters.providerType && recording.providerType !== filters.providerType) return false;
          if (filters.hasFollowUp !== undefined && (summary.followUpActions.length > 0) !== filters.hasFollowUp) return false;
        }

        // Search in content
        const searchableText = [
          ...summary.keyPoints,
          ...summary.diagnoses,
          ...summary.medications,
          ...summary.followUpActions.map(a => a.description),
          ...summary.testOrders,
          ...summary.lifestyle
        ].join(' ').toLowerCase();

        return searchTerms.some(term => searchableText.includes(term));
      });
    } catch (error) {
      console.error('Error searching summaries:', error);
      return [];
    }
  }

  /**
   * Get follow-up actions across all visits
   */
  static getFollowUpActions(
    userId: string,
    filters?: {
      completed?: boolean;
      priority?: 'high' | 'medium' | 'low';
      type?: string;
      dueSoon?: boolean; // within next 7 days
    }
  ): Array<FollowUpAction & { recordingId: string; visitDate: Date; providerName: string }> {
    try {
      const summaries = this.getStoredSummaries();
      const RecordingService = require('./RecordingService').RecordingService;
      const userRecordings = RecordingService.getUserRecordings(userId);
      const userRecordingIds = new Set(userRecordings.map(r => r.id));

      const allActions: Array<FollowUpAction & { recordingId: string; visitDate: Date; providerName: string }> = [];

      summaries.forEach(summary => {
        if (!userRecordingIds.has(summary.recordingId)) return;

        const recording = userRecordings.find(r => r.id === summary.recordingId);
        if (!recording) return;

        summary.followUpActions.forEach(action => {
          // Apply filters
          if (filters) {
            if (filters.completed !== undefined && action.completed !== filters.completed) return;
            if (filters.priority && action.priority !== filters.priority) return;
            if (filters.type && action.type !== filters.type) return;
            if (filters.dueSoon && action.dueDate) {
              const daysUntilDue = Math.ceil((action.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              if (daysUntilDue > 7) return;
            }
          }

          allActions.push({
            ...action,
            recordingId: recording.id,
            visitDate: recording.visitDate,
            providerName: recording.providerName
          });
        });
      });

      // Sort by priority and due date
      return allActions.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];

        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Higher priority first
        }

        // Then by due date
        if (a.dueDate && b.dueDate) {
          return a.dueDate.getTime() - b.dueDate.getTime();
        }

        return 0;
      });
    } catch (error) {
      console.error('Error getting follow-up actions:', error);
      return [];
    }
  }

  /**
   * Mark follow-up action as completed
   */
  static markFollowUpCompleted(recordingId: string, actionDescription: string): boolean {
    try {
      const summaries = this.getStoredSummaries();
      const summaryIndex = summaries.findIndex(s => s.recordingId === recordingId);

      if (summaryIndex === -1) return false;

      const actionIndex = summaries[summaryIndex].followUpActions.findIndex(
        a => a.description === actionDescription
      );

      if (actionIndex === -1) return false;

      summaries[summaryIndex].followUpActions[actionIndex].completed = true;
      this.storeSummaries(summaries);

      return true;
    } catch (error) {
      console.error('Error marking follow-up completed:', error);
      return false;
    }
  }

  /**
   * Build comprehensive prompt for medical visit summarization
   */
  private static buildSummarizationPrompt(
    recording: VisitRecording,
    transcription: TranscriptionResult,
    options: SummarizationOptions
  ): string {
    return `
You are a medical documentation AI assistant. Please analyze this medical visit transcription and create a comprehensive summary.

VISIT CONTEXT:
- Patient: [Patient name redacted for privacy]
- Provider: ${recording.providerName}
- Provider Type: ${recording.providerType.replace('_', ' ')}
- Visit Type: ${recording.title}
- Date: ${new Date(recording.visitDate).toLocaleDateString()}
- Duration: ${Math.round(recording.duration / 60)} minutes

TRANSCRIPTION:
${transcription.fullText}

Please provide a structured summary in JSON format with the following sections:

{
  "keyPoints": [
    "List 3-5 most important points discussed during the visit"
  ],
  "diagnoses": [
    "Any diagnoses mentioned or conditions discussed"
  ],
  "medications": [
    "Medications prescribed, adjusted, or discussed"
  ],
  "followUpActions": [
    {
      "type": "prescription|appointment|test|lifestyle|monitoring",
      "description": "Specific action to take",
      "dueDate": "YYYY-MM-DD if specific date mentioned, null otherwise",
      "priority": "high|medium|low",
      "completed": false
    }
  ],
  "nextAppointments": [
    {
      "specialty": "Type of provider to see",
      "timeframe": "When to schedule (e.g., '2 weeks', '3 months')",
      "reason": "Purpose of follow-up",
      "urgent": true/false
    }
  ],
  "testOrders": [
    "Any tests, labs, or procedures ordered"
  ],
  "lifestyle": [
    "Lifestyle recommendations or changes discussed"
  ]
}

IMPORTANT GUIDELINES:
- Be accurate and only include information explicitly mentioned in the transcription
- Use medical terminology appropriately but keep language clear
- For medications, include dosage and frequency if mentioned
- For follow-up actions, infer reasonable priority levels based on medical urgency
- If no specific due date is mentioned, use null
- Focus on actionable items and important medical information
- Maintain patient privacy - do not include personal identifiers

Please provide only the JSON response without additional commentary.
`.trim();
  }

  /**
   * Call OpenAI API for summarization
   */
  private static async callOpenAIForSummarization(prompt: string): Promise<string | null> {
    try {
      const apiKey = this.getApiKey();
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4', // Use GPT-4 for better medical understanding
          messages: [
            {
              role: 'system',
              content: 'You are a medical documentation AI that creates accurate, structured summaries of healthcare visits. Always respond with valid JSON format.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.1, // Low temperature for consistency
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || null;

    } catch (error) {
      console.error('Error calling OpenAI for summarization:', error);
      return null;
    }
  }

  /**
   * Parse structured summary response from OpenAI
   */
  private static parseSummaryResponse(response: string, recordingId: string): VisitSummary {
    try {
      const parsed = JSON.parse(response);

      // Process follow-up actions
      const followUpActions: FollowUpAction[] = (parsed.followUpActions || []).map((action: any) => ({
        type: action.type || 'lifestyle',
        description: action.description || '',
        dueDate: action.dueDate ? new Date(action.dueDate) : undefined,
        priority: action.priority || 'medium',
        completed: false
      }));

      // Process next appointments
      const nextAppointments: NextAppointment[] = (parsed.nextAppointments || []).map((appt: any) => ({
        specialty: appt.specialty || '',
        timeframe: appt.timeframe || '',
        reason: appt.reason || '',
        urgent: appt.urgent || false
      }));

      return {
        id: `summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recordingId,
        keyPoints: parsed.keyPoints || [],
        diagnoses: parsed.diagnoses || [],
        medications: parsed.medications || [],
        followUpActions,
        nextAppointments,
        testOrders: parsed.testOrders || [],
        lifestyle: parsed.lifestyle || [],
        generatedAt: new Date(),
        confidence: 0.8 // Default confidence for parsed responses
      };

    } catch (error) {
      console.error('Error parsing summary response:', error);
      // Return basic summary structure
      return {
        id: `summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recordingId,
        keyPoints: ['Summary generation failed - please review recording manually'],
        diagnoses: [],
        medications: [],
        followUpActions: [],
        nextAppointments: [],
        testOrders: [],
        lifestyle: [],
        generatedAt: new Date(),
        confidence: 0.1
      };
    }
  }

  /**
   * Create fallback summary when AI generation fails
   */
  private static createFallbackSummary(
    recording: VisitRecording,
    transcription: TranscriptionResult
  ): VisitSummary {
    // Extract basic information using simple pattern matching
    const medicalTerms = TranscriptionService.extractMedicalTerms(transcription);

    return {
      id: `summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recordingId: recording.id,
      keyPoints: [
        `Visit with ${recording.providerName}`,
        `Discussed: ${recording.title}`,
        'AI summarization failed - please review recording manually'
      ],
      diagnoses: medicalTerms.diagnoses,
      medications: medicalTerms.medications,
      followUpActions: [{
        type: 'monitoring',
        description: 'Review recording manually for follow-up instructions',
        priority: 'medium',
        completed: false
      }],
      nextAppointments: [],
      testOrders: medicalTerms.procedures,
      lifestyle: [],
      generatedAt: new Date(),
      confidence: 0.3
    };
  }

  /**
   * Analyze sentiment of medical conversation
   */
  private static analyzeSentiment(text: string): SummaryAnalysis['sentiment'] {
    const concerningKeywords = [
      'worried', 'concerned', 'urgent', 'serious', 'emergency', 'pain', 'severe',
      'worse', 'worsening', 'deteriorating', 'complications'
    ];

    const positiveKeywords = [
      'better', 'improving', 'good', 'normal', 'healthy', 'stable',
      'healing', 'recovery', 'progress'
    ];

    const lowerText = text.toLowerCase();
    const concerningCount = concerningKeywords.filter(word => lowerText.includes(word)).length;
    const positiveCount = positiveKeywords.filter(word => lowerText.includes(word)).length;

    let overall: 'positive' | 'neutral' | 'concerning';
    let confidence: number;

    if (concerningCount > positiveCount && concerningCount > 2) {
      overall = 'concerning';
      confidence = Math.min(concerningCount / 10, 0.9);
    } else if (positiveCount > concerningCount && positiveCount > 2) {
      overall = 'positive';
      confidence = Math.min(positiveCount / 10, 0.9);
    } else {
      overall = 'neutral';
      confidence = 0.6;
    }

    const concerns = concerningKeywords.filter(word => lowerText.includes(word));

    return {
      overall,
      confidence,
      concerns
    };
  }

  /**
   * Assess completeness of visit documentation
   */
  private static assessCompleteness(text: string): SummaryAnalysis['completeness'] {
    const requiredElements = [
      { name: 'chief complaint', keywords: ['complain', 'problem', 'issue', 'concern'] },
      { name: 'symptoms', keywords: ['symptom', 'feel', 'experience', 'pain', 'ache'] },
      { name: 'assessment', keywords: ['think', 'believe', 'diagnosis', 'condition'] },
      { name: 'plan', keywords: ['plan', 'recommend', 'suggest', 'treatment', 'follow'] }
    ];

    const lowerText = text.toLowerCase();
    const foundElements: string[] = [];
    const missingElements: string[] = [];

    requiredElements.forEach(element => {
      const found = element.keywords.some(keyword => lowerText.includes(keyword));
      if (found) {
        foundElements.push(element.name);
      } else {
        missingElements.push(element.name);
      }
    });

    const score = foundElements.length / requiredElements.length;

    return {
      score,
      missingElements
    };
  }

  /**
   * Get default analysis when processing fails
   */
  private static getDefaultAnalysis(): SummaryAnalysis {
    return {
      medicalTerms: {
        medications: [],
        symptoms: [],
        procedures: [],
        diagnoses: []
      },
      sentiment: {
        overall: 'neutral',
        confidence: 0.5,
        concerns: []
      },
      completeness: {
        score: 0.5,
        missingElements: ['Unable to analyze due to processing error']
      }
    };
  }

  /**
   * Storage methods (in production, use encrypted backend storage)
   */
  private static async storeSummarySecurely(summary: VisitSummary, userId: string): Promise<void> {
    try {
      // Store securely with encryption
      await SecureStorageService.storeSummarySecurely(summary, userId);

      // Store metadata in legacy storage for compatibility (no PHI)
      const summaries = this.getStoredSummaries();
      const summaryMeta = {
        id: summary.id,
        recordingId: summary.recordingId,
        generatedAt: summary.generatedAt,
        confidence: summary.confidence,
        isEncrypted: true
      };
      summaries.push(summaryMeta);

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('healthnav_summaries', JSON.stringify(summaries));
      }

      console.log('Summary stored securely:', summary.id);
    } catch (error) {
      console.error('Error storing summary:', error);
    }
  }

  private static storeSummaries(summaries: VisitSummary[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('healthnav_summaries', JSON.stringify(summaries));
      }
    } catch (error) {
      console.error('Error storing summaries:', error);
    }
  }

  private static getStoredSummaries(): VisitSummary[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem('healthnav_summaries');
        return stored ? JSON.parse(stored) : [];
      }
      return [];
    } catch (error) {
      console.error('Error retrieving summaries:', error);
      return [];
    }
  }
}
