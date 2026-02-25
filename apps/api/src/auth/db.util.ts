import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function runSql(sql: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is missing');
  }
  const { stdout } = await execFileAsync(
    'psql',
    ['-d', dbUrl, '-tA', '-c', sql],
    { maxBuffer: 5 * 1024 * 1024 },
  );
  return stdout.trim();
}
