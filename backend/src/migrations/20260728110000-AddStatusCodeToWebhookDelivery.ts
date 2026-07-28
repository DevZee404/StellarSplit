import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddStatusCodeToWebhookDelivery20260728110000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'webhook_deliveries',
      new TableColumn({
        name: 'statusCode',
        type: 'integer',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('webhook_deliveries', 'statusCode');
  }
}
