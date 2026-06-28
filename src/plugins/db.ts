import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import { Kysely } from 'kysely'
import { createDatabase, Database } from '../db/database.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: Kysely<Database>
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const db = createDatabase()

  fastify.decorate('db', db)

  fastify.addHook('onClose', async () => {
    await db.destroy()
  })
}

export default fp(dbPlugin, { name: 'db' })
