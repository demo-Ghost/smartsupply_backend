import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { API_PREFIX, PUBLIC_URL } from '../config.js'

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'SmartSupply API',
        description: 'HORECA supply catalog API',
        version: '0.1.0',
      },
      servers: [{ url: PUBLIC_URL }],
      tags: [{ name: 'products', description: 'Product catalog' }],
    },
  })

  await fastify.register(swaggerUi, {
    routePrefix: `${API_PREFIX}/docs`,
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })
}

export default fp(swaggerPlugin, { name: 'swagger' })
