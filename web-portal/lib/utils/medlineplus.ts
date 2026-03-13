const SEARCH_BASE = 'https://vsearch.nlm.nih.gov/vivisimo/cgi-bin/query-meta?v%3Aproject=medlineplus&v%3Asources=medlineplus-bundle&query=';

/**
 * Get MedlinePlus URL for a given name.
 * - Conditions: routes through /api/medlineplus which resolves a direct topic page (302 redirect).
 * - Medications: links to a targeted MedlinePlus search.
 */
export function getMedlinePlusUrl(name: string, type: 'medication' | 'condition' = 'condition'): string {
  if (type === 'condition') {
    return `/api/medlineplus?name=${encodeURIComponent(name)}&type=condition`;
  }
  const query = `${name} medication`;
  return `${SEARCH_BASE}${encodeURIComponent(query)}`;
}
