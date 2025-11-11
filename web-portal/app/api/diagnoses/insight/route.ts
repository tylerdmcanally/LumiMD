import { NextResponse } from 'next/server';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL =
  process.env.OPENAI_DIAGNOSIS_MODEL ??
  process.env.OPENAI_MEDICATION_MODEL ??
  'gpt-4o-mini';

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

  const conditionName = body.name?.trim();
  if (!conditionName) {
    return NextResponse.json({ error: 'Diagnosis name is required.' }, { status: 400 });
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
              'You are a clinical assistant. When asked about a diagnosis, respond with clear, evidence-based information that patients can understand.',
          },
          {
            role: 'user',
            content: `For the diagnosis "${conditionName}", provide:
- "brief_summary": 3 to 8 words describing the condition in plain language (lowercase except proper nouns).
- "detailed_summary": 1 to 2 patient-friendly sentences (max 60 words) explaining what the condition means, why it matters, and typical management considerations (avoid jargon, keep empathetic and factual).
Return strict JSON with those keys. If any detail is unknown, set the value to "Not available".`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[diagnosis insight] OpenAI error', response.status, errorText);
      return NextResponse.json(
        { error: 'Unable to retrieve diagnosis insight.' },
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

    let parsed:
      | {
          brief_summary?: string;
          detailed_summary?: string;
        }
      | null = null;
    try {
      parsed = JSON.parse(rawContent) as {
        brief_summary?: string;
        detailed_summary?: string;
      };
    } catch (error) {
      console.error('[diagnosis insight] Failed to parse OpenAI JSON', error, rawContent);
      return NextResponse.json(
        { error: 'Failed to parse response from OpenAI.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      briefSummary: (parsed?.brief_summary ?? '').trim(),
      detailedSummary: (parsed?.detailed_summary ?? '').trim(),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Request to OpenAI timed out.' }, { status: 504 });
    }

    console.error('[diagnosis insight] Unexpected error', error);
    return NextResponse.json(
      { error: 'Unexpected error while fetching diagnosis insight.' },
      { status: 500 },
    );
  }
}


