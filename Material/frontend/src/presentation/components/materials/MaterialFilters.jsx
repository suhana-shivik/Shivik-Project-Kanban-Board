import { UOM_GROUPS } from "../../../domain/valueObjects/UOM";
import { SearchBox, StatusSelect } from "../common/SearchBox";

export function MaterialFilters({
  query,
  setQuery,
  status,
  setStatus,
  uom,
  setUom,
  onSearch,
  onClear
}) {
  const dirty = Boolean(query || status || uom);

  return (
    <div className="filters">
      <SearchBox
        value={query}
        onChange={setQuery}
        onSubmit={onSearch}
        placeholder="Search by material name or item code..."
      />

      <select
        value={uom}
        onChange={(e) => setUom(e.target.value)}
        aria-label="Filter by unit of measure"
      >
        <option value="">All UOM</option>
        {UOM_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <StatusSelect value={status} onChange={setStatus} />

      {dirty && (
        <button className="button ghost" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
