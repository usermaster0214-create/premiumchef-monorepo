import 'reflect-metadata';
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  if (process.env.NODE_ENV === 'production') {
    const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length) {
      throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
    }
  }
  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
  console.log(`API PremiumChef rodando na porta ${port}`);
}
void bootstrap();
