// The "loading" and "nothing here" panels both tables show in place of rows.
export function TableState({ loading, loadingText, title, hint }) {
  if (loading) {
    return (
      <div className="table-state">
        <div className="spinner" />
        <span>{loadingText}</span>
      </div>
    );
  }

  return (
    <div className="table-state">
      <div className="empty-icon">□</div>
      <strong>{title}</strong>
      <span>{hint}</span>
    </div>
  );
}
