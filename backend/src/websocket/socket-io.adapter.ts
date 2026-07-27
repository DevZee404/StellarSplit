import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext } from '@nestjs/common';

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly options: Record<string, any>,
  ) {
    super(app);
  }

  override createIOServer(port: number, options: Record<string, any> = {}) {
    return super.createIOServer(port, {
      ...options,
      ...this.options,
    });
  }
}