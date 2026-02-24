import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ActionTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_STYLES: Record<ActionTone, string> = {
  neutral: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
  info: 'text-blue-600 hover:text-blue-700 hover:bg-blue-50',
  success: 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50',
  warning: 'text-amber-600 hover:text-amber-700 hover:bg-amber-50',
  danger: 'text-rose-600 hover:text-rose-700 hover:bg-rose-50',
};

export default function ActionIconButton({
  label,
  tone = 'neutral',
  disabled,
  onClick,
  children,
  className,
}: {
  label: string;
  tone?: ActionTone;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('h-8 w-8 rounded-md border border-transparent', TONE_STYLES[tone], className)}
    >
      {children}
    </Button>
  );
}

