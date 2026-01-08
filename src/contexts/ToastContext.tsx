import React, {
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";
import {
  CheckCircle,
  AlertCircle,
  X,
  Info,
  AlertTriangle,
} from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning" | "confirm";

interface ToastOptions {
  duration?: number;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  options?: ToastOptions;
}

interface ToastContextType {
  toast: {
    success: (msg: string, opts?: ToastOptions) => void;
    error: (msg: string, opts?: ToastOptions) => void;
    info: (msg: string, opts?: ToastOptions) => void;
    warning: (msg: string, opts?: ToastOptions) => void;
    confirm: (msg: string, onConfirm: () => void, opts?: ToastOptions) => void;
    dismiss: (id: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType, options?: ToastOptions) => {
      const id = Math.random().toString(36).substring(7);
      const newToast = { id, message, type, options };

      setToasts([newToast]);

      if (type !== "confirm") {
        const duration = options?.duration || 4000;
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  const api = {
    success: (msg: string, opts?: ToastOptions) =>
      addToast(msg, "success", opts),
    error: (msg: string, opts?: ToastOptions) => addToast(msg, "error", opts),
    info: (msg: string, opts?: ToastOptions) => addToast(msg, "info", opts),
    warning: (msg: string, opts?: ToastOptions) =>
      addToast(msg, "warning", opts),
    confirm: (msg: string, onConfirm: () => void, opts?: ToastOptions) =>
      addToast(msg, "confirm", { ...opts, onConfirm }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={{ toast: api }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  const t = toasts[0];

  const styles = {
    success: {
      icon: CheckCircle,
      border: "border-green-200",
      bg: "bg-white",
      text: "text-green-600",
      glow: "shadow-green-500/10",
    },
    error: {
      icon: AlertCircle,
      border: "border-red-200",
      bg: "bg-white",
      text: "text-red-600",
      glow: "shadow-red-500/10",
    },
    warning: {
      icon: AlertTriangle,
      border: "border-yellow-200",
      bg: "bg-white",
      text: "text-red-600",
      glow: "shadow-red-500/10",
    },
    info: {
      icon: Info,
      border: "border-blue-200",
       bg: "bg-white",
      text: "text-blue-600",
      glow: "shadow-blue-500/10",
    },
    confirm: {
      icon: AlertTriangle,
      border: "border-purple-500/50",
       bg: "bg-white",
      text: "text-purple-400",
      glow: "shadow-purple-500/10",
    },
  };

  const currentStyle = styles[t.type];
  const Icon = currentStyle.icon;

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center justify-center pointer-events-none">
      <div
        className={`
          pointer-events-auto
          flex items-center gap-4 px-5 py-4 
          rounded-2xl border ${currentStyle.border} ${currentStyle.bg} backdrop-blur-md
          shadow-xl ${currentStyle.glow}
          animate-in slide-in-from-top-5 fade-in duration-300
          min-w-[320px] max-w-[90vw]
        `}
      >
        <div className={`p-2 rounded-full bg-white/5 ${currentStyle.text}`}>
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{t.message}</p>
        </div>

        {t.type === "confirm" ? (
          <div className="flex gap-2 ml-2">
            <button
              onClick={() => {
                if (t.options?.onCancel) t.options.onCancel();
                dismiss(t.id);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            >
              {t.options?.cancelText || "Cancel"}
            </button>
            <button
              onClick={() => {
                t.options?.onConfirm?.();
                dismiss(t.id);
              }}
              className="px-3 py-1.5 text-xs font-bold text-slate-900 bg-white hover:bg-slate-200 rounded-md transition-colors shadow-lg shadow-white/10"
            >
              {t.options?.confirmText || "Confirm"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => dismiss(t.id)}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {t.type !== "confirm" && (
        <div className="w-full h-1 mt-2 overflow-hidden rounded-full max-w-[300px]">
          <div
            className="h-full bg-slate-300 animate-shrink-width"
            style={{ animationDuration: "4s" }}
          ></div>
        </div>
      )}
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context.toast;
}
