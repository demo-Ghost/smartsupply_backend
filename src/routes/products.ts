import { FastifyPluginAsync } from 'fastify'
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres'
import {
  ExpressionBuilder,
  Expression,
  SqlBool,
  Kysely,
} from 'kysely'
import { Database } from '../db/database.js'

type SortColumn = 'title' | 'created_at' | 'updated_at'
type SortOrder = 'asc' | 'desc'

interface ListQuery {
  search?: string
  category_code?: string
  brand?: string
  dietary?: string
  exclude_allergens?: string
  is_weighted?: boolean
  is_published?: boolean
  unit_id?: number
  barcode?: string
  sort?: SortColumn
  order?: SortOrder
  limit?: number
  offset?: number
}

/** Split a comma-separated query value into trimmed, non-empty parts. */
function splitList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/**
 * Returns the given category code plus every descendant code, so a query
 * for a tier-1 category also matches products in its tier-2/tier-3 children.
 */
async function getCategoryDescendants(
  db: Kysely<Database>,
  code: string
): Promise<string[]> {
  const rows = await db
    .withRecursive('subtree', (qb) =>
      qb
        .selectFrom('categories')
        .select('code')
        .where('code', '=', code)
        .unionAll(
          qb
            .selectFrom('categories as c')
            .innerJoin('subtree', 'subtree.code', 'c.parent_code')
            .select('c.code')
        )
    )
    .selectFrom('subtree')
    .select('code')
    .execute()

  return rows.map((row) => row.code)
}

/** Builds the shared WHERE predicate used by both the count and data queries. */
function buildWhere(
  query: ListQuery,
  categoryCodes: string[] | null
): (eb: ExpressionBuilder<Database, 'products'>) => Expression<SqlBool> {
  const search = query.search?.trim()
  const brands = splitList(query.brand)
  const dietary = splitList(query.dietary)
  const excludeAllergens = splitList(query.exclude_allergens)
  const barcode = query.barcode?.trim()

  return (eb) => {
    const conditions: Expression<SqlBool>[] = []

    // Default to published-only unless explicitly overridden.
    conditions.push(eb('products.is_published', '=', query.is_published ?? true))

    if (search) {
      const pattern = `%${search}%`
      conditions.push(
        eb.or([
          eb('products.title', 'ilike', pattern),
          eb('products.brand', 'ilike', pattern),
          eb('products.description', 'ilike', pattern),
        ])
      )
    }

    if (categoryCodes) {
      conditions.push(eb('products.category_code', 'in', categoryCodes))
    }

    if (brands.length > 0) {
      conditions.push(eb('products.brand', 'in', brands))
    }

    if (query.unit_id !== undefined) {
      conditions.push(eb('products.unit_id', '=', query.unit_id))
    }

    if (query.is_weighted !== undefined) {
      conditions.push(eb('products.is_weighted', '=', query.is_weighted))
    }

    if (barcode) {
      conditions.push(eb('products.barcode', '=', barcode))
    }

    // Product must carry ALL requested dietary tags.
    for (const name of dietary) {
      conditions.push(
        eb.exists(
          eb
            .selectFrom('product_dietary as pd')
            .innerJoin('dietary_tags as dt', 'dt.id', 'pd.dietary_id')
            .whereRef('pd.product_id', '=', 'products.id')
            .where('dt.name', '=', name)
            .select('pd.product_id')
        )
      )
    }

    // Product must contain NONE of the excluded allergens.
    if (excludeAllergens.length > 0) {
      conditions.push(
        eb.not(
          eb.exists(
            eb
              .selectFrom('product_allergens as pa')
              .innerJoin('allergens as a', 'a.id', 'pa.allergen_id')
              .whereRef('pa.product_id', '=', 'products.id')
              .where('a.name', 'in', excludeAllergens)
              .select('pa.product_id')
          )
        )
      )
    }

    return eb.and(conditions)
  }
}

/** Related entities (category, unit, dietary tags, allergens) per product. */
function relations(eb: ExpressionBuilder<Database, 'products'>) {
  return [
    jsonObjectFrom(
      eb
        .selectFrom('categories as cat')
        .whereRef('cat.code', '=', 'products.category_code')
        .select(['cat.code', 'cat.name', 'cat.tier', 'cat.parent_code', 'cat.slug'])
    ).as('category'),
    jsonObjectFrom(
      eb
        .selectFrom('units as u')
        .whereRef('u.id', '=', 'products.unit_id')
        .select(['u.id', 'u.name'])
    ).as('unit'),
    jsonArrayFrom(
      eb
        .selectFrom('product_dietary as pd')
        .innerJoin('dietary_tags as dt', 'dt.id', 'pd.dietary_id')
        .whereRef('pd.product_id', '=', 'products.id')
        .select(['dt.id', 'dt.name'])
        .orderBy('dt.name')
    ).as('dietary'),
    jsonArrayFrom(
      eb
        .selectFrom('product_allergens as pa')
        .innerJoin('allergens as a', 'a.id', 'pa.allergen_id')
        .whereRef('pa.product_id', '=', 'products.id')
        .select(['a.id', 'a.name'])
        .orderBy('a.name')
    ).as('allergens'),
  ]
}

