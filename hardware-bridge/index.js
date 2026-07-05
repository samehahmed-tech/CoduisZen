const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const envCandidates = [
  process.env.PRINT_GATEWAY_ENV_FILE,
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
].filter(Boolean);
const envPath = envCandidates.find((p) => fs.existsSync(p));
if (envPath) {
  require('dotenv').config({ path: envPath });
}
const express = require('express');
const cors = require('cors');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');
escpos.Network = require('escpos-network');

const app = express();
const PORT = Number(process.env.PRINT_BRIDGE_PORT || 3002);
const BACKEND_BASE = String(process.env.PRINT_BACKEND_URL || 'http://localhost:3001/api/print-gateway/gateway').replace(/\/$/, '');
const GATEWAY_TOKEN = String(
  process.env.PRINT_GATEWAY_TOKEN
  || (process.env.NODE_ENV !== 'production' ? 'dev_print_gateway_token' : '')
).trim();
const GATEWAY_ID = String(process.env.PRINT_GATEWAY_ID || `gw-${os.hostname()}`).trim();
const BRANCH_ID = String(process.env.PRINT_BRANCH_ID || 'b1').trim();
const CLAIM_UNASSIGNED = String(process.env.PRINT_CLAIM_UNASSIGNED || 'false').toLowerCase() === 'true';
const POLL_MS = Math.max(500, Number(process.env.PRINT_GATEWAY_POLL_MS || 1200));
const PRINT_JOB_TIMEOUT_MS = Math.max(5000, Number(process.env.PRINT_JOB_TIMEOUT_MS || 25000));
const IMAGE_DENSITY = String(process.env.PRINT_IMAGE_DENSITY || 'd24').trim();
const writeLog = (level, message) => {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}\n`;
  (level === 'error' ? process.stderr : process.stdout).write(line);
};
const log = (message) => writeLog('info', message);
const warn = (message) => writeLog('warn', message);
const error = (message) => writeLog('error', message);
const runtimeState = {
  startedAt: new Date().toISOString(),
  backendReachableAt: null,
  lastClaimAt: null,
  lastClaimStatus: 'not-started',
  lastClaimError: null,
  lastClaimedJobId: null,
  lastPrintedJobId: null,
  lastPrintError: null,
  claimedCount: 0,
  printedCount: 0,
  failedCount: 0,
};

// DRY RUN: Save to file instead of printing
const DRY_RUN = String(process.env.PRINT_DRY_RUN || 'false').toLowerCase() === 'true';
const PREVIEW_DIR = path.join(os.homedir(), '.restoflow-previews');
if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });

const toHex = (value) => Number(value || 0).toString(16).padStart(4, '0');

const parseUsbAddress = (address = '') => {
  const match = String(address || '').trim().match(/^usb:([0-9a-fA-F]+):([0-9a-fA-F]+)$/);
  if (!match) return null;
  return {
    vid: parseInt(match[1], 16),
    pid: parseInt(match[2], 16),
  };
};

const createPrinterDevice = (job) => {
  const address = job.printerAddress || job.printer_address || '';
  const pType = String(job.printerType || job.printer_type || 'LOCAL').toUpperCase();
  const usbTarget = parseUsbAddress(address);

  if (usbTarget) {
    return new escpos.USB(usbTarget.vid, usbTarget.pid);
  }

  if (pType === 'NETWORK') {
    if (!address) throw new Error('PRINTER_ADDRESS_REQUIRED');
    return new escpos.Network(String(address));
  }

  if (address && !String(address).startsWith('windows:')) {
    return new escpos.Network(String(address));
  }

  return new escpos.USB();
};

const listUsbPrinters = () => {
  try {
    const devices = escpos.USB.findPrinter() || [];
    return devices.map((device, index) => {
      const descriptor = device.deviceDescriptor || {};
      const vid = toHex(descriptor.idVendor);
      const pid = toHex(descriptor.idProduct);
      return {
        id: `usb:${vid}:${pid}`,
        name: `USB Thermal Printer ${index + 1} (${vid}:${pid})`,
        type: 'USB',
        address: `usb:${vid}:${pid}`,
        vendorId: vid,
        productId: pid,
      };
    });
  } catch (error) {
    return [];
  }
};

const listWindowsPrinters = () => new Promise((resolve) => {
  if (process.platform !== 'win32') return resolve([]);
  const script = 'Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus | ConvertTo-Json -Compress';
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 4000 }, (_error, stdout) => {
    try {
      const parsed = JSON.parse(String(stdout || '[]').trim() || '[]');
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      resolve(rows.filter(Boolean).map((printer) => ({
        id: `windows:${printer.Name}`,
        name: printer.Name,
        type: 'WINDOWS',
        address: `windows:${printer.Name}`,
        isDefault: Boolean(printer.Default),
        isOffline: Boolean(printer.WorkOffline),
        status: printer.PrinterStatus,
      })));
    } catch {
      resolve([]);
    }
  });
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Serve saved previews as static files
app.use('/previews', express.static(PREVIEW_DIR));

/**
 * DRY RUN: Save content to file instead of real printing
 */
const dryRunPrint = async (job) => {
  const contentType = String(job.contentType || job.content_type || 'text').toLowerCase();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const type = String(job.type || 'RECEIPT').toLowerCase();

  if (contentType === 'image') {
    const filename = `${type}_${ts}.png`;
    const filepath = path.join(PREVIEW_DIR, filename);
    const imgBuffer = Buffer.from(job.content || '', 'base64');
    fs.writeFileSync(filepath, imgBuffer);
    log(`[DRY-RUN] Image receipt saved: ${filepath}`);
    log(`[DRY-RUN] View at: http://localhost:${PORT}/previews/${filename}`);
  } else {
    const filename = `${type}_${ts}.txt`;
    const filepath = path.join(PREVIEW_DIR, filename);
    fs.writeFileSync(filepath, job.content || '', 'utf8');
    log(`[DRY-RUN] Text receipt saved: ${filepath}`);
    log(`[DRY-RUN] View at: http://localhost:${PORT}/previews/${filename}`);
  }
  return true;
};

