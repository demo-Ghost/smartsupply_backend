import 'dotenv/config'
import { buildApp } from './app.js'

const HOST = process.env.HOST ?? '0.0.0.0'
const PORT = parseInt(process.env.PORT ?? '3000', 10)

async function start(): Promise<void> {
  const app = await buildApp()

  try {
    await app.listen({ host: HOST, port: PORT })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
