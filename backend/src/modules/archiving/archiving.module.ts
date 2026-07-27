import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { ArchivingService } from "./archiving.service";
import { ArchivingController } from "./archiving.controller";
import { ArchivingScheduler } from "./archiving.scheduler";
import { SplitArchive } from "./entities/split-archive.entity";
import { ReminderLog } from "./entities/reminder-log.entity";
import { Split } from "../../entities/split.entity";
import { Participant } from "../../entities/participant.entity";
import { Payment } from "../../entities/payment.entity";
import { PushNotificationsModule } from "../../push-notifications/push-notifications.module";
import { EmailModule } from "../../email/email.module";
import { User } from "../../entities/user.entity";
import { ReputationModule } from "../../reputation/reputation.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SplitArchive,
      ReminderLog,
      Split,
      Participant,
      Payment,
      User,
    ]),
    ScheduleModule.forRoot(),
    PushNotificationsModule,
    EmailModule,
    ReputationModule,
  ],
  controllers: [ArchivingController],
  providers: [ArchivingService, ArchivingScheduler],
  exports: [ArchivingService],
})
export class ArchivingModule {}