import { describe, expect, it } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { decodeSoapXml } from '@/lib/gus/xml-entities';

describe('GUS SOAP XML entity decoding', () => {
  it('decodes each supported entity once, including adjacent entities', () => {
    expect(decodeSoapXml('&lt;&gt;&quot;&apos;&amp;')).toBe('<>"\'&');
    expect(decodeSoapXml('&amp;lt; &amp;gt; &amp;quot; &amp;apos; &amp;amp;'))
      .toBe('&lt; &gt; &quot; &apos; &amp;');
  });

  it('leaves unknown entities and ordinary company text unchanged', () => {
    expect(decodeSoapXml('Firma Zażółć &unknown; &#60;')).toBe('Firma Zażółć &unknown; &#60;');
  });

  it.each([
    {
      encodedName: 'Firma A &amp;amp; B',
      expected: 'Firma A & B',
    },
    {
      encodedName: 'Firma &amp;lt;Laboratorium&amp;gt;',
      expected: 'Firma <Laboratorium>',
    },
    {
      encodedName: 'Firma literalne &amp;amp;lt; i &amp;amp;gt;',
      expected: 'Firma literalne &lt; i &gt;',
    },
    {
      encodedName: 'Firma &amp;quot;Test&amp;quot; &amp;apos;Oddział&amp;apos;',
      expected: 'Firma "Test" \'Oddział\'',
    },
  ])('preserves company text through SOAP decoding and the inner XML parser: $expected', ({ encodedName, expected }) => {
    const soapResult = '&lt;root&gt;&lt;dane&gt;&lt;Nazwa&gt;' + encodedName + '&lt;/Nazwa&gt;&lt;/dane&gt;&lt;/root&gt;';
    const parsed = new XMLParser({ parseTagValue: false }).parse(decodeSoapXml(soapResult)) as {
      root: { dane: { Nazwa: string } };
    };
    expect(parsed).toEqual({ root: { dane: { Nazwa: expected } } });
  });

  it('keeps encoded markup inside a company name as text, not injected record fields', () => {
    const soapResult = '&lt;root&gt;&lt;dane&gt;&lt;Nazwa&gt;Firma &amp;lt;/Nazwa&amp;gt;&amp;lt;Nip&amp;gt;1234567890&amp;lt;/Nip&amp;gt;&lt;/Nazwa&gt;&lt;/dane&gt;&lt;/root&gt;';
    const parsed = new XMLParser({ parseTagValue: false }).parse(decodeSoapXml(soapResult)) as {
      root: { dane: { Nazwa: string; Nip?: string } };
    };
    expect(parsed.root.dane.Nazwa).toBe('Firma </Nazwa><Nip>1234567890</Nip>');
    expect(parsed.root.dane.Nip).toBeUndefined();
  });
});
