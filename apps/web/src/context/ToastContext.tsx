/**
 * @file context/ToastContext.tsx
 * @description Lightweight toast notification system.
 *
 * Provides a `useToast` hook that lets any component push transient messages
 * to a fixed overlay.  Toasts auto-dismiss after `duration` ms (default 4 s).
 *
 * Usage:
 * ```tsx
 * const { toast } = useToast();
 * toast({ message: 'Task updated!', type: 'success' });
 * ```
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
  ReactNode,
} from 'react';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  /** Push a new toast. */
  toast: (opts: { message: string; type?: ToastType; duration?: number }) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

const colorMap: Record<ToastType, string> = {
  success: 'bg-green-600',
  error:   'bg-red-600',
  info:    'bg-brand-600',
  warning: 'bg-yellow-500',
};

const iconMap: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
};

/**
 * Wrap your app (or `<Layout>`) with this provider to enable toasts globally.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback(
    ({ message, type = 'info', duration = 4000 }: { message: string; type?: ToastType; duration?: number }) => {
      const id = `toast-${++counter.current}`;
      setItems((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), duration);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container — fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
        {items.map((item) => (
          <div
            key={item.id}
            className={clsx(
              'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm',
              'animate-slide-in pointer-events-auto',
              colorMap[item.type]
            )}
          >
            <span className="font-bold shrink-0">{iconMap[item.type]}</span>
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns the `toast()` function for pushing transient notifications.
 * Must be used inside `<ToastProvider>`.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