const PRODUCT_COLUMNS = [
  'products.public_id',
  'products.barcode',
  'products.title',
  'products.description',
  'products.detailed_description',
  'products.detailed_info',
  'products.brand',
  'products.alias',
  'products.image_path',
  'products.category_code',
  'products.unit_id',
  'products.is_weighted',
  'products.weight_grams',
  'products.is_published',
  'products.created_at',
  'products.updated_at',
] as const

const productSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    public_id: { type: 'string', format: 'uuid' },
    barcode: { type: ['string', 'null'] },
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    brand: { type: ['string', 'null'] },
    image_path: { type: ['string', 'null'] },
    category_code: { type: ['string', 'null'] },
    unit_id: { type: ['integer', 'null'] },
    is_weighted: { type: 'boolean' },
    weight_grams: { type: ['integer', 'null'] },
    is_published: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    category: { type: ['object', 'null'], additionalProperties: true },
    unit: { type: ['object', 'null'], additionalProperties: true },
    dietary: { type: 'array', items: { type: 'object', additionalProperties: true } },
    allergens: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
} as const

const productsRoutes: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db

  fastify.get<{ Querystring: ListQuery }>(
    '/',
    {
      schema: {
        tags: ['products'],
        summary: 'List products',
        description:
          'Search and filter the product catalog. Comma-separated values are accepted for brand, dietary, and exclude_allergens.',
        querystring: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Case-insensitive match on title, brand, or description.',
            },
            category_code: {
              type: 'string',
              description: 'Category code; includes products in descendant categories.',
            },
            brand: { type: 'string', description: 'Comma-separated brand names.' },
            dietary: {
              type: 'string',
              description: 'Comma-separated dietary tags; product must have ALL of them.',
            },
            exclude_allergens: {
              type: 'string',
              description: 'Comma-separated allergens; products containing any are excluded.',
            },
            is_weighted: { type: 'boolean' },
            is_published: { type: 'boolean', default: true },
            unit_id: { type: 'integer' },
            barcode: { type: 'string' },
            sort: {
              type: 'string',
              enum: ['title', 'created_at', 'updated_at'],
              default: 'title',
            },
            order: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array', items: productSchema },
              pagination: {
                type: 'object',
                properties: {
                  limit: { type: 'integer' },
                  offset: { type: 'integer' },
                  total: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const query = request.query
      const sort: SortColumn = query.sort ?? 'title'
      const order: SortOrder = query.order ?? 'asc'
      const limit = query.limit ?? 20
      const offset = query.offset ?? 0

      let categoryCodes: string[] | null = null
      if (query.category_code) {
        categoryCodes = await getCategoryDescendants(db, query.category_code)
        // No matching category -> guarantee an empty result set.
        if (categoryCodes.length === 0) {
          categoryCodes = ['__none__']
        }
      }

      const where = buildWhere(query, categoryCodes)

      const totalRow = await db
        .selectFrom('products')
        .where(where)
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .executeTakeFirstOrThrow()

      const data = await db
        .selectFrom('products')
        .where(where)
        .select(PRODUCT_COLUMNS)
        .select(relations)
        .orderBy(`products.${sort}` as 'products.title', order)
        .orderBy('products.id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute()

      return {
        data,
        pagination: { limit, offset, total: Number(totalRow.count) },
      }
    }
  )

  fastify.get<{ Params: { public_id: string } }>(
    '/:public_id',
    {
      schema: {
        tags: ['products'],
        summary: 'Get a product by public ID',
        params: {
          type: 'object',
          required: ['public_id'],
          properties: {
            public_id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: productSchema,
        },
      },
    },
    async (request) => {
      const product = await db
        .selectFrom('products')
        .where('public_id', '=', request.params.public_id)
        .select(PRODUCT_COLUMNS)
        .select(relations)
        .executeTakeFirst()

      if (!product) {
        throw fastify.httpErrors.notFound('Product not found')
      }

      return product
    }
  )
}

export default productsRoutes
