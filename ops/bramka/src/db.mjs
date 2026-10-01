// Dostęp do bazy wyłącznie przez funkcje schematu `ops` (migracja 00100).
// Rola ops_actor nie widzi żadnej tabeli — nawet przy błędzie w bramce nie
// odczyta danych klientów ani nie zmieni niczego poza flagami „kill”.
import pg from 'pg';

export function createDb(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'faktflow-bramka',
  });
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
  return {
    async status() { return (await one('SELECT ops.status() AS s')).s; },
    async queues() { return (await one('SELECT ops.queues() AS q')).q; },
    async disable(flag, actor, note) { return (await one('SELECT ops.disable($1, $2, $3) AS r', [flag, actor, note])).r; },
    async log(action, actor, metadata = {}) { await pool.query('SELECT ops.log($1, $2, $3)', [action, actor, metadata]); },
    end: () => pool.end(),
  };
}
