import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    // Stacks until lg. Side-by-side needs room for both the title and a row of
    // action buttons; below that the title column collapses to one word per
    // line and the buttons run off the edge (portrait tablets especially).
    <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">{action}</div>}
    </div>
  );
}
