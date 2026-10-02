/** HTTP response headers are untrusted even when the audit targets our domain. */
/** @param {string} value @param {number} [maxLength] */
export function formatUntrustedHeader(value, maxLength) {
  const printable = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g, ' ');
  const limited = maxLength !== undefined && printable.length > maxLength
    ? `${printable.slice(0, maxLength)}…`
    : printable;

  // Keep tables intact and neutralize Markdown links, GFM autolinks and HTML.
  return limited.replace(/[&|`<>\[\]\\!*_#~:.@]/g, (char) => `&#${char.charCodeAt(0)};`);
}
