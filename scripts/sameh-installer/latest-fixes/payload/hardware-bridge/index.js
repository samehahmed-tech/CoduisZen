const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { execFile } = require('child_process');
const { version: BRIDGE_VERSION } = require('./package.json');
const { pngToEscPos } = require('./png-raster');

require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false });

const GATEWAY_ID = process.env.GATEWAY_ID || `gw-${os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const BRANCH_ID = process.env.BRANCH_ID || '';
const SERVER_URL = (process.env.SERVER_URL || 'http://localhost:3001').replace(/\/+$/, '');
const SERVER_ORIGIN = new URL(SERVER_URL).origin;
const ALLOWED_BROWSER_ORIGINS = new Set([
    SERVER_ORIGIN,
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]);
const POLL_MS = Math.max(250, Number(process.env.POLL_MS || 500));
const BRIDGE_REQUEST_TIMEOUT_MS = Math.max(3000, Number(process.env.BRIDGE_REQUEST_TIMEOUT_MS || 10000));
const PORT = Number(process.env.BRIDGE_PORT || 3002);
const CLAIM_UNASSIGNED = true;
const GLOBAL_CLAIM = String(process.env.GLOBAL_CLAIM || 'true').toLowerCase() !== 'false';
const CASH_DRAWER_PULSE = '\x1B\x70\x00\x19\xFA';
const PAPER_FEED_AND_CUT = '\x1B\x64\x05\x1D\x56\x42\x00';
const runtime = {
    serverConnected: false, lastPollAt: null, lastSuccessAt: null, lastError: null,
    lastServerError: null, lastPrintError: null, lastPrinterDiscoveryError: null, lastJobReportError: null,
    jobsReceived: 0, printed: 0, failed: 0, activeJob: null, printers: [],
};

const logDir = path.join(os.homedir(), '.restoflow-bridge');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'bridge.log');
const pendingReportsFile = path.join(logDir, 'pending-print-reports.json');
if (fs.existsSync(logFile) && fs.statSync(logFile).size >= 5 * 1024 * 1024) {
    fs.rmSync(`${logFile}.1`, { force: true });
    fs.renameSync(logFile, `${logFile}.1`);
}
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const log = (msg) => { const line = `[${new Date().toISOString()}] ${msg}\n`; logStream.write(line); console.log(line.trim()); };
const refreshLastError = () => {
    runtime.lastError = runtime.lastPrintError || runtime.lastJobReportError || runtime.lastServerError || runtime.lastPrinterDiscoveryError;
};
const loadPendingReports = () => {
    try {
        const rows = JSON.parse(fs.readFileSync(pendingReportsFile, 'utf8'));
        return new Map(Array.isArray(rows) ? rows.map(row => [row.job.id, row]) : []);
    } catch { return new Map(); }
};
const pendingReports = loadPendingReports();
const savePendingReports = () => {
    const temp = `${pendingReportsFile}.tmp`;
    fs.writeFileSync(temp, JSON.stringify([...pendingReports.values()]));
    fs.renameSync(temp, pendingReportsFile);
};

log(`bridge v${BRIDGE_VERSION} gateway=${GATEWAY_ID} server=${SERVER_URL} globalClaim=${GLOBAL_CLAIM}`);

const headers = { 'Content-Type': 'application/json', 'x-gateway-id': GATEWAY_ID };
if (GATEWAY_TOKEN) headers['x-gateway-token'] = GATEWAY_TOKEN;

const fetchJson = async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BRIDGE_REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, { headers, ...options, signal: controller.signal });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            const error = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
            error.statusCode = res.status;
            throw error;
        }
        return res.json();
    } catch (error) {
        if (error?.name === 'AbortError') throw new Error(`BRIDGE_REQUEST_TIMEOUT after ${BRIDGE_REQUEST_TIMEOUT_MS}ms`);
        throw error;
    } finally {
        clearTimeout(timer);
    }
};

const bridgeFetch = async (path, options = {}) => fetchJson(`${SERVER_URL}${path}`, options);
const removeTempFile = (file) => fs.rm(file, { force: true }, error => {
    if (error) log(`[cleanup] ${error.message}`);
});

// ── List Windows Printers via PowerShell ──
const listWindowsPrinters = () => new Promise((resolve) => {
    const script = 'Get-CimInstance Win32_Printer | Select-Object Name,Default,SystemName,ShareName,PrinterStatus | ConvertTo-Json -Compress';
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 4000 }, (error, stdout) => {
        if (error) {
            runtime.lastPrinterDiscoveryError = `PRINTER_DISCOVERY_FAILED: ${error.message}`;
            refreshLastError();
            log(runtime.lastPrinterDiscoveryError);
            resolve([]);
            return;
        }
        try {
            const parsed = JSON.parse(String(stdout || '[]').trim() || '[]');
            const rows = Array.isArray(parsed) ? parsed : [parsed];
            const printers = rows.filter(Boolean).map(p => ({
                id: `windows:${p.Name}`,
                name: p.Name,
                address: `windows:${p.Name}`,
                type: 'WINDOWS',
                isDefault: Boolean(p.Default),
                status: p.PrinterStatus,
            }));
            runtime.printers = printers;
            runtime.lastPrinterDiscoveryError = null;
            refreshLastError();
            resolve(printers);
        } catch (parseError) {
            runtime.lastPrinterDiscoveryError = `PRINTER_DISCOVERY_INVALID_RESPONSE: ${parseError.message}`;
            refreshLastError();
            log(runtime.lastPrinterDiscoveryError);
            resolve([]);
        }
    });
});

// ── Print ──
const printImage = (printerName, imageBase64) => new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `rf_img_${Date.now()}.png`);
    fs.writeFileSync(tmpFile, Buffer.from(imageBase64, 'base64'));
    const psCommand = `
        Add-Type -AssemblyName System.Drawing
        $doc = New-Object System.Drawing.Printing.PrintDocument
        $doc.PrinterSettings.PrinterName = $env:RF_PRINTER_NAME
        $doc.OriginAtMargins = $false
        $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
        $image = [System.Drawing.Image]::FromFile($env:RF_PRINT_FILE)
        $doc.add_PrintPage({
            param($sender, $ev)
            $width = $ev.PageBounds.Width
            $height = [int][Math]::Ceiling($image.Height * ($width / $image.Width))
            $ev.Graphics.DrawImage($image, 0, 0, $width, $height)
            $ev.HasMorePages = $false
        })
        $doc.Print()
        $image.Dispose()
    `;
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], {
        timeout: 30000,
        env: { ...process.env, RF_PRINTER_NAME: printerName, RF_PRINT_FILE: tmpFile },
    }, (err, stdout, stderr) => {
        removeTempFile(tmpFile);
        if (err) {
            reject(new Error(`PowerShell print failed: ${stderr || err.message}`));
        } else {
            resolve(true);
        }
    });
});

const printText = (printerName, text) => {
    return new Promise((resolve, reject) => {
        const tmpFile = path.join(os.tmpdir(), `rf_txt_${Date.now()}.txt`);
        // Write UTF-8 with BOM so PowerShell reads Arabic correctly
        fs.writeFileSync(tmpFile, '\uFEFF' + text, 'utf8');
        const psCommand = 'Get-Content $env:RF_PRINT_FILE -Raw -Encoding UTF8 | Out-Printer -Name $env:RF_PRINTER_NAME';
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], {
            timeout: 30000,
            env: { ...process.env, RF_PRINTER_NAME: printerName, RF_PRINT_FILE: tmpFile },
        }, (err, stdout, stderr) => {
            removeTempFile(tmpFile);
            if (err) {
                reject(new Error(`PowerShell print failed: ${stderr || err.message}`));
            } else {
                resolve(true);
            }
        });
    });
};

const printRawWindows = (printerName, content) => new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `rf_raw_${Date.now()}.bin`);
    fs.writeFileSync(tmpFile, Buffer.from(content, 'latin1'));
    const psCommand = `
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class RestoFlowRawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DocInfo {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool OpenPrinter(string name, out IntPtr printer, IntPtr defaults);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern int StartDocPrinter(IntPtr printer, int level, [In] DocInfo info);
    [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr printer, IntPtr bytes, int count, out int written);
    [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr printer);

    public static void Send(string printerName, string file) {
        IntPtr printer;
        if (!OpenPrinter(printerName, out printer, IntPtr.Zero)) throw new System.ComponentModel.Win32Exception();
        try {
            var info = new DocInfo { pDocName = "RestoFlow ESC/POS Command", pDataType = "RAW" };
            if (StartDocPrinter(printer, 1, info) == 0) throw new System.ComponentModel.Win32Exception();
            try {
                if (!StartPagePrinter(printer)) throw new System.ComponentModel.Win32Exception();
                try {
                    byte[] payload = File.ReadAllBytes(file);
                    IntPtr memory = Marshal.AllocCoTaskMem(payload.Length);
                    try {
                        Marshal.Copy(payload, 0, memory, payload.Length);
                        int written;
                        if (!WritePrinter(printer, memory, payload.Length, out written) || written != payload.Length) throw new System.ComponentModel.Win32Exception();
                    } finally { Marshal.FreeCoTaskMem(memory); }
                } finally { EndPagePrinter(printer); }
            } finally { EndDocPrinter(printer); }
        } finally { ClosePrinter(printer); }
    }
}
'@
[RestoFlowRawPrinter]::Send($env:RF_PRINTER_NAME, $env:RF_PRINT_FILE)
`;
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], {
        timeout: 30000,
        env: { ...process.env, RF_PRINTER_NAME: printerName, RF_PRINT_FILE: tmpFile },
    }, (error, stdout, stderr) => {
        removeTempFile(tmpFile);
        if (error) reject(new Error(`Windows raw print failed: ${stderr || error.message}`));
        else resolve(true);
    });
});

const cutWindowsPaper = async (printerName) => {
    try {
        await printRawWindows(printerName, PAPER_FEED_AND_CUT);
    } catch (error) {
        // The receipt is already spooled; never duplicate it only because a
        // non-ESC/POS Windows driver rejected the optional cut command.
        log(`[cut] printer=${printerName} warning=${error.message}`);
    }
};

const renderNetworkRaster = (content, contentType) => {
    if (contentType === 'image') {
        const source = String(content).replace(/^data:image\/[^;]+;base64,/i, '');
        return Promise.resolve(pngToEscPos(Buffer.from(source, 'base64'), 576));
    }
    return new Promise((resolve, reject) => {
    const inputFile = path.join(os.tmpdir(), `rf_lan_${Date.now()}_${process.pid}.${contentType === 'image' ? 'png' : 'txt'}`);
    const outputFile = `${inputFile}.bin`;
    const source = contentType === 'image' ? String(content).replace(/^data:image\/[^;]+;base64,/i, '') : '\uFEFF' + String(content);
    fs.writeFileSync(inputFile, contentType === 'image' ? Buffer.from(source, 'base64') : source, contentType === 'image' ? undefined : 'utf8');
    const psCommand = `
