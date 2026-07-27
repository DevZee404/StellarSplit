import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan, Between } from "typeorm";
import { Split } from "../../entities/split.entity";
import { Participant } from "../../entities/participant.entity";
import { User } from "../../entities/user.entity";
import { ArchivingService } from "./archiving.service";
import { ArchiveReason } from "./entities/split-archive.entity";
import { EmailService } from "../../email/email.service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PRE_ARCHIVE_WARNING_DAYS = 7;
const ARCHIVED_BY_SYSTEM = "system";

@Injectable()
export class ArchivingScheduler {
  private readonly logger = new Logger(ArchivingScheduler.name);

  constructor(
    @InjectRepository(Split)
    private readonly splitRepository: Repository<Split>,
    @InjectRepository(Participant)
    private readonly participantRepository: Repository<Participant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly archivingService: ArchivingService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  @Cron("0 3 * * *", { timeZone: "UTC" })
  async handleArchivingSweep(): Promise<void> {
    // Never let the cron fire in automated test runs — tests drive this
    // logic by calling the handler methods directly instead.
    if (process.env.NODE_ENV === "test") {
      return;
    }

    const archiveAfterDays = this.configService.get<number>(
      "ARCHIVE_AFTER_DAYS",
      90,
    );

    this.logger.log(
      `Starting archiving sweep (ARCHIVE_AFTER_DAYS=${archiveAfterDays})`,
    );

    await this.sendPreArchiveWarnings(archiveAfterDays);
    await this.archiveDueSplits(archiveAfterDays);

    this.logger.log("Archiving sweep complete");
  }

  /**
   * Splits whose updatedAt falls exactly (archiveAfterDays - 7) days ago
   * will be archived in 7 days. Warn their creators.
   *
   * Note: archived splits are physically deleted from `splits` (moved into
   * `split_archives` by ArchivingService), so a plain status/updatedAt
   * query is sufficient — there's no `archivedAt` flag to filter on.
   */
  async sendPreArchiveWarnings(archiveAfterDays: number): Promise<void> {
    const warnThresholdDays = archiveAfterDays - PRE_ARCHIVE_WARNING_DAYS;
    const { start, end } = this.dayBoundsAgo(warnThresholdDays);

    const splits = await this.splitRepository.find({
      where: {
        status: "completed",
        updatedAt: Between(start, end),
      },
    });

    this.logger.log(`${splits.length} split(s) due for pre-archive warning`);

    for (const split of splits) {
      try {
        const creatorEmail = await this.getCreatorEmail(split);

        if (!creatorEmail) {
          this.logger.warn(
            `Split ${split.id} has no resolvable creator email, skipping warning`,
          );
          continue;
        }

        const archiveDate = new Date(
          split.updatedAt.getTime() + archiveAfterDays * MS_PER_DAY,
        );

        await this.emailService.sendArchiveWarning(creatorEmail, {
          splitDescription: split.description || "Split",
          archiveDate: archiveDate.toISOString(),
        });
      } catch (error) {
        this.logger.error(
          `Failed to queue pre-archive warning for split ${split.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  /**
   * Splits completed and inactive for longer than archiveAfterDays get
   * archived (moved out of the primary table by ArchivingService).
   */
  async archiveDueSplits(archiveAfterDays: number): Promise<void> {
    const cutoff = new Date(Date.now() - archiveAfterDays * MS_PER_DAY);

    const splits = await this.splitRepository.find({
      where: {
        status: "completed",
        updatedAt: LessThan(cutoff),
      },
    });

    this.logger.log(`${splits.length} split(s) due for archiving`);

    for (const split of splits) {
      try {
        await this.archivingService.archiveSplit(
          split.id,
          ArchiveReason.COMPLETED,
          ARCHIVED_BY_SYSTEM,
        );
      } catch (error) {
        this.logger.error(
          `Failed to archive split ${split.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  /**
   * Split only stores creatorWalletAddress — resolve it to a User's email
   * via the matching Participant row, since Participant links
   * (walletAddress -> userId) and User links (userId -> email).
   */
  private async getCreatorEmail(split: Split): Promise<string | null> {
    if (!split.creatorWalletAddress) {
      return null;
    }

    const creatorParticipant = await this.participantRepository.findOne({
      where: {
        splitId: split.id,
        walletAddress: split.creatorWalletAddress,
      },
    });

    if (!creatorParticipant) {
      return null;
    }

    const user = await this.userRepository.findOne({
      where: { id: creatorParticipant.userId },
    });

    return user?.email ?? null;
  }

  private dayBoundsAgo(daysAgo: number): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getTime() - daysAgo * MS_PER_DAY);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + MS_PER_DAY);
    return { start, end };
  }
}