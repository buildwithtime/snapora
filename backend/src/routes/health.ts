import { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  const handler = async () => ({
    ok: true,
    service: 'snapora-backend',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });

  app.get('/health', handler);
  app.get('/api/health', handler);
}
