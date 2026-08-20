import { useCallback, useEffect, useState } from "react";

const noOptions = { departments: [], projects: [], managers: [] };

// The department / project / manager options behind the user form's three
// multi-selects. Loaded once for the page rather than per modal open.
export function useUserFormOptions(load) {
  const [options, setOptions] = useState(noOptions);

  const reload = useCallback(async () => {
    try {
      setOptions(await load());
    } catch {
      // The form still works without them — the multi-selects come up empty,
      // and the API validates any ids that do get sent.
    }
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { options, reloadOptions: reload };
}
