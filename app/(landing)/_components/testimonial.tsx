'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

import { asset } from '../_assets';
import { Container } from './ui';

export function Testimonial() {
  return (
    <section className="bg-[var(--z-50)] py-20 lg:py-[100px]">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: [0.44, 0, 0.56, 1] }}
          className="flex flex-col items-center gap-10 lg:flex-row lg:items-end lg:gap-16"
        >
          <div className="w-full max-w-[369px] shrink-0 overflow-hidden rounded-[20px]">
            <Image
              src={asset.testimonial.portrait}
              alt="Marcin Zawadzki"
              width={369}
              height={439}
              className="h-auto w-full"
            />
          </div>

          <div className="flex flex-col gap-8 pb-4">
            <p className="z-h4">
              “Wysyłam faktury z telefonu w drodze do klienta. Wcześniej
              siedziałem nad tym wieczorami w Excelu.”
            </p>
            <div className="flex flex-col gap-1">
              <span className="z-lead font-medium">Marcin Zawadzki</span>
              <span className="z-lead font-medium text-[var(--z-muted)]">
                Usługi remontowe, Poznań
              </span>
            </div>
            <Image
              src={asset.testimonial.logo}
              alt="Logo klienta"
              width={156}
              height={32}
              className="h-8 w-auto object-contain"
            />
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
