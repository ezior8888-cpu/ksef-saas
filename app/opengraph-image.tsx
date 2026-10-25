import { ImageResponse } from 'next/og';

import { LOCKUP } from '@/lib/brand/faktway-logo-paths';

export const alt = 'FaktWay: faktury KSeF dla mikrofirm';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          padding: '80px',
        }}
      >
        {/* Logo FaktWay z zestawu (docs/brand/logo), te same ścieżki co w aplikacji. */}
        <svg width="362" height="80" viewBox={LOCKUP.viewBox} style={{ marginBottom: '40px' }}>
          <path fill="#2463EF" d={LOCKUP.symbol.brand} />
          <path fill="#0D1936" d={LOCKUP.wordmark.brand} transform={LOCKUP.wordmark.transform} />
        </svg>
        <div
          style={{
            fontSize: '72px',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            textAlign: 'center',
            maxWidth: '900px',
          }}
        >
          Faktury, KSeF i KPiR.
        </div>
        <div
          style={{
            fontSize: '36px',
            color: '#64748b',
            marginTop: '20px',
            textAlign: 'center',
          }}
        >
          Automatyzacja, której nie ma u konkurencji.
        </div>
      </div>
    ),
    size,
  );
}
