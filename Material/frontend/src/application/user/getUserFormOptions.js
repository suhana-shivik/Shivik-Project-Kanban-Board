// Everything the "Add / Edit user" form needs to render its three
// multi-selects, in one pass. The manager list is only reachable with
// `user:read`, so a failure there leaves the rest of the form usable.
export const getUserFormOptions = (repository) => async () => {
  const [lookups, managers] = await Promise.all([
    repository.lookups().catch(() => ({})),
    repository.managers().catch(() => [])
  ]);

  const toOptions = (rows) =>
    (Array.isArray(rows) ? rows : []).map((row) => ({
      id: row.id,
      label: row.name,
      hint: row.code || null
    }));

  return {
    departments: toOptions(lookups?.departments),
    projects: toOptions(lookups?.projects),
    managers: (Array.isArray(managers) ? managers : []).map((row) => ({
      id: row.id,
      label: row.name || row.email,
      hint: row.email
    }))
  };
};