/**
 * Print image (raster) from base64 PNG data.
 * This enables full Arabic + styled receipt printing.
 */
const printImageWithEscpos = async (job) => {
  const address = job.printerAddress || job.printer_address || '';
  const pType = String(job.printerType || job.printer_type || 'LOCAL').toUpperCase();
  const imageBase64 = job.content || '';

  log(`[print-image] type=${pType} address=${address || '(none)'} imageLen=${imageBase64.length}`);

  return new Promise((resolve, reject) => {
    try {
      let device;
      try {
        device = createPrinterDevice(job);
      } catch (deviceError) {
        return reject(deviceError);
      }

      // Decode base64 to buffer
      const imgBuffer = Buffer.from(imageBase64, 'base64');

      // Save to temp file for escpos.Image
      const tmpFile = path.join(os.tmpdir(), `receipt_${Date.now()}.png`);
      fs.writeFileSync(tmpFile, imgBuffer);

      escpos.Image.load(tmpFile, (image) => {
        if (!image) {
          fs.unlinkSync(tmpFile);
          return reject(new Error('FAILED_TO_LOAD_IMAGE'));
        }

        const printer = new escpos.Printer(device);
        device.open((error) => {
          if (error) {
            fs.unlinkSync(tmpFile);
            return reject(error);
          }

          const cleanup = () => {
            try { fs.unlinkSync(tmpFile); } catch {}
          };
          const finish = () => {
            try {
              printer.feed(3).cut().close(() => {
                cleanup();
                resolve(true);
              });
            } catch (finishError) {
              cleanup();
              reject(finishError);
            }
          };

          try {
            printer.align('ct');
            const imageResult = printer.image(image, IMAGE_DENSITY);
            if (imageResult && typeof imageResult.then === 'function') {
              imageResult.then(finish).catch((imageError) => {
                cleanup();
                reject(imageError);
              });
            } else {
              finish();
            }
          } catch (imageError) {
            cleanup();
            reject(imageError);
          }
        });
      });
    } catch (error) {
      return reject(error);
    }
  });
};

/**
 * Print text with escpos.
 */
const printWithEscpos = async (job) => {
  const address = job.printerAddress || job.printer_address || '';
  const pType = String(job.printerType || job.printer_type || 'LOCAL').toUpperCase();
  const type = String(job.type || '').toUpperCase();
  const content = job.content || '';
  log(`[print] type=${pType} address=${address || '(none)'} contentLen=${content.length}`);

  return new Promise((resolve, reject) => {
    try {
      let device;
      try {
        device = createPrinterDevice(job);
      } catch (deviceError) {
        return reject(deviceError);
      }

      const printer = new escpos.Printer(device);
      device.open((error) => {
        if (error) return reject(error);

        // Drawer pulse command
        if (type === 'RECEIPT' && content === '\x1B\x70\x00\x19\xFA') {
          printer.raw(content).close();
          return resolve(true);
        }

        printer
          .font('a')
          .align('lt')
          .style('normal')
          .size(1, 1)
          .text(String(content || ''))
          .cut()
          .close();
        return resolve(true);
      });
    } catch (error) {
      return reject(error);
    }
  });
};

