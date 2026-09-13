/**
 * Pure reporting boundary: bundle contents and matched values never leave it.
 * Only the caller-provided file name and first match offset are returned.
 */

/**
 * @param {string} source
 * @param {string} value
 * @param {string} file
 * @returns {{ file: string, offset: number } | null}
 */
export function findBundleMatchLocation(source, value, file) {
  if (value.length === 0) return null;
  const offset = source.indexOf(value);
  return offset < 0 ? null : { file, offset };
}

/**
 * Metadata can contain Markdown, HTML or control characters too. Encode every
 * character outside a small readable set; never place bundle text in this API.
 * @param {string} value
 * @returns {string}
 */
export function formatBundleReportCode(value) {
  const encoded = Array.from(value, (character) =>
    /^[a-zA-Z0-9 ./:-]$/.test(character)
      ? character
      : '&#' + character.codePointAt(0) + ';',
  ).join('');
  return '<code>' + encoded + '</code>';
}
