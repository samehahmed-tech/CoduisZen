import logger from '../utils/logger';

const log = logger.child({ service: 'sms' });

export type SMSMessage = {
    to: string;
    text: string;
};

class SMSService {
    private isReady: boolean = true; // Assuming API based, always ready unless configured otherwise

    public getStatus() {
        return { status: this.isReady ? 'READY' : 'UNCONFIGURED' };
    }

    public async sendSms(payload: SMSMessage) {
        if (!this.isReady) {
            log.warn('SMS service is not ready. Skipping message to ' + payload.to);
            return false;
        }

        // TODO: Integrate with local Egyptian providers like Fawry, Vodafone SMS, or VictoryLink
        // For now, this is a stub that logs the intent to send.
        log.info(`[SMS Stub] Sending to ${payload.to}: ${payload.text}`);
        
        return { provider: 'stub', messageId: `sms-${Date.now()}`, to: payload.to, acceptedAt: new Date().toISOString() };
    }
}

export const smsService = new SMSService();

export const sendSmsText = async (payload: SMSMessage) => {
    return smsService.sendSms(payload);
};
