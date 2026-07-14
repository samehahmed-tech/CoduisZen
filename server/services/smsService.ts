import logger from '../utils/logger';

const log = logger.child({ service: 'sms' });

export type SMSMessage = {
    to: string;
    text: string;
};

class SMSService {
    public getStatus(): { status: 'READY' | 'UNCONFIGURED' } {
        return { status: 'UNCONFIGURED' };
    }

    public async sendSms(_payload: SMSMessage): Promise<never> {
        log.warn('SMS send rejected because no provider is configured');
        throw new Error('SMS_PROVIDER_NOT_CONFIGURED');
    }
}

export const smsService = new SMSService();

export const sendSmsText = async (payload: SMSMessage) => {
    return smsService.sendSms(payload);
};
