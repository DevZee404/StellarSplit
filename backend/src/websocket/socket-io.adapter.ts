import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext } from '@nestjs/common';

type OriginValue = string | string[] | boolean | RegExp | undefined;
type OriginCallback = (err: Error | null, allow?: boolean) => void;
type OriginChecker = (requestOrigin: string, callback: OriginCallback) => void;

function toOriginChecker(origin: OriginValue | OriginChecker): OriginChecker {
  if (typeof origin === 'function') {
    return origin as OriginChecker;
  }

  return (requestOrigin: string, callback: OriginCallback) => {
    // Non-browser clients (curl, server-to-server) send no Origin header at all —
    // CORS doesn't apply to them; let them through.
    if (!requestOrigin) {
      return callback(null, true);
    }

    let allowed: boolean;
    if (origin === true || origin === undefined) {
      allowed = true;
    } else if (origin === false) {
      allowed = false;
    } else if (origin instanceof RegExp) {
      allowed = origin.test(requestOrigin);
    } else if (Array.isArray(origin)) {
      allowed = origin.includes(requestOrigin);
    } else {
      allowed = origin === requestOrigin;
    }

    return allowed
      ? callback(null, true)
      : callback(new Error(`Origin ${requestOrigin} not allowed by CORS`));
  };
}

export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly options: Record<string, any>,
  ) {
    super(app);
  }

  override createIOServer(port: number, options: Record<string, any> = {}) {
    // this.options may itself be the cors block ({ origin, methods, credentials })
    // or may already nest a `cors` key — normalize either shape.
    const corsSource = this.options?.cors ?? this.options ?? options.cors ?? {};
    const { origin, ...restCors } = corsSource;

    return super.createIOServer(port, {
      ...options,
      ...this.options,
      cors: {
        ...restCors,
        origin: toOriginChecker(origin),
      },
    });
  }
}