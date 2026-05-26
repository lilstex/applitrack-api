import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const ThrottlerWithRedis = ThrottlerModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const redisUrl = config.get<string>('REDIS_URL');

    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      tls: config.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
      connectionName: 'applitrack-throttler',
    });

    redis.on('error', (err) => {
      console.warn('Throttler Redis error:', err.message);
    });

    return {
      throttlers: [
        { name: 'short', ttl: 1000, limit: 5 },
        {
          name: 'medium',
          ttl: 60000,
          limit: config.get<number>('THROTTLE_LIMIT') ?? 60,
        },
        { name: 'long', ttl: 3600000, limit: 500 },
      ],
      storage: new ThrottlerStorageRedisService(redis),
    };
  },
});
