import { Kysely, PostgresDialect, Generated, ColumnType } from 'kysely'
import { Pool } from 'pg'

// bigint columns are returned as strings by node-pg, so id types are string.

export interface CategoriesTable {
  code: string
  name: string
  tier: number
  parent_code: string | null
  slug: string | null
  icon: string | null
  thumbnail: string | null
  meta_title: string | null
  meta_description: string | null
}

export interface UnitsTable {
  id: Generated<number>
  name: string
}

export interface ProductsTable {
  id: Generated<string>
  public_id: Generated<string>
  barcode: string | null
  title: string
  description: string | null
  detailed_description: string | null
  detailed_info: string | null
  brand: string | null
  alias: string | null
  image_path: string | null
  category_code: string | null
  unit_id: number | null
  is_weighted: Generated<boolean>
  weight_grams: number | null
  is_published: Generated<boolean>
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string>
}

export interface DietaryTagsTable {
  id: Generated<number>
  name: string
}

export interface ProductDietaryTable {
  product_id: string
  dietary_id: number
}

export interface AllergensTable {
  id: Generated<number>
  name: string
}

export interface ProductAllergensTable {
  product_id: string
  allergen_id: number
}

export interface Database {
  categories: CategoriesTable
  units: UnitsTable
  products: ProductsTable
  dietary_tags: DietaryTagsTable
  product_dietary: ProductDietaryTable
  allergens: AllergensTable
  product_allergens: ProductAllergensTable
}

export function createDatabase(): Kysely<Database> {
  const dialect = new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
    }),
  })

  return new Kysely<Database>({ dialect })
}
