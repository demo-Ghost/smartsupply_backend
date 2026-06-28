import 'dotenv/config'
import * as fs from 'fs'
import { sql } from 'kysely'
import { createDatabase } from './database.js'

interface CategoryTier {
  code: string
  name: string
  path?: string
}
interface RawProduct {
  sku: string
  barcode: string
  title: string
  description: string | null
  detailedDescription: string | null
  detailedInfo: string | null
  brand: string | null
  alias: string | null
  category: { tier1?: CategoryTier; tier2?: CategoryTier; tier3?: CategoryTier }
  weightGrams: number
  unit: string
  dietary: string[]
  allergenics: string[]
  isWeighted: boolean
  isPublished: boolean
}

const IMAGES_DIR = 'example_images'

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

async function seed(): Promise<void> {
  const { products } = loadJson<{ products: RawProduct[] }>('example_data.json')
  const catFile = loadJson<{
    parents: Array<Record<string, unknown>>
    leaves: Array<Record<string, unknown>>
  }>('example_categories.json')

  // Local image filenames are {sku}.webp; only set image_path when the file exists.
  const haveImage = new Set<string>(
    fs.existsSync(IMAGES_DIR) ? fs.readdirSync(IMAGES_DIR) : []
  )
  if (haveImage.size === 0) {
    console.warn(`WARNING: "${IMAGES_DIR}" not found - all image_path will be null`)
  }

  // Enrichment metadata (slug/icon/thumbnail/meta) keyed by category code.
  const enrich = new Map<string, Record<string, unknown>>()
  for (const c of [...catFile.parents, ...catFile.leaves]) {
    const code = c.categoryCode as string | undefined
    if (code) enrich.set(code, c)
  }

  // Build categories from the products' own tier structure so every FK resolves.
  const catMap = new Map<
    string,
    { code: string; name: string; tier: number; parent_code: string | null }
  >()
  const addCat = (code: string, name: string, tier: number, parent: string | null): void => {
    if (!catMap.has(code)) catMap.set(code, { code, name, tier, parent_code: parent })
  }
  for (const p of products) {
    const c = p.category
    if (c.tier1?.code) addCat(c.tier1.code, c.tier1.name, 1, null)
    if (c.tier2?.code) addCat(c.tier2.code, c.tier2.name, 2, c.tier1?.code ?? null)
    if (c.tier3?.code) addCat(c.tier3.code, c.tier3.name, 3, c.tier2?.code ?? null)
  }

  const db = createDatabase()

  await db.transaction().execute(async (trx) => {
    console.log('Clearing existing data...')
    await sql`TRUNCATE categories, units, products, dietary_tags, product_dietary, allergens, product_allergens RESTART IDENTITY CASCADE`.execute(
      trx
    )

    // --- categories: insert tier by tier so parent_code FKs always exist ---
    console.log('Seeding categories...')
    for (const tier of [1, 2, 3]) {
      const rows = [...catMap.values()]
        .filter((c) => c.tier === tier)
        .map((c) => {
          const e = enrich.get(c.code)
          return {
            code: c.code,
            name: c.name,
            tier: c.tier,
            parent_code: c.parent_code,
            slug: (e?.slug as string) ?? null,
            icon: (e?.icon as string) ?? null,
            thumbnail: (e?.thumbnail as string) ?? null,
            meta_title: (e?.metaTitle as string) ?? null,
            meta_description: (e?.metaDescription as string) ?? null,
          }
        })
      if (rows.length) await trx.insertInto('categories').values(rows).execute()
    }

    // --- lookups: units, dietary_tags, allergens (build name -> id maps) ---
    const unitNames = [...new Set(products.map((p) => p.unit))]
    const unitRows = await trx
      .insertInto('units')
      .values(unitNames.map((name) => ({ name })))
      .returning(['id', 'name'])
      .execute()
    const unitMap = new Map(unitRows.map((u) => [u.name, u.id]))

    const dietNames = [...new Set(products.flatMap((p) => p.dietary ?? []))]
    const dietRows = await trx
      .insertInto('dietary_tags')
      .values(dietNames.map((name) => ({ name })))
      .returning(['id', 'name'])
      .execute()
    const dietMap = new Map(dietRows.map((d) => [d.name, d.id]))

    const algNames = [...new Set(products.flatMap((p) => p.allergenics ?? []))]
    const algRows = await trx
      .insertInto('allergens')
      .values(algNames.map((name) => ({ name })))
      .returning(['id', 'name'])
      .execute()
    const algMap = new Map(algRows.map((a) => [a.name, a.id]))

    console.log(
      `Lookups: ${unitMap.size} units, ${dietMap.size} dietary, ${algMap.size} allergens`
    )

    // --- products + junctions, chunked (RETURNING preserves VALUES order in PG) ---
    console.log(`Seeding ${products.length} products...`)
    const CHUNK = 500
    let done = 0
    for (let i = 0; i < products.length; i += CHUNK) {
      const chunk = products.slice(i, i + CHUNK)

      const rows = chunk.map((p) => {
        const bc = String(p.barcode)
        return {
          // store-internal codes (leading 2) are not real GTINs -> null on canonical
          barcode: bc.startsWith('2') ? null : bc,
          title: p.title,
          description: p.description,
          detailed_description: p.detailedDescription,
          detailed_info: p.detailedInfo,
          brand: p.brand,
          alias: p.alias,
          // bucket object key, NOT the METRO url; null when no image exists
          image_path: haveImage.has(`${p.sku}.webp`) ? `${p.sku}.webp` : null,
          category_code: p.category.tier3?.code ?? p.category.tier2?.code ?? null,
          unit_id: unitMap.get(p.unit) ?? null,
          is_weighted: p.isWeighted,
          weight_grams: p.weightGrams,
          is_published: p.isPublished,
        }
      })

      const inserted = await trx
        .insertInto('products')
        .values(rows)
        .returning('id')
        .execute()

      const dietLinks: Array<{ product_id: string; dietary_id: number }> = []
      const algLinks: Array<{ product_id: string; allergen_id: number }> = []
      chunk.forEach((p, idx) => {
        const pid = inserted[idx].id
        for (const d of p.dietary ?? []) {
          const id = dietMap.get(d)
          if (id) dietLinks.push({ product_id: pid, dietary_id: id })
        }
        for (const a of p.allergenics ?? []) {
          const id = algMap.get(a)
          if (id) algLinks.push({ product_id: pid, allergen_id: id })
        }
      })

      if (dietLinks.length)
        await trx
          .insertInto('product_dietary')
          .values(dietLinks)
          .onConflict((oc) => oc.doNothing())
          .execute()
      if (algLinks.length)
        await trx
          .insertInto('product_allergens')
          .values(algLinks)
          .onConflict((oc) => oc.doNothing())
          .execute()

      done += chunk.length
      process.stdout.write(`\r  ${done}/${products.length}`)
    }
    console.log('')
  })

  await db.destroy()
  console.log('Seed complete.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
