/**
 * Decode exactly one XML-entity layer around a GUS SOAP result.
 * Newly produced entity text stays escaped until the inner XML parser runs.
 */
export function decodeSoapXml(encoded: string): string {
  return encoded.replace(/&(amp|lt|gt|quot|apos);/g, (entity: string) => {
    switch (entity) {
      case '&amp;': return '&';
      case '&lt;': return '<';
      case '&gt;': return '>';
      case '&quot;': return '"';
      case '&apos;': return "'";
      default: return entity;
    }
  });
}
