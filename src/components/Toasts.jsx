import { useCallback, useRef, useState } from 'react';

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (message, type = 'info') => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, message, type }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return { toasts, notify, dismiss };
}

export function ToastRegion({ toasts, dismiss }) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
          <p>{toast.message}</p>
          <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
