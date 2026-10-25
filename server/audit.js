// Every staff change goes through here: who, what, which row, and what changed.
// `changes` is { field: { from, to } }; an update that changed nothing is not written.
export async function audit(db, staff, { action, entity, entityId = '', label = '', changes = {} }) {
  if (action === 'update' && !Object.keys(changes).length) return;
  await db.query(
    `INSERT INTO audit_log (actor, action, entity, entity_id, label, changes) VALUES ($1, $2, $3, $4, $5, $6)`,
    [staff?.username || 'system', action, entity, String(entityId), String(label).slice(0, 120), JSON.stringify(changes)]
  );
}

// Field-by-field difference between two plain objects, for `changes`.
export function diff(before, after, fields) {
  const out = {};
  for (const f of fields) {
    if (JSON.stringify(before?.[f]) !== JSON.stringify(after?.[f])) out[f] = { from: before?.[f] ?? null, to: after?.[f] ?? null };
  }
  return out;
}
