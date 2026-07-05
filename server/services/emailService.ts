import nodemailer from 'nodemailer';

interface SendMailInput {
    to: string[];
    cc?: string[];
    subject: string;
    text: string;
    attachments?: { filename: string; content: Buffer }[];
}

const getOptionalBoolean = (value: string | undefined): boolean | undefined => {
    if (!value) return undefined;
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    return undefined;
};

const isSmtpConfigured = () => {
    return Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        process.env.SMTP_FROM
    );
};

export const emailService = {
    isConfigured() {
        return isSmtpConfigured();
    },

    async sendTextMail(input: SendMailInput) {
        if (!isSmtpConfigured()) {
            throw new Error('SMTP_NOT_CONFIGURED');
        }

        const secure = getOptionalBoolean(process.env.SMTP_SECURE);
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: secure ?? Number(process.env.SMTP_PORT) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        const result = await transporter.sendMail({
            from: process.env.SMTP_FROM,
            to: input.to.join(','),
            cc: input.cc?.length ? input.cc.join(',') : undefined,
            subject: input.subject,
            text: input.text,
            attachments: input.attachments,
        });

        return {
            accepted: result.accepted,
            rejected: result.rejected,
            messageId: result.messageId,
        };
    },
};

export default emailService;
