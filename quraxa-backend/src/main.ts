import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Two supported ways to get HTTPS in production — pick ONE:
//
// 1) Reverse proxy (recommended for most deployments — Nginx/Caddy/IIS in
//    front of this Node process, proxy holds the TLS cert, Node stays on
//    plain HTTP behind it). Set TRUST_PROXY=1 so req.ip/req.secure reflect
//    the real client instead of the proxy, which the login rate-limiter and
//    audit log both rely on. Only set this if a proxy actually sits in
//    front — otherwise a client can spoof X-Forwarded-For and dodge the
//    rate limit entirely.
//
// 2) Direct HTTPS from this process (simpler single-VM setups with no
//    reverse proxy) — set SSL_KEY_PATH and SSL_CERT_PATH to a cert issued
//    for your real domain (e.g. via Let's Encrypt/certbot). Never use a
//    self-signed cert for anything but local testing.
function loadHttpsOptions() {
  const keyPath = process.env.SSL_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH;
  if (!keyPath || !certPath) return undefined;
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

async function bootstrap() {
  const httpsOptions = loadHttpsOptions();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...(httpsOptions && { httpsOptions }),
  });

  if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // FRONTEND_URL supports a comma-separated list for production (e.g. your
  // real domain, possibly both http/https during cutover). Falls back to
  // any localhost dev port, since Vite bumps to 5174/5175... if 5173 is taken.
  const allowedOrigins = process.env.FRONTEND_URL?.split(',').map((o) => o.trim());
  app.enableCors({
    origin: allowedOrigins ?? /^http:\/\/localhost:\d+$/,
    credentials: true,
  });

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`Server listening on ${httpsOptions ? 'https' : 'http'}://localhost:${port}`);
}

bootstrap();
