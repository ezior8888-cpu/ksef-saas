export function MarketingArticle({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-16">
      <h1 className="font-editorial text-3xl font-semibold sm:text-4xl">
        {title}
      </h1>
      <div className="mt-8 space-y-4 text-sm leading-relaxed text-zinc-500 sm:text-base">
        {children}
      </div>
    </article>
  );
}
