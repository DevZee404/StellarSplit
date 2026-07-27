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
    // Normalize: this.options may itself be the cors block ({ origin, methods, credentials, ... })
    // or may already contain a nested `cors` key. Either way, it must win over any
    // cors config baked into a per-gateway @WebSocketGateway() decorator.
    const resolvedCors = this.options?.cors ?? this.options;

    return super.createIOServer(port, {
      ...options,
      ...this.options,
      cors: resolvedCors,
    });
  }
}