import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ProblemJsonFilter } from './common/errors/problem-json.filter';
import { RedactedLogger } from './common/logging/redacted-logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: new RedactedLogger() });

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new ProblemJsonFilter());

  const config = new DocumentBuilder()
    .setTitle('Horizon API')
    .setDescription(
      'Financial goal forecasting API. Every forecast-bearing response carries a projection disclaimer — this is not financial advice.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Horizon API listening on http://localhost:${port}/api/v1 (docs at /api/docs)`);
}

bootstrap();