/**
 * Print JSON formatted ESC/POS commands
 */
const printEscposJson = async (job) => {
  const address = job.printerAddress || job.printer_address || '';
  const pType = String(job.printerType || job.printer_type || 'LOCAL').toUpperCase();
  const content = job.content || '[]';
  log(`[print-escpos-json] type=${pType} address=${address || '(none)'}`);

  return new Promise((resolve, reject) => {
    try {
      let device;
      try {
        device = createPrinterDevice(job);
      } catch (deviceError) {
        return reject(deviceError);
      }

      const printer = new escpos.Printer(device);
      device.open((error) => {
        if (error) return reject(error);

        try {
          // Send init command just in case
          printer.encode('utf8');

          const cmds = JSON.parse(content);
          for (const cmd of cmds) {
            if (cmd.type === 'separator') {
               const char = cmd.style === 'solid' ? '=' : '-';
               printer.align('ct').font('a').style('NORMAL').size(1,1).text(char.repeat(32));
            } else if (cmd.type === 'spacing') {
               printer.feed(cmd.lines || 1);
            } else if (cmd.type === 'text') {
               printer.align(cmd.align || 'lt')
                      .font(cmd.font || 'a')
                      .style(cmd.bold ? 'B' : 'NORMAL')
                      .size(cmd.size ? cmd.size[0] : 1, cmd.size ? cmd.size[1] : 1)
                      .text(cmd.value || '');
            } else if (cmd.type === 'table') {
               const cols = (cmd.columns || []).map(c => ({
                 text: String(c.text || ''),
                 align: c.align || 'LEFT',
                 width: c.width || 0.5,
                 style: c.bold ? 'B' : 'NORMAL'
               }));
               printer.tableCustom(cols);
            }
          }
          printer.cut().close();
          return resolve(true);
        } catch (e) {
          printer.close();
          return reject(e);
        }
      });
    } catch (error) {
      return reject(error);
    }
  });
};

/**
 * Smart print: routes to dryRun, image, or text based on mode.
 */
const smartPrint = async (job) => {
  if (DRY_RUN) {
    return dryRunPrint(job);
  }
  const contentType = String(job.contentType || job.content_type || 'text').toLowerCase();
  if (contentType === 'image') {
    return printImageWithEscpos(job);
  }
  if (contentType === 'escpos-json') {
    return printEscposJson(job);
  }
  return printWithEscpos(job);
};

const withTimeout = (promise, ms, label = 'PRINT_TIMEOUT') => {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}_${ms}MS`)), ms);
    }),
  ]);
};

app.get('/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'print-gateway',
    dryRun: DRY_RUN,
    gatewayId: GATEWAY_ID,
    branchId: BRANCH_ID,
    claimUnassigned: CLAIM_UNASSIGNED,
    backendBase: BACKEND_BASE,
    hasGatewayToken: Boolean(GATEWAY_TOKEN),
    previewDir: PREVIEW_DIR,
    runtime: runtimeState,
    ts: new Date().toISOString(),
  });
});

app.get('/printers', async (_req, res) => {
  const usb = listUsbPrinters();
  const windows = await listWindowsPrinters();
  res.json({
    ok: true,
    printers: [...usb, ...windows],
    usb,
    windows,
    ts: new Date().toISOString(),
  });
});

// Show latest preview in browser
app.get('/preview/latest', async (_req, res) => {
  try {
    const files = fs.readdirSync(PREVIEW_DIR)
      .filter(f => f.endsWith('.png') || f.endsWith('.txt'))
      .sort()
      .reverse();
    if (files.length === 0) {
      return res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>No previews yet</h2><p>Print a receipt with DRY_RUN enabled first.</p></body></html>');
    }
    const latest = files[0];
    if (latest.endsWith('.png')) {
      res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:20px;background:#f0f0f0">
        <h3 style="color:#333">Receipt Preview (${latest})</h3>
        <img src="/previews/${latest}" style="max-width:400px;border:2px solid #ccc;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15)" />
        <br><br>
        <p style="color:#666;font-size:12px">${files.length} previews saved in ${PREVIEW_DIR}</p>
        </body></html>`);
    } else {
      const content = fs.readFileSync(path.join(PREVIEW_DIR, latest), 'utf8');
      res.send(`<html><body style="font-family:monospace;padding:20px;background:#1a1a1a;color:#0f0">
        <h3 style="color:#fff">Receipt Preview (${latest})</h3>
        <pre style="background:#000;padding:20px;border-radius:8px;border:2px solid #333;max-width:400px;margin:0 auto">${content.replace(/</g, '&lt;')}</pre>
        <br>
        <p style="color:#666;font-size:12px">${files.length} previews saved</p>
        </body></html>`);
    }
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/print', async (req, res) => {
  try {
    await withTimeout(smartPrint(req.body || {}), PRINT_JOB_TIMEOUT_MS);
    return res.json({ ok: true, status: DRY_RUN ? 'dry-run-saved' : 'sent' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error.message || error) });
  }
});

