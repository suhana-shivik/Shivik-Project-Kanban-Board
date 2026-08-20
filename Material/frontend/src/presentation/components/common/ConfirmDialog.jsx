import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  title = "Confirm action",
  message,
  confirmText = "Delete",
  onConfirm,
  onClose,
  danger = true
}) {
  return (
    <Modal open={open} title={title} onClose={onClose} width={430}>
      <p className="confirm-message">{message}</p>
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>Cancel</button>
        <button
          className={`button ${danger ? "danger" : "primary"}`}
          onClick={onConfirm}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
