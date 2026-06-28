import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

/**
 * Add a typed interface per table, e.g.:
 *
 * export interface UsersTable {
 *   id: Generated<number>
 *   email: string
 *   created_at: ColumnType<Date, string | undefined, never>
 * }
 *
 * Then add it to Database:
 *   users: UsersTable
 */
export interface Database {
  // tables go here
}

export function createDatabase(): Kysely<Database> {
  const dialect = new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  })

  return new Kysely<Database>({ dialect })
}
