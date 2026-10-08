// D1 de pruebas sobre node:sqlite (Node ≥ 22.13 sin bandera). Sólo para tests: imita lo que usa el almacén —
// prepare().bind().first()/all()/run() y batch()— con la semántica que importa de D1: un batch es UNA transacción
// (si una sentencia falla, no queda nada) y bind() no admite undefined. Si node:sqlite no existe, devuelve null y las
// pruebas del almacén se saltan en vez de fallar.
export async function d1Memoria(sqlInicial = "") {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); } catch (_) { return null; }
  const db = new DatabaseSync(":memory:");
  if (sqlInicial) db.exec(sqlInicial);
  const lee = sql => /^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql);
  const valores = args => args.map(v => {
    if (v === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported");
    return typeof v === "boolean" ? (v ? 1 : 0) : v;
  });
  const ejecutar = (sql, args) => {
    const st = db.prepare(sql);
    if (lee(sql)) { const results = st.all(...args).map(r => ({ ...r })); return { success: true, results, meta: { changes: 0, rows_read: results.length } }; }
    const r = st.run(...args);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const sentencia = (sql, args = []) => ({
    sql, args,
    bind: (...a) => sentencia(sql, valores(a)),
    first: async col => { const r = ejecutar(sql, args).results[0] ?? null; return r && col ? r[col] : r; },
    all: async () => ejecutar(sql, args),
    run: async () => ejecutar(sql, args),
  });
  return {
    sqlite: db,
    prepare: sql => sentencia(sql),
    exec: async sql => { db.exec(sql); return { count: 1 }; },
    batch: async lista => {
      db.exec("BEGIN");
      try { const out = lista.map(s => ejecutar(s.sql, s.args)); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}
