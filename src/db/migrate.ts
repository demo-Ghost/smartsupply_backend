import 'dotenv/config'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { Pool } from 'pg'
import { Kysely, PostgresDialect } from 'kysely'
import { FileMigrationProvider, Migrator } from 'kysely/migration'
import * as fs from 'fs/promises'
import { Database } from './database.js'

async function migrate(): Promise<void> {
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: process.env.DATABASE_URL }),
    }),
  })

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(fileURLToPath(new URL('.', import.meta.url)), 'migrations'),
    }),
  })

  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((it: { status: string; migrationName: string }) => {
    if (it.status === 'Success') {
      console.log(`migration "${it.migrationName}" was executed successfully`)
    } else if (it.status === 'Error') {
      console.error(`failed to execute migration "${it.migrationName}"`)
    }
  })

  if (error) {
    console.error('failed to run migrations')
    console.error(error)
    process.exit(1)
  }

  await db.destroy()
}

migrate()
