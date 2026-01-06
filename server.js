import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { google } from 'googleapis'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

/* ========= 基本設定 ========= */
const app = express()
const PORT = process.env.PORT || 3000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ========= ミドルウェア ========= */
app.use(cors())
app.use(express.json())

// Vite build後のファイルを配信
app.use(express.static(path.join(__dirname, 'dist')))

/* ========= Google Sheets 設定 ========= */
const SPREADSHEET_ID = process.env.SPREADSHEET_ID
const SHEET_NAME = 'シート1'
const RANGE = `${SHEET_NAME}!A:I`

let auth
let sheets

async function initGoogleSheets() {
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
      auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      })
    } else {
      throw new Error('Google認証情報が設定されていません')
    }

    const authClient = await auth.getClient()
    sheets = google.sheets({ version: 'v4', auth: authClient })

    await ensureSheetExists()
    await ensureSheetHeaders()

    console.log('✅ Google Sheets API 初期化完了')
  } catch (error) {
    console.error('❌ Google Sheets 初期化エラー:', error.message)
    throw error
  }
}

async function ensureSheetExists() {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID
  })

  const titles = spreadsheet.data.sheets.map(s => s.properties.title)
  if (!titles.includes(SHEET_NAME)) {
    console.warn(`⚠ ${SHEET_NAME} シートが見つかりません`)
  }
}

async function ensureSheetHeaders() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:I1`
    })
    if (!res.data.values) {
      console.warn('⚠ ヘッダー行が存在しません')
    }
  } catch {
    console.warn('⚠ ヘッダー確認をスキップ')
  }
}

/* ========= API ========= */

// 取得
app.get('/api/tasks', async (req, res) => {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE
    })

    const rows = result.data.values || []
    if (rows.length <= 1) return res.json([])

    const tasks = rows.slice(1).map(row => ({
      id: row[0] || '',
      title: row[1] || '',
      content: row[2] || '',
      dueDate: row[3] || null,
      completed: row[4] === 'true' || row[4] === true,
      category: row[7] || '',
      priority: row[8] || 'medium',
      createdAt: new Date().toISOString()
    }))

    res.json(tasks)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '取得失敗' })
  }
})

// 追加
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, content, dueDate, category, priority } = req.body
    if (!title) return res.status(400).json({ error: 'タイトル必須' })

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
      valueInputOption: 'RAW',
      resource: {
        values: [[
          id,
          title,
          content || '',
          dueDate || '',
          false,
          'Webアプリ',
          '',
          category || '',
          priority || 'medium'
        ]]
      }
    })

    res.status(201).json({
      id,
      title,
      content,
      dueDate,
      category,
      priority,
      completed: false,
      createdAt: new Date().toISOString()
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '追加失敗' })
  }
})

// 更新
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id
    const { completed } = req.body

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE
    })

    const rows = result.data.values || []
    const index = rows.findIndex((r, i) => i > 0 && r[0] === id)
    if (index === -1) return res.status(404).json({ error: '未検出' })

    rows[index][4] = completed

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${index + 1}:I${index + 1}`,
      valueInputOption: 'RAW',
      resource: { values: [rows[index]] }
    })

    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '更新失敗' })
  }
})

// 削除
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE
    })

    const rows = result.data.values || []
    const index = rows.findIndex((r, i) => i > 0 && r[0] === id)
    if (index === -1) return res.status(404).json({ error: '未検出' })

    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const sheetId = meta.data.sheets.find(s => s.properties.title === SHEET_NAME).properties.sheetId

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: index,
              endIndex: index + 1
            }
          }
        }]
      }
    })

    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '削除失敗' })
  }
})

/* ========= SPA対応 ========= */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

/* ========= 起動 ========= */
async function start() {
  await initGoogleSheets()
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
  })
}

start()
