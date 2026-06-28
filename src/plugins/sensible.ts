import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import sensible from '@fastify/sensible'

const sensiblePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(sensible)
}

export default fp(sensiblePlugin, { name: 'sensible' })
