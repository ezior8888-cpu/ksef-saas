'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';

import { asset } from '../_assets';

const LINKS = [
  { label: 'Start', href: '/' },
  { label: 'O nas', href: '/about' },
  { label: 'Cennik', href: '#pricing' },
  { label: 'Blog', href: '#blog' },
  { label: 'Kontakt', href: '#contact' },
];

/**
 * Pływająca pigułka nawigacji — zmierzona na oryginale: 600×63, 20 px od
 * góry, promień 16, cień `0 5px 10px rgba(0,0,0,.08)`, padding 10/12.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.44, 0, 0.56, 1] }}
      className="fixed inset-x-0 top-7 z-50 flex justify-center px-5"
    >
      <nav
        className="flex w-full max-w-[720px] items-center justify-between rounded-[16px] bg-white p-[10px_12px]"
        style={{ boxShadow: '0 5px 10px 0 rgba(0,0,0,0.08)' }}
      >
        <Link href="/" className="flex shrink-0 items-center pl-1">
          <Image
            src={asset.logo}
            alt="FaktFlow"
            width={24}
            height={24}
            priority
          />
        </Link>

        <ul className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <li key={l.label}>
              <Link
                href={l.href}
                className="z-body font-medium text-[var(--z-black)] transition-opacity hover:opacity-60"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href="/register"
            className="z-body group hidden h-[43px] items-center gap-1.5 rounded-[10px] bg-[var(--z-black)] px-4 font-medium text-white transition-transform hover:scale-[1.02] md:inline-flex"
          >
            Wypróbuj za darmo
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Zamknij menu' : 'Otwórz menu'}
            className="z-body inline-flex h-[43px] items-center gap-2 rounded-[10px] bg-[var(--z-black)] px-3 font-medium text-white md:hidden"
          >
            Menu
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </nav>

      {open ? (
        <div
          className="absolute left-5 right-5 top-[76px] rounded-[16px] bg-white p-4 md:hidden"
          style={{ boxShadow: '0 5px 10px 0 rgba(0,0,0,0.08)' }}
        >
          <ul className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="z-body block rounded-lg px-3 py-2.5 font-medium text-[var(--z-black)] hover:bg-[var(--z-100)]"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="mt-1">
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="z-body flex items-center justify-center gap-1.5 rounded-[10px] bg-[var(--z-black)] px-4 py-3 font-medium text-white"
              >
                Wypróbuj za darmo
                <ArrowRight className="size-4" />
              </Link>
            </li>
          </ul>
        </div>
      ) : null}
    </motion.div>
  );
}
