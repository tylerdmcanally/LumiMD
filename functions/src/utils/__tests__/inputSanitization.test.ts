import { escapeHtml, sanitizePlainText } from '../inputSanitization';

describe('inputSanitization', () => {
  it('strips script/style blocks and html tags from text', () => {
    const dirty = '  Hello <b>team</b><script>alert("x")</script><style>p{}</style> <i>today</i> ';

    expect(sanitizePlainText(dirty, 500)).toBe('Hello team today');
  });

  it('truncates output to configured max length', () => {
    expect(sanitizePlainText('abcdef', 4)).toBe('abcd');
  });

  it('escapes html-sensitive characters', () => {
    expect(escapeHtml(`<tag attr="a&b">'quoted'</tag>`)).toBe(
      '&lt;tag attr=&quot;a&amp;b&quot;&gt;&#39;quoted&#39;&lt;/tag&gt;',
    );
  });
});
