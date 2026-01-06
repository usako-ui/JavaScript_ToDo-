import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { google } from 'googleapis'

dotenv.config()

/* ========= パス設定 ========= */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ========= Express ========= */
const app = express()
const PORT = process.env.PORT || 10000

app.use(cors())
app.use(express.json())

/* ========= Vite build を配信 ========= */
app.use(express.static(path.join(__dirname, 'dist')))

/* ========= Google Sheets 設定 ========= */
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

  console.log('✅ Google Sheets connected')
}

/* =================================================
   ユーティリティ関数
================================================= */

/**
 * 次のタスクIDを生成（3桁の通番、001-999、999の次は001に戻る）
 */
async function getNextTaskId() {
  try {
    // 既存のタスクを取得
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE
    })

    const rows = response.data.values || []
    
    // ヘッダー行を除いて、既存のタスクIDを取得
    const existingIds = rows.slice(1)
      .map(row => row[0]) // A列（タスクID）
      .filter(id => id && /^\d{1,3}$/.test(id.toString().trim())) // 1-3桁の数字のみ
      .map(id => parseInt(id.toString().trim(), 10)) // 数値に変換

    if (existingIds.length === 0) {
      // タスクが存在しない場合は001から開始
      return '001'
    }

    // 最大値を取得
    const maxId = Math.max(...existingIds)
    
    // 次のIDを計算（999を超えたら1に戻る）
    const nextId = (maxId >= 999) ? 1 : maxId + 1
    
    // 3桁のゼロパディング
    return nextId.toString().padStart(3, '0')
  } catch (error) {
    console.error('タスクID生成エラー:', error)
    // エラー時はタイムスタンプベースのIDを返す（フォールバック）
    return Date.now().toString().slice(-3).padStart(3, '0')
  }
}

/* =================================================
   API
================================================= */

/* ===== 一覧取得 ===== */
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
      content: row[2] || '',
      dueDate: row[3] || null,
      completed: row[4] === 'true' || row[4] === true,
      category: row[7] || '',
      priority: row[8] || 'medium'
    }))

    res.json(tasks)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load tasks' })
  }
})

/* ===== 新規追加 ===== */
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, content, dueDate, category, priority } = req.body

    if (!title) {
      return res.status(400).json({ error: 'title is required' })
    }

    // 3桁の通番IDを生成
    const id = await getNextTaskId()

    const newRow = [
      id,
      title,
      content || '',
      dueDate || '',
      'false',
      'Web',
      '',
      category || '',
      priority || 'medium'
    ]

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
      valueInputOption: 'RAW',
      resource: { values: [newRow] }
    })

    res.status(201).json({
      id,
      title,
      content: content || '',
      dueDate: dueDate || null,
      completed: false,
      category: category || '',
      priority: priority || 'medium'
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to add task' })
  }
})

/* ===== 更新 ===== */
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id
    const { title, content, dueDate, completed, category, priority } = req.body

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE
    })

    const rows = response.data.values || []
    const index = rows.findIndex((row, i) => i > 0 && row[0] === taskId)

    if (index === -1) {
      return res.status(404).json({ error: 'Task not found' })
    }

    const rowNumber = index + 1
    const old = rows[index]

    const updatedRow = [
      taskId,
      title ?? old[1],
      content ?? old[2],
      dueDate ?? old[3],
      completed !== undefined ? (completed ? 'true' : 'false') : old[4],
      old[5],
      old[6],
      category ?? old[7],
      priority ?? old[8]
    ]

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${rowNumber}:I${rowNumber}`,
      valueInputOption: 'RAW',
      resource: { values: [updatedRow] }
    })

    res.json({
      id: taskId,
      title: updatedRow[1],
      content: updatedRow[2],
      dueDate: updatedRow[3] || null,
      completed: updatedRow[4] === 'true',
      category: updatedRow[7],
      priority: updatedRow[8]
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

/* ===== 削除 ===== */
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE
    })

    const rows = response.data.values || []
    const index = rows.findIndex((row, i) => i > 0 && row[0] === taskId)

    if (index === -1) {
      return res.status(404).json({ error: 'Task not found' })
    }

    const rowNumber = index

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    })

    const sheetId = spreadsheet.data.sheets.find(
      s => s.properties.title === SHEET_NAME
    ).properties.sheetId

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber,
              endIndex: rowNumber + 1
            }
          }
        }]
      }
    })

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

/* ========= SPA fallback（必ず最後） ========= */
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
