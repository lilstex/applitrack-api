import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as path from 'path';
import * as ejs from 'ejs';
import { ConfigService } from '@nestjs/config';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import * as nodemailer from 'nodemailer';

export interface Whatsapp {
  body: string;
  to: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly basePath: string;
  private transporter: nodemailer.Transporter;
  private readonly twilio: any;
  private readonly whatsappFrom: string;

  constructor(private readonly configService: ConfigService) {
    this.basePath = path.join(__dirname, '../../views');

    const options: SMTPTransport.Options = {
      host: this.configService.get<string>('EMAIL_HOST'),
      port: parseInt(this.configService.get<string>('EMAIL_PORT') || '465', 10),
      secure: this.configService.get<string>('EMAIL_PORT') === '465',
      auth: {
        user: this.configService.get<string>('EMAIL_USERNAME'),
        pass: this.configService.get<string>('EMAIL_PASSWORD'),
      },
    };

    this.transporter = nodemailer.createTransport(options);
  }

  async renderTemplate(template: string, data: any): Promise<string> {
    try {
      return await ejs.renderFile(
        path.join(this.basePath, `${template}.ejs`),
        data,
      );
    } catch (error) {
      this.logger.error(
        `Failed to render email template "${template}"`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Error rendering email template');
    }
  }

  async sendEmail(options: {
    to: string;
    from: string;
    subject: string;
    html: string;
  }): Promise<{ status: boolean; message: string }> {
    const { to, from, subject, html } = options;

    try {
      const info = await this.transporter.sendMail({ from, to, subject, html });
      return { status: true, message: 'Email sent successfully' };
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}`,
        error instanceof Error ? error.stack : String(error),
      );
      return { status: false, message: 'Failed to send email' };
    }
  }

  async sendEmailVerificationCode(obj: any): Promise<any> {
    try {
      const from =
        this.configService.get<string>('EMAIL_FROM') || 'Bethy<team@bethy.ai>';
      const { user, email, code, template = 'verification' } = obj;
      const html = await this.renderTemplate(template, { user, email, code });
      const data = await this.sendEmail({
        from,
        to: email,
        subject: 'Bethy AI Account Verification',
        html,
      });
      return { ...data };
    } catch (error) {
      this.logger.error(
        'sendEmailVerificationCode failed',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        status: false,
        message: 'Error occured while sending code',
      };
    }
  }

  async sendWelcomeNote(obj: any): Promise<any> {
    try {
      const { user, email, link, template = 'welcome' } = obj;
      const html = await this.renderTemplate(template, { user, email, link });
      const data = await this.sendEmail({
        from:
          this.configService.get<string>('EMAIL_FROM') ||
          'Bethy<team@bethy.ai>',
        to: email,
        subject: 'Bethy AI welcome Note And Demo',
        html,
      });
      return { ...data };
    } catch (error) {
      this.logger.error(
        'sendWelcomeNote failed',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        status: false,
        message: 'Error occured while sending welcome message',
      };
    }
  }

  async sendPasswordResetLink(obj: any): Promise<any> {
    try {
      const { user, email, link, template = 'reset-password' } = obj;
      const html = await this.renderTemplate(template, { email, user, link });
      const data = await this.sendEmail({
        from:
          this.configService.get<string>('EMAIL_FROM') ||
          'ShotNubSolutions<applitrack@shotnubsolutions.com>',
        to: email,
        subject: 'Shotnub Solutions Applitrack Password Reset',
        html,
      });
      return { ...data };
    } catch (error) {
      this.logger.error(
        'sendPasswordResetLink failed',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        status: false,
        message: 'Error occured while sending password reset link',
      };
    }
  }

  async sendVerificationEmail(obj: any): Promise<any> {
    try {
      const { user, email, link, template = 'verify-email' } = obj;
      const html = await this.renderTemplate(template, { email, user, link });
      const data = await this.sendEmail({
        from:
          this.configService.get<string>('EMAIL_FROM') ||
          'ShotNubSolutions<applitrack@shotnubsolutions.com>',
        to: email,
        subject: 'Verify your AppliTrack account',
        html,
      });
      return { ...data };
    } catch (error) {
      this.logger.error(
        'sendVerificationEmail failed',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        status: false,
        message: 'Error occured while sending verification email',
      };
    }
  }
}
