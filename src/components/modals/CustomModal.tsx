"use client"

import type * as React from "react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface CustomModalProps {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  showCloseButton?: boolean
  contentClassName?: string
  headerClassName?: string
  footerClassName?: string
  maxHeight?: string
  width?: string
  scrollAreaClassName?: string
  // Override where focus goes when the modal opens / closes. Defaults keep
  // focus where it is on open and let Radix handle the close.
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
}

export function CustomModal({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  showCloseButton = true,
  contentClassName,
  headerClassName,
  footerClassName,
  maxHeight = "85vh",
  width = "max-w-2xl",
  scrollAreaClassName,
  onOpenAutoFocus = (e) => e.preventDefault(),
  onCloseAutoFocus
}: CustomModalProps) {
  // Lay the dialog out as a column — header/footer stay pinned to the top and
  // bottom (shrink-0) while the ScrollArea claims the remaining space
  // (flex-1 min-h-0). Without this, the shared DialogContent uses `grid` +
  // `h-full`, which at short viewport heights (e.g. 1366×768) lets the inner
  // ScrollArea's hard-coded `max-h-[60vh]` exceed the outer `maxHeight` and
  // push the footer outside the bordered modal container.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn("!flex !flex-col !h-auto", width, contentClassName)}
        style={{ maxHeight }}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {(title || description) && (
          <DialogHeader className={cn("shrink-0", headerClassName)}>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}

        <ScrollArea className={cn("flex-1 min-h-0 pr-4 not-scro", scrollAreaClassName)}>
          <div className="space-y-6">{children}</div>
        </ScrollArea>

        {footer && (
          <DialogFooter className={cn("shrink-0", footerClassName)}>
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