const gatewayHeaders = {
  'Content-Type': 'application/json',
  'x-print-gateway-token': GATEWAY_TOKEN,
};

const waitForBackend = async () => {
  while (true) {
    try {
      const healthUrl = BACKEND_BASE.replace(/\/api\/print-gateway\/gateway$/, '/api/health');
      const res = await fetch(healthUrl);
      if (res.ok) {
          log(`[gateway] backend reachable: ${healthUrl}`);
        runtimeState.backendReachableAt = new Date().toISOString();
        return;
      }
    } catch {
      // ignore until backend is up
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
};

const claimJob = async () => {
  runtimeState.lastClaimAt = new Date().toISOString();
  const res = await fetch(`${BACKEND_BASE}/claim`, {
    method: 'POST',
    headers: gatewayHeaders,
    body: JSON.stringify({ gatewayId: GATEWAY_ID, branchId: BRANCH_ID, claimUnassigned: CLAIM_UNASSIGNED }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    runtimeState.lastClaimStatus = `failed-${res.status}`;
    runtimeState.lastClaimError = body || `HTTP ${res.status}`;
    throw new Error(`CLAIM_FAILED ${res.status} ${body}`);
  }
  const data = await res.json();
  const job = data?.job || null;
  runtimeState.lastClaimStatus = job ? 'claimed' : 'empty';
  runtimeState.lastClaimError = null;
  runtimeState.lastClaimedJobId = job?.id || null;
  if (job) runtimeState.claimedCount += 1;
  return job;
};

const ackJob = async (jobId) => {
  await fetch(`${BACKEND_BASE}/${encodeURIComponent(jobId)}/ack`, {
    method: 'POST',
    headers: gatewayHeaders,
    body: JSON.stringify({ gatewayId: GATEWAY_ID }),
  });
};

const failJob = async (jobId, errorMessage) => {
  await fetch(`${BACKEND_BASE}/${encodeURIComponent(jobId)}/fail`, {
    method: 'POST',
    headers: gatewayHeaders,
    body: JSON.stringify({ gatewayId: GATEWAY_ID, error: String(errorMessage || 'PRINT_FAILED') }),
  });
};

const loop = async () => {
  if (!GATEWAY_TOKEN) {
    warn('[gateway] PRINT_GATEWAY_TOKEN is missing; queue polling disabled.');
    while (true) {
      await new Promise((r) => setTimeout(r, 15000));
    }
  }

  while (true) {
    try {
      const job = await claimJob();
      if (!job) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }

      try {
        await withTimeout(smartPrint(job), PRINT_JOB_TIMEOUT_MS);
        await ackJob(job.id);
        runtimeState.lastPrintedJobId = job.id;
        runtimeState.lastPrintError = null;
        runtimeState.printedCount += 1;
        log(`[gateway] printed job ${job.id}`);
      } catch (printError) {
        await failJob(job.id, printError?.message || 'PRINT_FAILED');
        runtimeState.lastPrintError = printError?.message || String(printError);
        runtimeState.failedCount += 1;
        error(`[gateway] failed job ${job.id}: ${printError?.message || printError}`);
      }
    } catch (error) {
      runtimeState.lastClaimStatus = 'error';
      runtimeState.lastClaimError = error?.message || String(error);
      error(`[gateway] polling error: ${error?.message || error}`);
      await new Promise((r) => setTimeout(r, Math.max(POLL_MS, 2000)));
    }
  }
};

app.listen(PORT, () => {
  log(`[gateway] listening on http://localhost:${PORT}`);
  log(`[gateway] id=${GATEWAY_ID} branch=${BRANCH_ID} backend=${BACKEND_BASE}`);
  (async () => {
    await waitForBackend();
    await loop();
  })().catch((error) => {
    error(`[gateway] fatal loop error: ${error?.message || error}`);
  });
});

