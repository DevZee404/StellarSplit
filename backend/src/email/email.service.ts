import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import * as handlebars from "handlebars";
import * as fs from "fs";
import * as path from "path";
import { User } from "../entities/user.entity";

const SUBJECT_MAP: Record<string, string> = {
  invitation: "Invitation to join a new Split on StellarSplit",
  reminder: "Payment Reminder for StellarSplit",
  confirmation: "Payment Received Confirmation",
  completed: "Split Completed!",
  archive_warning: "Your split will be archived in 7 days",
};

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: nodemailer.Transporter;
  private useDevStub = false;

  constructor(
    @InjectQueue("email_queue") private readonly emailQueue: Queue,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const smtpHost = this.configService.get<string>("SMTP_HOST");

    if (!smtpHost) {
      this.logger.warn(
        "SMTP_HOST is not configured. Emails will be logged to stdout instead of sent.",
      );
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      this.useDevStub = true;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: this.configService.get<number>("SMTP_PORT", 587),
      auth: {
        user: this.configService.get<string>("SMTP_USER"),
        pass: this.configService.get<string>("SMTP_PASSWORD"),
      },
    });
  }

  async sendTemplatedEmail(
    to: string,
    type: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const templatePath = path.join(__dirname, "templates", `${type}.hbs`);
    const source = fs.readFileSync(templatePath, "utf8");
    const template = handlebars.compile(source);
    const html = template(context);

    const result = await this.transporter.sendMail({
      from: '"StellarSplit" <noreply@stellarsplit.com>',
      to,
      subject: SUBJECT_MAP[type] || "StellarSplit Notification",
      html,
    });

    if (this.useDevStub) {
      this.logger.warn(
        `[DEV EMAIL STUB] Email to ${to} (${type}): ${result.message?.toString() ?? JSON.stringify(result)}`,
      );
    }
  }

  async sendInvitation(
    to: string,
    context: {
      inviterName: string;
      splitDescription: string;
      amount: number;
      joinLink: string;
    },
  ) {
    await this.emailQueue.add("sendEmail", {
      to,
      type: "invitation",
      context,
    });
  }

  async sendPaymentReminder(
    to: string,
    context: {
      participantName: string;
      splitDescription: string;
      amountDue: number;
      paymentLink: string;
    },
  ) {
    await this.emailQueue.add("sendEmail", {
      to,
      type: "reminder",
      context,
    });
  }

  async sendPaymentConfirmation(
    to: string,
    context: { amount: number; splitDescription: string; txHash: string },
  ) {
    await this.emailQueue.add("sendEmail", {
      to,
      type: "confirmation",
      context,
    });
  }

  async sendSplitCompleted(
    to: string,
    context: { splitDescription: string; totalAmount: number },
  ) {
    await this.emailQueue.add("sendEmail", {
      to,
      type: "completed",
      context,
    });
  }

  async sendArchiveWarning(
    to: string,
    context: { splitDescription: string; archiveDate: string },
  ) {
    await this.emailQueue.add("sendEmail", {
      to,
      type: "archive_warning",
      context,
    });
  }

  async updatePreferences(userId: string, preferences: any) {
    await this.userRepository.update(userId, { emailPreferences: preferences });
  }

  async getUser(userId: string) {
    return this.userRepository.findOne({ where: { id: userId } });
  }
}
