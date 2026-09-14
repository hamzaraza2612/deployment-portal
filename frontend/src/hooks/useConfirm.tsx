import { useCallback, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  message: string;
  resolve: (value: boolean) => void;
}

/** Renders `{modal}` wherever the page lives, and `await confirm(...)` replaces window.confirm. */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ message, resolve, ...options });
    });
  }, []);

  const modal = pending ? (
    <ConfirmModal
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      danger={pending.danger}
      onConfirm={() => {
        pending.resolve(true);
        setPending(null);
      }}
      onCancel={() => {
        pending.resolve(false);
        setPending(null);
      }}
    />
  ) : null;

  return { confirm, modal };
}
