export function getMedlinePlusUrl(name: string): string {
  return `https://medlineplus.gov/search/?query=${encodeURIComponent(name)}`;
}
