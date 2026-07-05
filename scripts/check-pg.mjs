import { execSync } from 'child_process';
try {
  require.resolve('pg');
  console.log('pg module: AVAILABLE');
} catch {
  console.log('pg module: NOT FOUND');
}
try {
  execSync('pg_dump --version', { stdio: 'pipe' });
  console.log('pg_dump: AVAILABLE');
} catch {
  console.log('pg_dump: NOT FOUND');
}
try {
  execSync('psql --version', { stdio: 'pipe' });
  console.log('psql: AVAILABLE');
} catch {
  console.log('psql: NOT FOUND');
}
console.log('Node version:', process.version);
console.log('CWD:', process.cwd());