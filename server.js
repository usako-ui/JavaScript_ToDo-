import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { google } from 'googleapis'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 10000

app.use(cors())
app.use(express.json())

/* ========= ★ ここ重要：Vite build を配信 ========= */
app.use(express.static(path.join(__dirname, 'dist')))
/* ================================================ */

// ===== Google Sheets 設定（既存そのまま）=====
const SPREADSHEET_ID = process.env.SPREADSHEET_ID
const SHEET_NAME = 'シート1'
const RANGE = `${SHEET_NAME}!A:I`

let sheets

async function initGoogleSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })

  sheets = google.sheets({
    version: 'v4',
    auth: await auth.getClient()
  })
}

// ===== API =====
app.get('/api/tasks', async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE
    })

    const rows = response.data.values || []
    const tasks = rows.slice(1).map(row => ({
      id: row[0],
      title: row[1],
      completed: row[4] === 'true'
    }))

    res.json(tasks)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Sheets error' })
  }
})

/* ========= ★ SPA fallback（最後に置く） ========= */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})
/* =============================================== */

async function start() {
  await initGoogleSheets()
  app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`)
  })
}

start()
