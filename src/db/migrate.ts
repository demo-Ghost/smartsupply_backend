import 'dotenv/config'
import * as path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { Pool } from 'pg'
import { Kysely, PostgresDialect } from 'kysely'
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration'
import * as fs from 'fs/promises'
import { Database } from './database.js'

// FileMigrationProvider passes raw Windows paths to import(), which ESM rejects.
// This provider converts them to file:// URLs so migrations load cross-platform.
class ESMFileMigrationProvider implements MigrationProvider {
  constructor(private readonly folder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {}
    const files = await fs.readdir(this.folder)

    for (const fileName of files.sort()) {
      if (!/\.(ts|js|mjs)$/.test(fileName) || fileName.endsWith('.d.ts')) continue
      const importPath = pathToFileURL(path.join(this.folder, fileName)).href
      const migration = (await import(importPath)) as Migration
      const key = fileName.substring(0, fileName.lastIndexOf('.'))
      migrations[key] = migration
    }

    return migrations
  }
}

async function migrate(): Promise<void> {
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: process.env.DATABASE_URL }),
    }),
  })

  const migrator = new Migrator({
    db,
    provider: new ESMFileMigrationProvider(
      path.join(fileURLToPath(new URL('.', import.meta.url)), 'migrations')
    ),
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
