import { useEffect, useRef } from 'react';

/**
 * Modal — accessible dialog primitive
 *
 * Features:
 * - Escape key closes
 * - Click outside (backdrop) closes
 * - Focus trap within dialog
 * - Restores focus to the previously focused element on close
 * - role="dialog" + aria-modal + aria-labelledby
 * - Uses --ds-* tokens (no inline hex)
 *
 * Props:
 *   open         boolean       whether dialog is visible
 *   onClose      () => void    called on Escape, backdrop click, or close button
 *   title        string|node   shown in header (required for aria-labelledby)
 *   children     node          dialog body
 *   footer       node?         optional footer content
 *   width        string|number default '560px', e.g. '720px', 480
 *   closeOnBackdrop  bool      default true
 *
 * Usage:
 *   <Modal open={show} onClose={() => setShow(false)} title="Confirmar">
 *     ...body...
 *   </Modal>
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = '560px',
  closeOnBackdrop = true,
}) {
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);

  // Capture the element that was focused before the modal opened so we can
  // restore focus on close. This is a standard a11y pattern — without it,
  // keyboard users end up at <body> after closing.
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    // Focus the dialog container on mount so screen readers announce it
    // and keyboard users can tab into it.
    setTimeout(() => {
      const firstFocusable = dialogRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable || dialogRef.current)?.focus?.();
    }, 0);
    return () => {
      previousFocus.current?.focus?.();
    };
  }, [open]);

  // Escape key + focus trap
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'modalFadeIn 0.15s ease',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card, var(--subtle-bg))',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--ds-radius-lg, 12px)',
          width: typeof width === 'number' ? `${width}px` : width,
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--ds-shadow-lg, 0 20px 60px rgba(0,0,0,0.4))',
          outline: 'none',
          fontFamily: 'var(--fm)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div
            id={titleId}
            style={{
              fontSize: 'var(--ds-font-lg, 16px)',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
              padding: 4,
              borderRadius: 6,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            ×
          </button>
        </div>

        {/* Body (scrollable) */}
        <div
          style={{
            padding: 20,
            overflowY: 'auto',
            flex: 1,
            fontSize: 'var(--ds-font-md, 14px)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {children}
        </div>

        {/* Footer (optional) */}
        {footer && (
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