Add-Type -AssemblyName System.Drawing
$width = [Math]::Max(256, [Math]::Min(576, [int]$env:RF_PRINT_WIDTH))
$bitmap = $null
$sourceImage = $null
if ($env:RF_CONTENT_TYPE -eq 'image') {
    $sourceImage = [Drawing.Image]::FromFile($env:RF_PRINT_INPUT)
    # Receipt images are already rendered at the printer head width (384/576).
    # Preserve that width instead of shrinking every network image to 384 dots.
    $width = [Math]::Max(256, [Math]::Min(576, [int]$sourceImage.Width))
    $height = [Math]::Max(1, [int][Math]::Ceiling($sourceImage.Height * ($width / $sourceImage.Width)))
    $bitmap = [Drawing.Bitmap]::new($width, $height, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([Drawing.Color]::White)
    $graphics.DrawImage($sourceImage, 0, 0, $width, $height)
    $graphics.Dispose()
} else {
    $raw = Get-Content $env:RF_PRINT_INPUT -Raw -Encoding UTF8
    $lines = [Collections.Generic.List[string]]::new()
    foreach ($logicalLine in ($raw -split "\\r?\\n")) {
        $remaining = [string]$logicalLine
        if ($remaining.Length -eq 0) { $lines.Add(''); continue }
        while ($remaining.Length -gt 24) { $lines.Add($remaining.Substring(0, 24)); $remaining = $remaining.Substring(24) }
        $lines.Add($remaining)
    }
    $lineHeight = 44
    $height = [Math]::Max(48, $lines.Count * $lineHeight + 16)
    $bitmap = [Drawing.Bitmap]::new($width, $height, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([Drawing.Color]::White)
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $font = [Drawing.Font]::new('Tahoma', 17, [Drawing.FontStyle]::Bold)
    $left = [Drawing.StringFormat]::new(); $left.Alignment = [Drawing.StringAlignment]::Near
    $right = [Drawing.StringFormat]::new(); $right.Alignment = [Drawing.StringAlignment]::Near; $right.FormatFlags = [Drawing.StringFormatFlags]::DirectionRightToLeft
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        $format = if ($line -match '[\\u0600-\\u06FF]') { $right } else { $left }
        $graphics.DrawString($line, $font, [Drawing.Brushes]::Black, [Drawing.RectangleF]::new(6, 8 + $i * $lineHeight, $width - 12, $lineHeight), $format)
    }
    $font.Dispose(); $left.Dispose(); $right.Dispose(); $graphics.Dispose()
}
$stream = [IO.MemoryStream]::new()
$stream.Write([byte[]](0x1B,0x40,0x1B,0x33,24), 0, 5)
for ($y0 = 0; $y0 -lt $bitmap.Height; $y0 += 24) {
    $header = [byte[]](0x1B,0x2A,33,($width -band 0xFF),(($width -shr 8) -band 0xFF))
    $stream.Write($header, 0, $header.Length)
    for ($x = 0; $x -lt $width; $x++) {
        for ($band = 0; $band -lt 3; $band++) {
            $value = 0
            for ($bit = 0; $bit -lt 8; $bit++) {
                $y = $y0 + $band * 8 + $bit
                if ($y -lt $bitmap.Height) {
                    $pixel = $bitmap.GetPixel($x, $y)
                    $luma = ($pixel.R * 299 + $pixel.G * 587 + $pixel.B * 114) / 1000
                    if ($luma -lt 180) { $value = $value -bor (0x80 -shr $bit) }
                }
            }
            $stream.WriteByte([byte]$value)
        }
    }
    $stream.WriteByte(0x0A)
}
$stream.Write([byte[]](0x1B,0x32,0x1B,0x64,0x05,0x1D,0x56,0x42,0x00), 0, 9)
[IO.File]::WriteAllBytes($env:RF_PRINT_OUTPUT, $stream.ToArray())
$stream.Dispose(); $bitmap.Dispose(); if ($sourceImage) { $sourceImage.Dispose() }
`;
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], {
        timeout: 30000,
        windowsHide: true,
        env: { ...process.env, RF_PRINT_INPUT: inputFile, RF_PRINT_OUTPUT: outputFile, RF_CONTENT_TYPE: contentType, RF_PRINT_WIDTH: process.env.NETWORK_PRINTER_WIDTH || '384' },
    }, (error, stdout, stderr) => {
        removeTempFile(inputFile);
        if (error) { removeTempFile(outputFile); reject(new Error(`Network raster render failed: ${stderr || error.message}`)); return; }
        fs.readFile(outputFile, (readError, payload) => {
            removeTempFile(outputFile);
            if (readError) reject(readError); else resolve(payload);
        });
    });
    });
};

const sendTcpPayload = (address, payload) => new Promise((resolve, reject) => {
    const target = String(address).replace(/^tcp:\/\//i, '');
    const [host, portText] = target.split(':');
    const port = Number(portText || 9100);
    if (!host) return reject(new Error('NETWORK_PRINTER_HOST_REQUIRED'));
    const socket = net.createConnection({ host, port, timeout: 8000 }, () => {
        socket.end(payload);
    });
    socket.on('close', hadError => hadError ? undefined : resolve(true));
    socket.on('timeout', () => socket.destroy(new Error('NETWORK_PRINTER_TIMEOUT')));
    socket.on('error', reject);
});

const printRawTcp = async (address, content, contentType) => {
    const payload = content === CASH_DRAWER_PULSE
        ? Buffer.from(content, 'latin1')
        : await renderNetworkRaster(content, contentType);
    return sendTcpPayload(address, payload);
};

const executePrint = async (job) => {
    let address = job.printerAddress || job.printer_address || '';
    const cType = String(job.contentType || job.content_type || 'text').toLowerCase();
    const printerType = String(job.printerType || job.printer_type || '').toUpperCase();
    if (!address) {
        const printers = runtime.printers.length ? runtime.printers : await listWindowsPrinters();
        address = printers.find(printer => printer.isDefault)?.address || printers[0]?.address || '';
    }
    const printerName = address.startsWith('windows:') ? address.slice(8) : address;
    if (!printerName) throw new Error('NO_WINDOWS_PRINTER_FOUND');
    log(`[print] job=${job.id} type=${job.type} printer=${printerName} printerType=${printerType} cType=${cType}`);
    try {
        if ((printerType === 'NETWORK' || printerType === 'LAN') && !address.startsWith('windows:')) await printRawTcp(address, job.content, cType);
        else if (cType === 'image') {
            await printImage(printerName, job.content);
        }
        else if (job.content === CASH_DRAWER_PULSE) await printRawWindows(printerName, job.content);
        else await printText(printerName, job.content);
    } catch (error) {
        const printers = runtime.printers.length ? runtime.printers : await listWindowsPrinters();
        const fallback = printers.find(printer => printer.isDefault) || printers[0];
        if (!fallback || fallback.address === address || printerType === 'NETWORK' || printerType === 'LAN') throw error;
        const fallbackName = fallback.address.replace(/^windows:/, '');
        log(`[print] fallback printer=${fallbackName} reason=${error.message}`);
        if (cType === 'image') {
            await printImage(fallbackName, job.content);
        }
        else if (job.content === CASH_DRAWER_PULSE) await printRawWindows(fallbackName, job.content);
        else await printText(fallbackName, job.content);
    }
    log(`[print] done job=${job.id}`);
};

// ── Job Processing ──
const inFlight = new Set();

const reportJobStatus = async (job, outcome, errorMessage = '') => {
    await bridgeFetch(`/api/print-gateway/bridge/jobs/${encodeURIComponent(job.id)}/${outcome}`, {
        method: 'POST',
        body: JSON.stringify({ gatewayId: GATEWAY_ID, branchId: job.branchId || job.branch_id || BRANCH_ID, error: errorMessage.slice(0, 500) }),
    });
    pendingReports.delete(job.id);
    savePendingReports();
    runtime.lastJobReportError = null;
    refreshLastError();
};

const flushPendingReports = async () => {
    for (const report of [...pendingReports.values()]) {
        try {
            await reportJobStatus(report.job, report.outcome, report.errorMessage);
        } catch (error) {
            if (error.statusCode === 404) {
                pendingReports.delete(report.job.id);
                savePendingReports();
                runtime.lastJobReportError = null;
                refreshLastError();
                log(`discarded stale report for missing job ${report.job.id}`);
                continue;
            }
            runtime.lastJobReportError = `JOB_${report.outcome.toUpperCase()}_REPORT_FAILED: ${error.message}`;
            refreshLastError();
            log(runtime.lastJobReportError);
            return false;
        }
    }
    return true;
};

const runPrintJob = async (job) => {
    if (inFlight.has(job.id)) return;
    inFlight.add(job.id);
    runtime.activeJob = job.id;
    runtime.jobsReceived += 1;
    try {
        await executePrint(job);
        runtime.printed += 1;
        runtime.lastPrintError = null;
        refreshLastError();
        pendingReports.set(job.id, { job, outcome: 'complete', errorMessage: '' });
        savePendingReports();
        try { await reportJobStatus(job, 'complete'); } catch (error) {
            runtime.lastJobReportError = `JOB_COMPLETE_REPORT_FAILED: ${error.message}`;
            refreshLastError();
            log(runtime.lastJobReportError);
        }
    } catch (err) {
        runtime.failed += 1;
        runtime.lastPrintError = err.message;
        refreshLastError();
        log(`[print] FAILED job=${job.id} ${err.message}`);
        pendingReports.set(job.id, { job, outcome: 'fail', errorMessage: err.message });
        savePendingReports();
        try { await reportJobStatus(job, 'fail', err.message); } catch (reportError) {
            runtime.lastJobReportError = `JOB_FAIL_REPORT_FAILED: ${reportError.message}`;
            refreshLastError();
            log(runtime.lastJobReportError);
        }
    } finally {
        inFlight.delete(job.id);
        runtime.activeJob = null;
    }
};

let pollInProgress = false;
const tick = async () => {
    if (pollInProgress) return;
    pollInProgress = true;
    runtime.lastPollAt = new Date().toISOString();
    try {
        if (!(await flushPendingReports())) return;
        // Advertise local printer capabilities so the server routes USB/local
        // jobs ONLY to the machine that actually owns the printer.
        if (!runtime.lastPrinterScanAt || Date.now() - runtime.lastPrinterScanAt > 30000) {
            runtime.lastPrinterScanAt = Date.now();
            await listWindowsPrinters();
        }
        const printerNames = (runtime.printers || [])
            .flatMap(p => [p.name, `windows:${p.name}`])
            .filter(Boolean);
        const printersParam = printerNames.length
            ? `&printers=${encodeURIComponent(printerNames.slice(0, 100).join('|'))}`
            : '';
        // Never claim another job while Windows Spooler is still handling the
        // previous one. Concurrent USB jobs can leave the queue stuck.
        if (runtime.activeJob) return;
        const data = await bridgeFetch(
            `/api/print-gateway/bridge/jobs?gatewayId=${encodeURIComponent(GATEWAY_ID)}&claimUnassigned=${CLAIM_UNASSIGNED}&global=${GLOBAL_CLAIM}${printersParam}`
        );
        runtime.serverConnected = true;
        runtime.lastSuccessAt = new Date().toISOString();
        runtime.lastServerError = null;
        refreshLastError();
        const jobs = data.jobs || [];
        for (const job of jobs) {
            runPrintJob(job);
        }
    } catch (error) {
        runtime.serverConnected = false;
        const message = String(error.message || error).slice(0, 500);
        if (runtime.lastServerError !== message) log(`[poll] ${message}`);
        runtime.lastServerError = message;
        refreshLastError();
    } finally {
        pollInProgress = false;
    }
};

// ── HTTP API for PrinterManager ──
const server = http.createServer(async (req, res) => {
    const requestOrigin = req.headers.origin;
    if (requestOrigin && !ALLOWED_BROWSER_ORIGINS.has(requestOrigin)) {
        res.writeHead(403);
        res.end();
        return;
    }
    if (requestOrigin) res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, status: runtime.serverConnected ? 'READY' : 'DEGRADED', gatewayId: GATEWAY_ID, serverUrl: SERVER_URL, globalClaim: GLOBAL_CLAIM, ...runtime, ts: new Date().toISOString() }));
        return;
    }

    if (url.pathname === '/test-print' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { if (body.length < 10000) body += chunk; });
        req.on('end', async () => {
            try {
                const input = JSON.parse(body || '{}');
                const printers = await listWindowsPrinters();
                const selected = input.printer || printers.find(p => p.isDefault)?.address || printers[0]?.address;
                if (!selected) throw new Error('NO_WINDOWS_PRINTER_FOUND');
                const isNetwork = input.printerType === 'NETWORK' || input.printerType === 'LAN' || (!String(selected).startsWith('windows:') && /^[^:]+(?::\d+)?$/.test(String(selected)));
                if (isNetwork) await printRawTcp(selected, input.text || 'RestoFlow Bridge Test\r\n', 'text');
                else await printText(String(selected).replace(/^windows:/, ''), input.text || 'RestoFlow Bridge Test\r\n');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, printer: selected }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: error.message }));
            }
        });
        return;
    }

    if (url.pathname === '/printers') {
        try {
            const printers = await listWindowsPrinters();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, printers, ts: new Date().toISOString() }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
    }

    res.writeHead(404); res.end();
});

server.listen(PORT, '127.0.0.1', () => {
    log(`HTTP API on http://localhost:${PORT} (health + printers)`);
    listWindowsPrinters().then(printers => log(`[printers] detected=${printers.length} names=${printers.map(printer => printer.name).join(' | ')}`));
    tick();
    setInterval(tick, POLL_MS);
});

process.on('SIGINT', () => { log('shutdown'); logStream.end(); server.close(); process.exit(0); });
