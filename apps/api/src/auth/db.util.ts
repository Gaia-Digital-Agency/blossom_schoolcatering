import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
let pool: any | null = null;
let pgUnavailable = false;

function getDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is missing');
  return dbUrl;
}

function getPgPool() {
  if (pgUnavailable) return null;
  if (pool) return pool;
  try {
    // Avoid hard compile-time dependency so build still works without npm network install.
    const pg = eval('require')('pg') as { Pool?: new (opts: object) => any };
    if (!pg?.Pool) {
      pgUnavailable = true;
      return null;
    }
    pool = new pg.Pool({
      connectionString: getDatabaseUrl(),
      max: 10,                    // max pool size (default is 10, explicit for clarity)
      idleTimeoutMillis: 30000,   // close idle clients after 30s
      connectionTimeoutMillis: 5000, // fail fast if no connection in 5s
    });
    return pool;
  } catch {
    pgUnavailable = true;
    return null;
  }
}

/** @deprecated Use runSql with $N params instead */
export function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function renderSqlWithParams(sql: string, params?: unknown[]) {
  if (!params?.length) return sql;
  return sql.replace(/\$(\d+)/g, (_m, idxRaw: string) => {
    const idx = Number(idxRaw) - 1;
    const value = params[idx];
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return sqlLiteral(String(value));
  });
}

export async function runSql(sql: string, params?: unknown[]): Promise<string> {
  const clientPool = getPgPool();
  if (clientPool) {
    const res = await clientPool.query(sql, params);
    if (!res.rows.length) return '';
    return res.rows
      .map((row: Record<string, unknown>) => {
        const vals = Object.values(row);
        if (vals.length === 1) {
          const v = vals[0];
          if (v === null || v === undefined) return '';
          if (typeof v === 'boolean') return v ? 't' : 'f';
          return String(v);
        }
        return vals.map((v) => (v === null || v === undefined ? '' : String(v))).join('\t');
      })
      .join('\n');
  }

  const dbUrl = getDatabaseUrl();
  const finalSql = renderSqlWithParams(sql, params);
  const { stdout } = await execFileAsync(
    'psql',
    ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', dbUrl, '-tA', '-c', finalSql],
    { maxBuffer: 5 * 1024 * 1024 },
  );
  return stdout.trim();
}
