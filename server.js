import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { google } from 'googleapis'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// ミドルウェア
app.use(cors())
app.use(express.json())

// Google Sheets APIの設定
const SPREADSHEET_ID = process.env.SPREADSHEET_ID
const SHEET_NAME = 'シート1'
const RANGE = `${SHEET_NAME}!A:I` // スプレッドシートの範囲（タスクID, タイトル, 内容, 期日, 完了フラグ, 登録元, イベントID, カテゴリ, 優先度）

// 認証情報の設定（サービスアカウントまたはOAuth2）
let auth
let sheets

async function initGoogleSheets() {
  try {
    // サービスアカウントキーを使用する場合
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
      auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      })
    } 
    // OAuth2クライアントID/シークレットを使用する場合
    else if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      )
      auth.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      })
    }
    // 環境変数が設定されていない場合はエラー
    else {
      throw new Error('Google認証情報が設定されていません。.envファイルを確認してください。')
    }

    const authClient = await auth.getClient()
    sheets = google.sheets({ version: 'v4', auth: authClient })

    // シートの存在確認と作成
    await ensureSheetExists()
    // スプレッドシートの存在確認とヘッダー行の作成
    await ensureSheetHeaders()
    
    console.log('Google Sheets API初期化完了')
  } catch (error) {
    console.error('Google Sheets API初期化エラー:', error.message)
    throw error
  }
}

// シートが存在するか確認
async function ensureSheetExists() {
  try {
    // スプレッドシートのメタデータを取得
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    })

    const sheetTitles = spreadsheet.data.sheets.map(sheet => sheet.properties.title)
    const sheetExists = sheetTitles.includes(SHEET_NAME)

    if (!sheetExists) {
      console.log(`警告: ${SHEET_NAME}シートが見つかりません。スプレッドシートに${SHEET_NAME}シートが存在することを確認してください。`)
    } else {
      console.log(`${SHEET_NAME}シートを確認しました`)
    }
  } catch (error) {
    console.error('シート確認エラー:', error.message)
    throw error
  }
}

