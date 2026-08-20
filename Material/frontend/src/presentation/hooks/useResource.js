import { useCallback, useEffect, useState } from "react";

// Loading a list through a use case, with its loading and error state.
//
// Materials, categories, sub-categories and users all needed exactly this and
// each had its own copy. The differences were the field name and nothing else,
// so the callers rename `data` on the way out instead.
export function useResource(load) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(
    async (criteria = {}) => {
      try {
        setLoading(true);
        setError(null);

        const result = await load(criteria);
        setData(Array.isArray(result) ? result : []);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [load]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
