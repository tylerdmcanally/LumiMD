import { Linking } from 'react-native';

/** Search fallback URL for MedlinePlus */
export function getMedlinePlusSearchUrl(name: string, type: 'medication' | 'condition' = 'condition'): string {
  const suffix = type === 'medication' ? 'medication' : 'health condition';
  const query = `${name} ${suffix}`;
  return `https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&v%3Asources=medlineplus-bundle&query=${encodeURIComponent(query)}`;
}

/** For backwards compat — returns the search URL */
export function getMedlinePlusUrl(name: string, type: 'medication' | 'condition' = 'condition'): string {
  return getMedlinePlusSearchUrl(name, type);
}

/**
 * Open MedlinePlus for a given condition or medication.
 * For conditions, tries the NLM Health Topics API first to get a direct page URL.
 * Falls back to search for medications or if the API doesn't return a match.
 */
export async function openMedlinePlus(name: string, type: 'medication' | 'condition' = 'condition'): Promise<void> {
  if (type === 'condition') {
    try {
      const resp = await fetch(
        `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(name)}&retmax=1`,
      );
      const xml = await resp.text();
      const urlMatch = xml.match(/url="([^"]+)"/);
      if (urlMatch?.[1]) {
        await Linking.openURL(urlMatch[1]);
        return;
      }
    } catch {
      // Fall through to search
    }
  }
  await Linking.openURL(getMedlinePlusSearchUrl(name, type));
}