// スプレッドシートのヘッダー行を確認
async function ensureSheetHeaders() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:I1`
    })

    const values = response.data.values
    if (!values || values.length === 0) {
      console.log('警告: ヘッダー行が見つかりません。スプレッドシートにヘッダー行が存在することを確認してください。')
    } else {
      console.log('ヘッダー行を確認しました:', values[0])
    }
  } catch (error) {
    console.error('ヘッダー行の確認エラー:', error.message)
    // ヘッダー行の確認エラーは警告として扱い、処理を続行
    console.log('ヘッダー行の確認をスキップして続行します')
  }
}

// タスク一覧取得
app.get('/api/tasks', async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE
    })

    const rows = response.data.values || []
    if (rows.length <= 1) {
      return res.json([])
    }

    // ヘッダー行をスキップしてタスクに変換
    // 列構成: A=タスクID, B=タイトル, C=内容, D=期日, E=完了フラグ, F=登録元, G=イベントID, H=カテゴリ, I=優先度
    const tasks = rows.slice(1).map(row => ({
      id: row[0] || '',                    // A列: タスクID
      title: row[1] || '',                 // B列: タイトル
      content: row[2] || '',               // C列: 内容
      dueDate: row[3] || null,             // D列: 期日
      completed: row[4] === 'true' || row[4] === true || row[4] === 'TRUE' || row[4] === '1', // E列: 完了フラグ
      category: row[7] || '',               // H列: カテゴリ
      priority: row[8] || 'medium',        // I列: 優先度
      createdAt: new Date().toISOString()  // createdAtは登録元やイベントIDから推測できないため、現在時刻を使用
    }))

    res.json(tasks)
  } catch (error) {
    console.error('タスク取得エラー:', error)
    res.status(500).json({ error: 'タスクの取得に失敗しました' })
  }
})

// タスク追加
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, content, dueDate, category, priority } = req.body

    if (!title) {
      return res.status(400).json({ error: 'タイトルは必須です' })
    }

    const taskId = Date.now().toString(36) + Math.random().toString(36).slice(2)
    
    // 列構成: A=タスクID, B=タイトル, C=内容, D=期日, E=完了フラグ, F=登録元, G=イベントID, H=カテゴリ, I=優先度
    const newRow = [
      taskId,                    // A列: タスクID
      title,                     // B列: タイトル
      content || '',             // C列: 内容
      dueDate || '',             // D列: 期日
      false,                     // E列: 完了フラグ
      'Webアプリ',               // F列: 登録元
      '',                        // G列: イベントID（空）
      category || '',            // H列: カテゴリ
      priority || 'medium'      // I列: 優先度
    ]

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
      valueInputOption: 'RAW',
      resource: {
        values: [newRow]
      }
    })

    const task = {
      id: taskId,
      title,
      content: content || '',
      dueDate: dueDate || null,
      category: category || '',
      priority: priority || 'medium',
      completed: false,
      createdAt: new Date().toISOString()
    }

    res.status(201).json(task)
  } catch (error) {
    console.error('タスク追加エラー:', error)
    res.status(500).json({ error: 'タスクの追加に失敗しました' })
  }
})

// タスク更新
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id
    const { title, content, dueDate, category, priority, completed } = req.body

    // タスクを検索
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE
    })

    const rows = response.data.values || []
    const taskIndex = rows.findIndex((row, index) => index > 0 && row[0] === taskId)

    if (taskIndex === -1) {
      return res.status(404).json({ error: 'タスクが見つかりません' })
    }

    const rowNumber = taskIndex + 1 // スプレッドシートの行番号（1ベース）
    const existingRow = rows[taskIndex]

    // 列構成: A=タスクID, B=タイトル, C=内容, D=期日, E=完了フラグ, F=登録元, G=イベントID, H=カテゴリ, I=優先度
    // 更新された値を準備
    const updatedCompleted = completed !== undefined 
      ? (completed === true || completed === 'true' || completed === '1') 
      : (existingRow[4] === 'true' || existingRow[4] === true || existingRow[4] === '1')
    
    const updatedRow = [
      taskId,                                                                  // A列: タスクID（変更不可）
      title !== undefined ? title : existingRow[1],                            // B列: タイトル
      content !== undefined ? content : (existingRow[2] || ''),                // C列: 内容
      dueDate !== undefined ? dueDate : (existingRow[3] || ''),                // D列: 期日
      updatedCompleted,                                                        // E列: 完了フラグ
      existingRow[5] || 'Webアプリ',                                           // F列: 登録元（変更しない）
      existingRow[6] || '',                                                    // G列: イベントID（変更しない）
      category !== undefined ? category : (existingRow[7] || ''),              // H列: カテゴリ
      priority !== undefined ? priority : (existingRow[8] || 'medium')         // I列: 優先度
    ]

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${rowNumber}:I${rowNumber}`,
      valueInputOption: 'RAW',
      resource: {
        values: [updatedRow]
      }
    })

    const task = {
      id: taskId,
      title: updatedRow[1],
      content: updatedRow[2],
      dueDate: updatedRow[3] || null,
      category: updatedRow[7],
      priority: updatedRow[8],
      completed: updatedCompleted,
      createdAt: new Date().toISOString()
    }

    res.json(task)
  } catch (error) {
    console.error('タスク更新エラー:', error)
    res.status(500).json({ error: 'タスクの更新に失敗しました' })
  }
})

// タスク削除
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id

    // タスクを検索
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE
    })

    const rows = response.data.values || []
    const taskIndex = rows.findIndex((row, index) => index > 0 && row[0] === taskId)

    if (taskIndex === -1) {
      return res.status(404).json({ error: 'タスクが見つかりません' })
    }

    const rowNumber = taskIndex + 1 // スプレッドシートの行番号（1ベース）

    // シートIDを取得
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID
    })
    const sheet = spreadsheet.data.sheets.find(s => s.properties.title === SHEET_NAME)
    if (!sheet) {
      return res.status(404).json({ error: 'シートが見つかりません' })
    }
    const sheetId = sheet.properties.sheetId

    // 行を削除
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber
            }
          }
        }]
      }
    })

    res.json({ message: 'タスクを削除しました' })
  } catch (error) {
    console.error('タスク削除エラー:', error)
    res.status(500).json({ error: 'タスクの削除に失敗しました' })
  }
})

// サーバー起動
async function startServer() {
  try {
    await initGoogleSheets()
    app.listen(PORT, () => {
      console.log(`サーバーがポート ${PORT} で起動しました`)
      console.log(`APIエンドポイント: http://localhost:${PORT}/api/tasks`)
    })
  } catch (error) {
    console.error('サーバー起動エラー:', error)
    process.exit(1)
  }
}

startServer()

