const SCRIPT_OR_STYLE_TAG_REGEX = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_TAG_REGEX = /<[^>]+>/g;
const CONTROL_CHARACTER_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function sanitizePlainText(value: unknown, maxLength = 10000): string {
  if (typeof value !== 'string') {
    return '';
  }

  let clean = value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(SCRIPT_OR_STYLE_TAG_REGEX, ' ')
    .replace(HTML_TAG_REGEX, ' ')
    .replace(CONTROL_CHARACTER_REGEX, '');

  clean = clean
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength).trimEnd();
  }

  return clean;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char);
}
