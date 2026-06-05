import nodemailer, { Transporter } from 'nodemailer';
import logger from '../utils/logger';

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    // Auto-generate Ethereal test account for dev
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    logger.info(`Ethereal email account: ${testAccount.user}`);
    logger.info(`Preview URL will appear per email sent`);
  }

  return transporter;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  try {
    const t = await getTransporter();
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || '"Millennial PM" <noreply@millennialcompany.in>',
      ...payload,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`Email preview: ${previewUrl}`);
    }
    logger.info(`Email sent to ${payload.to}: ${info.messageId}`);
  } catch (err) {
    logger.error('Failed to send email', err);
  }
}

export function deadlineReminderHtml(params: {
  employeeName: string;
  taskName: string;
  projectName: string;
  deadline: Date;
  hoursLeft: number;
}) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #e53e3e;">Task Deadline Reminder</h2>
      <p>Hi ${params.employeeName},</p>
      <p>This is a reminder that your task is due in <strong>${params.hoursLeft} hour(s)</strong>.</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Task</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${params.taskName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Project</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${params.projectName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Deadline</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${params.deadline.toLocaleString()}</td></tr>
      </table>
      <p>Please ensure your work is submitted on time.</p>
      <p>— Millennial PM System</p>
    </div>
  `;
}

export function overdueAlertHtml(params: {
  recipientName: string;
  taskName: string;
  projectName: string;
  deadline: Date;
  role: 'employee' | 'manager';
}) {
  const message =
    params.role === 'employee'
      ? 'Your task is overdue. Please update the status or contact your Project Manager.'
      : `An assigned employee's task is overdue. Please follow up.`;

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #c53030;">Overdue Task Alert</h2>
      <p>Hi ${params.recipientName},</p>
      <p>${message}</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Task</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${params.taskName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Project</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${params.projectName}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Was Due</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${params.deadline.toLocaleString()}</td></tr>
      </table>
      <p>— Millennial PM System</p>
    </div>
  `;
}
