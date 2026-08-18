'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

import { Container, Icon, SectionHeading } from './ui';

const PLANS = [
  {
    name: 'Starter',
    body: 'For individuals and early teams getting started with financial clarity.',
    price: 'Free',
    suffix: '',
    featured: false,
    features: [
      'Connect up to three data sources',
      'Basic dashboard views',
      'Standard forecasting',
      'Automated weekly reports',
      'Email support',
    ],
  },
  {
    name: 'Growth',
    body: 'For growing teams that need deeper insights and more automation.',
    price: '$49',
    suffix: '/mo',
    featured: true,
    features: [
      'Unlimited data sources',
      'Advanced dashboard customization',
      'Real time forecasting',
      'Automated daily reports',
      'Priority support',
    ],
  },
  {
    name: 'Pro',
    body: 'For established teams looking for full visibility and powerful analysis.',
    price: '$99',
    suffix: '/mo',
    featured: false,
    features: [
      'Full integrations with all tools',
      'Custom reporting and exports',
      'Team collaboration and permissions',
      'Anomaly detection alerts',
      'Dedicated account support',
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-20 lg:py-[100px]">
      <Container className="flex flex-col gap-16">
        <SectionHeading
          title="Simple pricing for every team"
          lead="Choose a plan that supports your workflow and scales as you grow."
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{
                duration: 0.6,
                delay: i * 0.08,
                ease: [0.44, 0, 0.56, 1],
              }}
              className={`flex flex-col gap-6 rounded-[20px] border p-6 ${
                p.featured
                  ? 'border-transparent bg-[var(--z-black)] text-white'
                  : 'border-[var(--z-300)] bg-white'
              }`}
            >
              <div className="flex flex-col gap-2">
                <h3 className="z-h4">{p.name}</h3>
                <p
                  className={`z-body ${p.featured ? 'text-white/70' : 'text-[var(--z-muted)]'}`}
                >
                  {p.body}
                </p>
              </div>

              <div className="flex items-end gap-1">
                <span className="z-h3">{p.price}</span>
                {p.suffix ? (
                  <span
                    className={`z-small pb-1.5 ${p.featured ? 'text-white/70' : 'text-[var(--z-muted)]'}`}
                  >
                    {p.suffix}
                  </span>
                ) : null}
              </div>

              <Link
                href="/register"
                className={`z-body inline-flex items-center justify-center rounded-[12px] px-5 py-3.5 font-medium transition-transform hover:scale-[1.02] ${
                  p.featured
                    ? 'bg-white text-[var(--z-black)]'
                    : 'bg-[var(--z-black)] text-white'
                }`}
              >
                Get started
              </Link>

              <ul className="flex flex-col gap-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Icon
                      id="4119102008"
                      size={20}
                      className={p.featured ? 'text-white' : ''}
                    />
                    <span
                      className={`z-body ${p.featured ? 'text-white/80' : 'text-[var(--z-muted)]'}`}
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
