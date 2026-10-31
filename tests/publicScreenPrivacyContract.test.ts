import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
    fileURLToPath(new URL('../server/routes/publicScreenRoutes.ts', import.meta.url)),
    'utf8',
);
const admsRouteSource = readFileSync(
    fileURLToPath(new URL('../server/routes/admsRoutes.ts', import.meta.url)),
    'utf8',
);
const admsServiceSource = readFileSync(
    fileURLToPath(new URL('../server/services/zktecoAdmsService.ts', import.meta.url)),
    'utf8',
);
const attendanceBridgeSource = readFileSync(
    fileURLToPath(new URL('../server/routes/attendanceBridgeRoutes.ts', import.meta.url)),
    'utf8',
);
const webhookControllerSource = readFileSync(
    fileURLToPath(new URL('../server/controllers/webhookController.ts', import.meta.url)),
    'utf8',
);
const operatorScreenSource = readFileSync(
    fileURLToPath(new URL('../public/operator-screen.html', import.meta.url)),
    'utf8',
);
const kdsLiteSource = readFileSync(
    fileURLToPath(new URL('../public/kdslite.html', import.meta.url)),
    'utf8',
);

describe('public operator screen privacy contract', () => {
    it('does not expose customer phone numbers to KDS or packing screens', () => {
        expect(routeSource).not.toContain('customerPhone: orders.customerPhone');
        expect(routeSource).not.toContain('customerPhone: order?.customerPhone');
    });

    it('audits public screen mutations with branch context', () => {
        expect(routeSource).toContain("eventType: 'PUBLIC_SCREEN_TICKET_BUMPED'");
        expect(routeSource).toContain("eventType: 'PUBLIC_SCREEN_ORDER_HANDOVER'");
        expect(routeSource).toContain('branchId: ticket.branchId');
        expect(routeSource).toContain('branchId: order.branchId');
        expect(routeSource).toContain("code: 'BRANCH_MISMATCH'");
        expect(routeSource).toContain("const requestedBranchId = getParam(req.query.branchId");
        expect(operatorScreenSource).toContain("/bump?branchId=' + encodeURIComponent(branchId)");
        expect(operatorScreenSource).toContain("/handover?branchId=' + encodeURIComponent(branchId)");
        expect(kdsLiteSource).toContain("url += '?branchId=' + encodeURIComponent(branchId)");
    });

    it('keeps ADMS attendance payloads branch-scoped and free of raw biometric rows', () => {
        expect(admsRouteSource).toContain("eventType: 'ADMS_ATTENDANCE_PAYLOAD_ACCEPTED'");
        expect(admsRouteSource).toContain('payloadLineCount');
        expect(admsServiceSource).toContain('io.to(`branch:${branchId}`).emit');
        expect(admsServiceSource).not.toContain('latestLogs: batch.slice');
        expect(admsServiceSource).not.toContain('io.emit(\'biometrics:logs_arrived\'');
    });

    it('audits every attendance bridge mutation with aggregate metadata', () => {
        for (const eventType of [
            'ATTENDANCE_BRIDGE_DEVICES_REGISTERED',
            'ATTENDANCE_BRIDGE_COMMANDS_CLAIMED',
            'ATTENDANCE_BRIDGE_COMMAND_COMPLETED',
            'ATTENDANCE_BRIDGE_BACKUP_RECEIVED',
            'ATTENDANCE_BRIDGE_LOGS_INGESTED',
        ]) {
            expect(attendanceBridgeSource).toContain(`'${eventType}'`);
        }
        expect(attendanceBridgeSource).toContain('const auditBridgeMutation');
    });

    it('does not return webhook secrets or header values and audits endpoint mutations', () => {
        expect(webhookControllerSource).toContain('const safeEndpoint');
        expect(webhookControllerSource).toContain('secretConfigured: Boolean(endpoint.secret)');
        expect(webhookControllerSource).toContain('headerKeys:');
        expect(webhookControllerSource).toContain("'WEBHOOK_ENDPOINT_CREATED'");
        expect(webhookControllerSource).toContain("'WEBHOOK_ENDPOINT_UPDATED'");
        expect(webhookControllerSource).toContain("'WEBHOOK_ENDPOINT_DELETED'");
        expect(webhookControllerSource).not.toContain('res.status(201).json(endpoint)');
        expect(webhookControllerSource).not.toContain('res.json(endpoint)');
    });
});
