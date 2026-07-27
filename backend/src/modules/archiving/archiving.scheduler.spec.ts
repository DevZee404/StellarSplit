import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ArchivingScheduler } from "./archiving.scheduler";
import { ArchivingService } from "./archiving.service";
import { ArchiveReason } from "./entities/split-archive.entity";
import { EmailService } from "../../email/email.service";
import { Split } from "../../entities/split.entity";
import { Participant } from "../../entities/participant.entity";
import { User } from "../../entities/user.entity";

describe("ArchivingScheduler", () => {
  let scheduler: ArchivingScheduler;
  let splitRepository: { find: jest.Mock };
  let participantRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let archivingService: { archiveSplit: jest.Mock };
  let emailService: { sendArchiveWarning: jest.Mock };
  let configService: { get: jest.Mock };
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    splitRepository = { find: jest.fn().mockResolvedValue([]) };
    participantRepository = { findOne: jest.fn() };
    userRepository = { findOne: jest.fn() };
    archivingService = { archiveSplit: jest.fn() };
    emailService = { sendArchiveWarning: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(90) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArchivingScheduler,
        { provide: getRepositoryToken(Split), useValue: splitRepository },
        {
          provide: getRepositoryToken(Participant),
          useValue: participantRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: ArchivingService, useValue: archivingService },
        { provide: EmailService, useValue: emailService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    scheduler = module.get<ArchivingScheduler>(ArchivingScheduler);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  it("skips execution entirely when NODE_ENV is test", async () => {
    process.env.NODE_ENV = "test";

    await scheduler.handleArchivingSweep();

    expect(splitRepository.find).not.toHaveBeenCalled();
    expect(archivingService.archiveSplit).not.toHaveBeenCalled();
    expect(emailService.sendArchiveWarning).not.toHaveBeenCalled();
  });

  it("queues a pre-archive warning for splits 7 days from archiving", async () => {
    process.env.NODE_ENV = "development";

    const eightyThreeDaysAgo = new Date(
      Date.now() - 83 * 24 * 60 * 60 * 1000,
    );

    splitRepository.find.mockResolvedValueOnce([
      {
        id: "split-1",
        description: "Trip to Lagos",
        updatedAt: eightyThreeDaysAgo,
        creatorWalletAddress: "GABC...WALLET",
      },
    ]);
    participantRepository.findOne.mockResolvedValueOnce({
      userId: "user-1",
      walletAddress: "GABC...WALLET",
    });
    userRepository.findOne.mockResolvedValueOnce({
      id: "user-1",
      email: "creator@example.com",
    });

    await scheduler.sendPreArchiveWarnings(90);

    expect(emailService.sendArchiveWarning).toHaveBeenCalledWith(
      "creator@example.com",
      expect.objectContaining({ splitDescription: "Trip to Lagos" }),
    );
  });

  it("skips the warning when the creator's email can't be resolved", async () => {
    process.env.NODE_ENV = "development";

    splitRepository.find.mockResolvedValueOnce([
      {
        id: "split-1",
        description: "Trip to Lagos",
        updatedAt: new Date(),
        creatorWalletAddress: "GABC...WALLET",
      },
    ]);
    participantRepository.findOne.mockResolvedValueOnce(null);

    await scheduler.sendPreArchiveWarnings(90);

    expect(emailService.sendArchiveWarning).not.toHaveBeenCalled();
  });

  it("archives splits past the ARCHIVE_AFTER_DAYS threshold", async () => {
    process.env.NODE_ENV = "development";

    splitRepository.find.mockResolvedValueOnce([{ id: "split-2" }]);

    await scheduler.archiveDueSplits(90);

    expect(archivingService.archiveSplit).toHaveBeenCalledWith(
      "split-2",
      ArchiveReason.COMPLETED,
      "system",
    );
  });

  it("continues processing remaining splits if one archive call fails", async () => {
    process.env.NODE_ENV = "development";

    splitRepository.find.mockResolvedValueOnce([
      { id: "split-fail" },
      { id: "split-ok" },
    ]);
    archivingService.archiveSplit
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    await scheduler.archiveDueSplits(90);

    expect(archivingService.archiveSplit).toHaveBeenCalledTimes(2);
    expect(archivingService.archiveSplit).toHaveBeenNthCalledWith(
      2,
      "split-ok",
      ArchiveReason.COMPLETED,
      "system",
    );
  });
});