"use client";

interface HeadlineProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export default function Headline({ title, subtitle, children }: HeadlineProps) {
  return (
    <div className="mb-8 md:mb-12 text-center">
      <h2 className="text-3xl md:text-4xl font-bold leading-tight mb-2 font-heading dark:text-slate-300">
        {title}
      </h2>
      {subtitle && <p className="text-xl text-base-content/70">{subtitle}</p>}
      {children}
    </div>
  );
}
