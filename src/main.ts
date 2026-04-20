import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, Request } from 'express';

interface RequestWithRawBody extends Request {
  rawBody: Buffer;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1/');

  app.use(
    json({
      verify: (req: RequestWithRawBody, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: '*',
  });

  const options = new DocumentBuilder()
    .setTitle('AppliTrack API Service')
    .setDescription('AppliTrack API Docs')
    .setVersion('1.0')
    .addServer('http://localhost:2200/', 'Local environment')
    .addServer('https://applitrack-api.shotnubsolutions.com/', 'Production')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);
  await app.listen(process.env.PORT ?? 2200);
}
bootstrap();
