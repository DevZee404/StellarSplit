import { ConfigService } from "@nestjs/config";
import { Networks } from "@stellar/stellar-sdk";
import { StellarService } from "./stellar.service";

describe("StellarService", () => {
  const createConfigService = (passphrase?: string) =>
    ({
      get: jest.fn((key: string) => {
        if (key === "STELLAR_NETWORK_PASSPHRASE") {
          return passphrase;
        }

        if (key === "STELLAR_HORIZON_URL") {
          return "https://horizon-testnet.stellar.org";
        }

        if (key === "STELLAR_NETWORK") {
          return "testnet";
        }

        return undefined;
      }),
    }) as unknown as ConfigService;

  it("returns the configured Stellar network passphrase", () => {
    const configService = createConfigService(
      "Public Global Stellar Network ; September 2015",
    );
    const service = new StellarService(configService);

    expect(service.getNetworkPassphrase()).toBe(
      "Public Global Stellar Network ; September 2015",
    );
    expect((configService as any).get).toHaveBeenCalledWith(
      "STELLAR_NETWORK_PASSPHRASE",
    );
  });

  it("falls back to testnet when no passphrase is configured", () => {
    const service = new StellarService(createConfigService(undefined));

    expect(service.getNetworkPassphrase()).toBe(Networks.TESTNET);
  });
});
