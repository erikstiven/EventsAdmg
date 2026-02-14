import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const BaseModal = DialogPrimitive.Root;

const BaseModalTrigger = DialogPrimitive.Trigger;

const BaseModalPortal = DialogPrimitive.Portal;

const BaseModalClose = DialogPrimitive.Close;

type BaseModalOverlayProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
  blur?: boolean;
};

const BaseModalOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  BaseModalOverlayProps
>(({ className, blur = false, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      blur && 'backdrop-blur-sm',
      className
    )}
    {...props}
  />
));
BaseModalOverlay.displayName = DialogPrimitive.Overlay.displayName;

type BaseModalContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: 'sm' | 'md' | 'lg';
  blur?: boolean;
};

const sizeClasses: Record<NonNullable<BaseModalContentProps['size']>, string> = {
  sm: 'sm:max-w-[420px]',
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[640px]',
};

const BaseModalContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  BaseModalContentProps
>(({ className, children, size = 'md', blur = false, ...props }, ref) => (
  <BaseModalPortal>
    <BaseModalOverlay blur={blur} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 flex w-[95vw] max-w-[95vw] translate-x-[-50%] translate-y-[-50%] flex-col gap-4 overflow-hidden rounded-2xl border bg-background p-4 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:w-full sm:p-6',
        'max-h-[90vh]',
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </BaseModalPortal>
));
BaseModalContent.displayName = DialogPrimitive.Content.displayName;

const BaseModalHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-left', className)} {...props} />
);
BaseModalHeader.displayName = 'BaseModalHeader';

const BaseModalBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-y-auto', className)} {...props} />
);
BaseModalBody.displayName = 'BaseModalBody';

const BaseModalFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      className
    )}
    {...props}
  />
);
BaseModalFooter.displayName = 'BaseModalFooter';

const BaseModalTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
BaseModalTitle.displayName = DialogPrimitive.Title.displayName;

const BaseModalDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
BaseModalDescription.displayName = DialogPrimitive.Description.displayName;

export {
  BaseModal,
  BaseModalTrigger,
  BaseModalPortal,
  BaseModalOverlay,
  BaseModalClose,
  BaseModalContent,
  BaseModalHeader,
  BaseModalBody,
  BaseModalFooter,
  BaseModalTitle,
  BaseModalDescription,
};
