import Fastify, { FastifyInstance } from 'fastify'
import sensiblePlugin from './plugins/sensible.js'
import dbPlugin from './plugins/db.js'
import swaggerPlugin from './plugins/swagger.js'
import productsRoutes from './routes/products.js'
import { API_PREFIX } from './config.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  })

  await app.register(sensiblePlugin)
  await app.register(dbPlugin)
  await app.register(swaggerPlugin)

  // Register route plugins here (all mounted under the API prefix, e.g. /api)
  await app.register(productsRoutes, { prefix: `${API_PREFIX}/products` })

  return app
}
