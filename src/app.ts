import Fastify, { FastifyInstance } from 'fastify'
import sensiblePlugin from './plugins/sensible.js'
import dbPlugin from './plugins/db.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  })

  await app.register(sensiblePlugin)
  await app.register(dbPlugin)

  // Register route plugins here
  // await app.register(import('./routes/example'), { prefix: '/example' })

  return app
}
