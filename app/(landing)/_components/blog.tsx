'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';

import { asset } from '../_assets';
import { Container, SectionHeading } from './ui';

const POSTS = [
  {
    title: 'The new era of intelligent financial automation (2026)',
    body: 'How modern teams streamline operations with automated financial workflows.',
    image: asset.blog[0],
  },
  {
    title: 'How startups can stay organized during rapid growth',
    body: 'A practical guide to keeping your financial operations steady while scaling.',
    image: asset.blog[1],
  },
  {
    title: 'A powerful financial dashboard that your team will actually use',
    body: 'What makes a financial dashboard effective and easy for teams to adopt.',
    image: asset.blog[2],
  },
];

export function Blog() {
  return (
    <section id="blog" className="bg-[var(--z-50)] py-20 lg:py-[100px]">
      <Container className="flex flex-col gap-16">
        <SectionHeading
          align="left"
          title="Insights and resources"
          lead="Practical guides and ideas to help modern teams improve their financial workflow."
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {POSTS.map((p, i) => (
            <motion.article
              key={p.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{
                duration: 0.6,
                delay: i * 0.08,
                ease: [0.44, 0, 0.56, 1],
              }}
              className="flex flex-col gap-5 rounded-[20px] bg-white p-5 transition-shadow duration-300 hover:shadow-[0_16px_40px_-16px_rgba(16,32,64,0.22)]"
            >
              <div className="overflow-hidden rounded-[14px]">
                <Image
                  src={p.image}
                  alt={p.title}
                  width={372}
                  height={274}
                  className="h-auto w-full transition-transform duration-500 hover:scale-[1.04]"
                />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="z-lead font-medium">{p.title}</h3>
                <p className="z-body text-[var(--z-muted)]">{p.body}</p>
              </div>
              <Link
                href="/blog"
                className="z-body mt-auto w-fit font-medium underline underline-offset-4"
              >
                Read more
              </Link>
            </motion.article>
          ))}
        </div>
      </Container>
    </section>
  );
}
