'use client';

import {createContext, useCallback, useContext, useState, useEffect, useRef} from 'react';
import type {ReactNode} from 'react';
import {X, CheckCircle, AlertCircle, Info} from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  leaving?: boolean;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({toast: () => {}});

export function useToast() {
  return useContext(ToastContext);
}

const variantIcon: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle size={16} className="shrink-0 mt-0.5" />,
  error:   <AlertCircle size={16} className="shrink-0 mt-0.5" />,
  info:    <Info        size={16} className="shrink-0 mt-0.5" />,
};

function ToastItem({toast, onDismiss}: {toast: Toast; onDismiss: (id: string) => void}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`toast toast-${toast.variant}${toast.leaving ? ' leaving' : ''}`}
    >
      {variantIcon[toast.variant]}
      <p className="flex-1 text-sm">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({children}: {children: ReactNode}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? {...t, leaving: true} : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 200);
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, {id, message, variant}]);
  }, []);

  return (
    <ToastContext.Provider value={{toast}}>
      {children}
      <div className="toast-container" aria-label="Notifications">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
