import { NextResponse } from 'next/server';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENAI_MEDICATION_MODEL ?? 'gpt-4o-mini';

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing OpenAI API key. Set OPENAI_API_KEY in the environment.' },
      { status: 500 },
    );
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const medicationName = body.name?.trim();
  if (!medicationName) {
    return NextResponse.json({ error: 'Medication name is required.' }, { status: 400 });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a clinical assistant. When asked about a medication, respond with concise, evidence-based information appropriate for patients.',
          },
          {
            role: 'user',
            content: `For the medication "${medicationName}", provide:
- "short_indication": 1 to 4 words describing the primary indication (lowercase except proper nouns, ideally starting with "for ...").
- "detailed_indication": a single, patient-friendly sentence (max 40 words) explaining the typical use case.
- "drug_class": the high-level pharmacologic class (e.g., "statin", "loop diuretic").
Return strict JSON with those keys. If any detail is unknown, set the value to "Not available".`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[medication insight] OpenAI error', response.status, errorText);
      return NextResponse.json(
        { error: 'Unable to retrieve medication insight.' },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawContent = payload.choices?.[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json(
        { error: 'Unexpected response from OpenAI.' },
        { status: 502 },
      );
    }

    let parsed: {
      short_indication?: string;
      detailed_indication?: string;
      drug_class?: string;
    } | null = null;
    try {
      parsed = JSON.parse(rawContent) as {
        short_indication?: string;
        detailed_indication?: string;
        drug_class?: string;
      };
    } catch (error) {
      console.error('[medication insight] Failed to parse OpenAI JSON', error, rawContent);
      return NextResponse.json(
        { error: 'Failed to parse response from OpenAI.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      shortIndication: (parsed.short_indication ?? '').trim(),
      detailedIndication: (parsed.detailed_indication ?? '').trim(),
      drugClass: (parsed.drug_class ?? '').trim(),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Request to OpenAI timed out.' }, { status: 504 });
    }

    console.error('[medication insight] Unexpected error', error);
    return NextResponse.json(
      { error: 'Unexpected error while fetching medication insight.' },
      { status: 500 },
    );
  }
}


