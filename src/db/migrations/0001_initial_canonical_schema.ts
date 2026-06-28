import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // --- categories: single self-referencing table (tier 1/2/3) ---
  await db.schema
    .createTable('categories')
    .addColumn('code', 'text', (c) => c.primaryKey())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('tier', 'smallint', (c) => c.notNull())
    .addColumn('parent_code', 'text')
    .addColumn('slug', 'text')
    .addColumn('icon', 'text')
    .addColumn('thumbnail', 'text')
    .addColumn('meta_title', 'text')
    .addColumn('meta_description', 'text')
    .addForeignKeyConstraint(
      'categories_parent_fk',
      ['parent_code'],
      'categories',
      ['code']
    )
    .execute()

  // --- units: order/pricing unit lookup (ΚΙΛΑ, ΤΕΜΑΧΙΟ, ΚΥΤΙΟ) ---
  await db.schema
    .createTable('units')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('name', 'text', (c) => c.notNull().unique())
    .execute()

  // --- products: canonical ("common") products searched/ordered by HORECA ---
  await db.schema
    .createTable('products')
    .addColumn('id', 'bigint', (c) => c.primaryKey().generatedAlwaysAsIdentity())
    .addColumn('public_id', 'uuid', (c) =>
      c.notNull().defaultTo(sql`gen_random_uuid()`).unique()
    )
    .addColumn('barcode', 'text')
    .addColumn('title', 'text', (c) => c.notNull())
    .addColumn('description', 'text')
    .addColumn('detailed_description', 'text')
    .addColumn('detailed_info', 'text')
    .addColumn('brand', 'text')
    .addColumn('alias', 'text')
    .addColumn('image_path', 'text')
    .addColumn('category_code', 'text', (c) => c.references('categories.code'))
    .addColumn('unit_id', 'integer', (c) => c.references('units.id'))
    .addColumn('is_weighted', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('weight_grams', 'integer')
    .addColumn('is_published', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`)
    )
    .addColumn('updated_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`)
    )
    .execute()

  // barcode is unique only when present (weighted goods have no real GTIN -> null)
  await db.schema
    .createIndex('products_barcode_unique')
    .on('products')
    .column('barcode')
    .unique()
    .where('barcode', 'is not', null)
    .execute()

  await db.schema
    .createIndex('products_category_idx')
    .on('products')
    .column('category_code')
    .execute()

  // --- dietary tags (Vegeterian, Vegan, Ειδική διατροφή) + junction ---
  await db.schema
    .createTable('dietary_tags')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('name', 'text', (c) => c.notNull().unique())
    .execute()

  await db.schema
    .createTable('product_dietary')
    .addColumn('product_id', 'bigint', (c) =>
      c.notNull().references('products.id').onDelete('cascade')
    )
    .addColumn('dietary_id', 'integer', (c) =>
      c.notNull().references('dietary_tags.id').onDelete('cascade')
    )
    .addPrimaryKeyConstraint('product_dietary_pk', ['product_id', 'dietary_id'])
    .execute()

  // --- allergens (15 values) + junction ---
  await db.schema
    .createTable('allergens')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('name', 'text', (c) => c.notNull().unique())
    .execute()

  await db.schema
    .createTable('product_allergens')
    .addColumn('product_id', 'bigint', (c) =>
      c.notNull().references('products.id').onDelete('cascade')
    )
    .addColumn('allergen_id', 'integer', (c) =>
      c.notNull().references('allergens.id').onDelete('cascade')
    )
    .addPrimaryKeyConstraint('product_allergens_pk', [
      'product_id',
      'allergen_id',
    ])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('product_allergens').ifExists().execute()
  await db.schema.dropTable('allergens').ifExists().execute()
  await db.schema.dropTable('product_dietary').ifExists().execute()
  await db.schema.dropTable('dietary_tags').ifExists().execute()
  await db.schema.dropTable('products').ifExists().execute()
  await db.schema.dropTable('units').ifExists().execute()
  await db.schema.dropTable('categories').ifExists().execute()
}
