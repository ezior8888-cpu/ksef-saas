import { ImageResponse } from 'next/og';

export const alt = 'KSeF SaaS — Faktury KSeF dla mikrofirm';
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              background: '#000',
              color: '#fff',
              borderRadius: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '48px',
              fontWeight: 700,
            }}
          >
            K
          </div>
          <div
            style={{
              fontSize: '40px',
              fontWeight: 600,
              letterSpacing: '-0.03em',
            }}
          >
            KSeF SaaS
          </div>
        </div>
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
