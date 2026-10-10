export interface ToastState {
  type: "success" | "error";
  message: string;
}

export default function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div
      className={`fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-xl text-sm font-medium shadow-xl text-white ${
        toast.type === "success" ? "bg-success" : "bg-danger"
      }`}
    >
      {toast.message}
    </div>
  );
}
