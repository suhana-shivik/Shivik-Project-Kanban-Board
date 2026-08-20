import { Search, X } from "lucide-react";
import { STATUS_OPTIONS } from "../../../domain/valueObjects/Status";

// The search field in both toolbars: enter submits, the × clears.
export function SearchBox({ value, onChange, onSubmit, placeholder }) {
  return (
    <div className="search-box">
      <Search size={18} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          onSubmit?.();
        }}
        placeholder={placeholder}
      />
      {value && (
        <button
          className="clear-search"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

// Active / Inactive is the same choice on materials and on users.
export function StatusSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by status"
    >
      <option value="">All status</option>
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
