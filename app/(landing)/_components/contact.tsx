'use client';

import { motion } from 'framer-motion';

import { asset } from '../_assets';
import { MaskReveal, MaskRevealWords } from './mask-reveal';
import { Container, Icon } from './ui';

const DETAILS = [
  { icon: '986463349', value: '412-483-8261' },
  { icon: '4022663340', value: 'support@zovasaas.com' },
  { icon: '1743809183', value: '210 Market St. Suite 402\nSan Francisco, CA' },
];

export function Contact() {
  return (
    <section id="contact" className="py-20 lg:py-[100px]">
      <Container className="flex flex-col items-center gap-16">
        {/* Nagłówek: 550 wyśrodkowany. Pas poniżej: 946, w nim wąska
            kolumna 274 z danymi kontaktowymi i formularz na resztę. */}
        <div className="flex w-full max-w-[550px] flex-col items-center gap-5 text-center">
          <h2 className="z-h2 w-full">
            <MaskRevealWords text="Get in touch" />
          </h2>
          <MaskReveal delay={0.18}>
            <p className="z-lead text-[var(--z-muted)]">
              Reach out to our team at any time for support or questions and
              we’ll get back to you within 2 business days.
            </p>
          </MaskReveal>
        </div>

        <div className="flex w-full max-w-[946px] flex-col gap-10 lg:flex-row lg:items-start">
          <div className="flex flex-col gap-8 lg:w-[274px] lg:shrink-0">

            <ul className="flex flex-col gap-4">
              {DETAILS.map((d) => (
                <li key={d.value} className="flex items-start gap-3">
                  <Icon id={d.icon} size={22} />
                  <span className="z-body whitespace-pre-line text-[var(--z-muted)]">
                    {d.value}
                  </span>
                </li>
              ))}
            </ul>

            <video
              src={asset.contact.video}
              width={274}
              height={274}
              autoPlay
              loop
              muted
              playsInline
              className="size-[274px] object-contain"
            />
          </div>

          {/* formularz — 946×628 w oryginale, tu jako reszta szerokości */}
          <motion.form
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.44, 0, 0.56, 1] }}
            className="flex w-full flex-col gap-5 rounded-[20px] border border-[var(--z-300)] bg-white p-6 lg:p-8"
            onSubmit={(e) => e.preventDefault()}
          >
            <h3 className="z-h4">How can we help you today?</h3>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Name">
                <input type="text" name="name" className={INPUT} />
              </Field>
              <Field label="Email">
                <input type="email" name="email" className={INPUT} />
              </Field>
            </div>

            <Field label="Topic">
              <select name="topic" className={INPUT} defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                <option>Product</option>
                <option>Support</option>
              </select>
            </Field>

            <Field label="Message">
              <textarea name="message" rows={5} className={INPUT} />
            </Field>

            <button
              type="submit"
              className="z-body inline-flex w-fit items-center rounded-[12px] bg-[var(--z-black)] px-6 py-3.5 font-medium text-white transition-transform hover:scale-[1.02]"
            >
              Submit
            </button>
          </motion.form>
        </div>
      </Container>
    </section>
  );
}

const INPUT =
  'z-body w-full rounded-[12px] border border-[var(--z-300)] bg-white px-4 py-3 outline-none transition-colors focus:border-[var(--z-black)]';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="z-small font-medium text-[var(--z-muted)]">{label}</span>
      {children}
    </label>
  );
}
