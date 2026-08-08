const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const installDir = process.argv[2] || path.join(process.env.ProgramFiles, 'Sameh', 'RestoFlow ERP');
const requireInstalled = name => require(path.join(installDir, 'node_modules', name));
const sql = requireInstalled('mssql/msnodesqlv8');
const jwt = requireInstalled('jsonwebtoken');
const env = Object.fromEntries(fs.readFileSync(path.join(installDir, '.env'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

async function main() {
  const id = `verify-ai-${crypto.randomUUID()}`;
  const sessionId = `${id}-session`;
  const tokenId = `${id}-token`;
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL }).connect();
  try {
    await pool.request().input('id', sql.NVarChar, id).input('email', sql.NVarChar, `${id}@test.local`).query("insert into users (id,name,email,role,permissions,is_active) values (@id,'AI Verification',@email,'CASHIER','[\"NAV_AI_ASSISTANT\"]',1)");
    await pool.request().input('sid', sql.NVarChar, sessionId).input('uid', sql.NVarChar, id).input('tid', sql.NVarChar, tokenId).query('insert into user_sessions (id,user_id,token_id,is_active,expires_at) values (@sid,@uid,@tid,1,DATEADD(minute,5,GETDATE()))');
    const token = jwt.sign({ sub: id, role: 'CASHIER', permissions: ['NAV_AI_ASSISTANT'], sid: sessionId, jti: tokenId }, env.JWT_SECRET);
    const response = await fetch('http://127.0.0.1:3001/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: 'sales summary', lang: 'en', context: { orders: [{ total: 25, status: 'COMPLETED' }] } }) });
    const body = await response.json();
    if (response.status !== 200 || !String(body.text || '').includes('25.00')) throw new Error(`AI verification failed: ${response.status} ${JSON.stringify(body)}`);
    const fallbackResponse = await fetch('http://127.0.0.1:3001/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: 'explain an unknown system task', lang: 'en', context: {} }) });
    const fallbackBody = await fallbackResponse.json();
    if (fallbackResponse.status !== 200 || !String(fallbackBody.text || '').includes('built-in system copilot')) throw new Error(`AI fallback failed: ${fallbackResponse.status} ${JSON.stringify(fallbackBody)}`);
    process.stdout.write(JSON.stringify({ ok: true, reportStatus: response.status, fallbackStatus: fallbackResponse.status, text: body.text }));
  } finally {
    await pool.request().input('sid', sql.NVarChar, sessionId).query('delete from user_sessions where id=@sid');
    await pool.request().input('id', sql.NVarChar, id).query('delete from users where id=@id');
    await pool.close();
  }
}

main().catch(error => { process.stderr.write(String(error?.stack || error)); process.exitCode = 1; });
