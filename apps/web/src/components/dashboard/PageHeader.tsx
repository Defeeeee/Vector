import { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}

export default function PageHeader({ eyebrow, title, action, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-8">
      {/* Eyebrow leads the title instead of trailing it: it says what section
          you are in, which is only useful *before* you read the heading. The
          accent bar that used to sit here is gone — with a neutral eyebrow the
          stack reads cleaner, and the accent is spent elsewhere on the page. */}
      <div className="space-y-2 md:space-y-3">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight text-zinc-900 dark:text-white leading-none">{title}</h2>
        {children}
      </div>
      {action && <div className="flex items-center gap-3 self-start md:self-auto">{action}</div>}
    </div>
  );
}
