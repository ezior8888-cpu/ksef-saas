import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Text,
} from '@react-email/components';

import { DUPLICATE_DECISION_TEXTS } from '@/lib/ksef/duplicate-decision';

/**
 * „Faktura … czeka na Twoją decyzję” (D-A4-1b-3 PR B, spec §2.8, teksty 2.11.C):
 * KSeF ma już fakturę firmy o numerze tego dokumentu, a FaktFlow nie
 * rozstrzygnął, czy to ta sama sprzedaż. Teksty: `DUPLICATE_DECISION_TEXTS.NOTICE`
 * (przegląd prawnika przed KSeF PROD — decyzje Bartosza 07.10.2026 (A), (8)).
 */
export interface InvoiceDuplicateDecisionProps {
  invoiceId: string;
  invoiceNumber: string;
  ksefNumber: string;
  /** Przypomnienie operatora („Przypomnij klientowi”) — inny temat i nagłówek. */
  reminder: boolean;
  appUrl: string;
}

export default function InvoiceDuplicateDecision({
  invoiceId,
  invoiceNumber,
  ksefNumber,
  reminder,
  appUrl,
}: InvoiceDuplicateDecisionProps) {
  const T = DUPLICATE_DECISION_TEXTS.NOTICE;
  return (
    <Html lang="pl">
      <Head />
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading style={headingStyle}>
            {reminder ? T.REMINDER_SUBJECT(invoiceNumber) : T.SUBJECT(invoiceNumber)}
          </Heading>

          <Text style={textStyle}>{T.BODY(invoiceNumber, ksefNumber)}</Text>

          <Button href={`${appUrl}/invoices/${invoiceId}`} style={buttonStyle}>
            {T.BUTTON}
          </Button>

          <Hr style={hrStyle} />

          <Text style={footerStyle}>Wiadomość automatyczna z systemu KSeF SaaS.</Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  backgroundColor: '#f6f6f6',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
};
const containerStyle = {
  backgroundColor: '#ffffff',
  maxWidth: '600px',
  margin: '40px auto',
  padding: '40px',
  borderRadius: '8px',
};
const headingStyle = {
  color: '#b45309',
  fontSize: '22px',
  margin: '0 0 24px 0',
};
const textStyle = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '24px',
};
const buttonStyle = {
  backgroundColor: '#b45309',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  display: 'inline-block',
};
const hrStyle = {
  borderColor: '#e5e7eb',
  margin: '32px 0 16px 0',
};
const footerStyle = {
  color: '#9ca3af',
  fontSize: '12px',
};
