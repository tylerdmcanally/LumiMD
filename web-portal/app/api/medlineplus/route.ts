import { NextRequest, NextResponse } from 'next/server';

const SEARCH_BASE = 'https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&v%3Asources=medlineplus-bundle&query=';

function getSearchUrl(name: string, type: string): string {
  const suffix = type === 'medication' ? 'medication' : 'health condition';
  return `${SEARCH_BASE}${encodeURIComponent(`${name} ${suffix}`)}`;
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  const type = req.nextUrl.searchParams.get('type') || 'condition';

  if (!name) {
    return NextResponse.redirect('https://medlineplus.gov');
  }

  // For conditions, try the Health Topics API for a direct page URL
  if (type === 'condition') {
    try {
      const resp = await fetch(
        `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(name)}&retmax=1`,
        { signal: AbortSignal.timeout(3000) },
      );
      const xml = await resp.text();
      const urlMatch = xml.match(/url="([^"]+)"/);
      if (urlMatch?.[1]) {
        try {
          const parsed = new URL(urlMatch[1]);
          if (parsed.hostname === 'medlineplus.gov' || parsed.hostname.endsWith('.medlineplus.gov')) {
            return NextResponse.redirect(urlMatch[1]);
          }
        } catch {
          // Invalid URL, fall through to search
        }
      }
    } catch {
      // Fall through to search
    }
  }

  return NextResponse.redirect(getSearchUrl(name, type));
}
