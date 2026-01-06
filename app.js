/* ========= API設定 ========= */
// Viteのプロキシ設定を使用する場合は相対パス、直接接続する場合は環境変数から取得
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

/* ========= 状態 ========= */
let tasks = []
let currentFilter = 'all'      // all / active / completed
let currentSort = 'date'       // date / priority
let currentCategory = 'all'    // all / work / study / shopping
let editingTaskId = null
let isLoading = false

/* ========= マスタ ========= */
const categoryEmojis = {
  work: '💼',
  study: '📖',
  shopping: '🛒',
  default: '📌'
}

const categoryLabels = {
  work: '仕事',
  study: '学習',
  shopping: '買い物'
}

const priorityLabels = {
  high: '高',
  medium: '中',
  low: '低'
}

/* ========= API通信 ========= */
async function apiRequest(endpoint, options = {}) {
  try {
    // エンドポイントが/apiで始まることを確認
    const path = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`
    // API_BASE_URLが'/api'の場合は相対パス、それ以外はフルURL
    const url = API_BASE_URL === '/api' ? path : `${API_BASE_URL}${path}`
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'リクエストに失敗しました' }))
      throw new Error(error.error || `HTTP error! status: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('APIリクエストエラー:', error)
    alert(`エラーが発生しました: ${error.message}`)
    throw error
  }
}

/* ========= 永続化 ========= */
async function loadTasks() {
  try {
    isLoading = true
    tasks = await apiRequest('/api/tasks')
    renderTasks()
  } catch (error) {
    console.error('タスク読み込みエラー:', error)
    tasks = []
    renderTasks()
  } finally {
    isLoading = false
  }
}

/* ========= 追加・更新 ========= */
async function addTask(title, content, dueDate, category, priority) {
  try {
    if (editingTaskId) {
      // 更新
      const updatedTask = await apiRequest(`/api/tasks/${editingTaskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title,
          content,
          dueDate: dueDate || null,
          category,
          priority
        })
      })

      // ローカルのタスクを更新
      const index = tasks.findIndex(t => t.id === editingTaskId)
      if (index !== -1) {
        tasks[index] = updatedTask
      }

      editingTaskId = null
      document.querySelector('.btn-primary').textContent = 'タスクを追加'
    } else {
      // 追加
      const newTask = await apiRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          dueDate: dueDate || null,
          category,
          priority
        })
      })

      tasks.push(newTask)
    }

    renderTasks()
  } catch (error) {
    console.error('タスク追加/更新エラー:', error)
  }
}

/* ========= 編集 ========= */
function startEditTask(id) {
  const task = tasks.find(t => t.id === id)
  if (!task) return

  document.getElementById('taskTitle').value = task.title
  document.getElementById('taskContent').value = task.content || ''
  document.getElementById('taskDueDate').value =
    task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : ''
  document.getElementById('taskCategory').value = task.category || ''
  document.getElementById('taskPriority').value = task.priority

  editingTaskId = id
  document.querySelector('.btn-primary').textContent = 'タスクを更新'
}

/* ========= 削除 ========= */
async function deleteTask(id) {
  if (!confirm('このタスクを削除しますか？')) return
  
  try {
    await apiRequest(`/api/tasks/${id}`, {
      method: 'DELETE'
    })

    tasks = tasks.filter(t => t.id !== id)
    renderTasks()
  } catch (error) {
    console.error('タスク削除エラー:', error)
  }
}

/* ========= 完了切替 ========= */
async function toggleTask(id) {
  const task = tasks.find(t => t.id === id)
  if (!task) return

  try {
    const updatedTask = await apiRequest(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        completed: !task.completed
      })
    })

    // ローカルのタスクを更新
    const index = tasks.findIndex(t => t.id === id)
    if (index !== -1) {
      tasks[index] = updatedTask
    }

    renderTasks()
  } catch (error) {
    console.error('タスク完了切替エラー:', error)
  }
}

/* ========= フィルタ & ソート（完全独立） ========= */
function getFilteredAndSortedTasks() {
  let filtered = [...tasks]

  // カテゴリ
  if (currentCategory !== 'all') {
    filtered = filtered.filter(t => t.category === currentCategory)
  }

  // 完了 / 未完了
  if (currentFilter === 'active') {
    filtered = filtered.filter(t => !t.completed)
  } else if (currentFilter === 'completed') {
    filtered = filtered.filter(t => t.completed)
  }

  // 並び替え
  filtered.sort((a, b) => {
    if (currentSort === 'priority') {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.priority] - order[b.priority]
    } else {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
      return aTime - bTime
    }
  })

  return filtered
}

/* ========= 期日表示 ========= */
function formatDueDate(dueDate) {
  if (!dueDate) return null

  const date = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  const diff = Math.ceil((target - today) / 86400000)

  if (diff < 0) return { text: '期限切れ', className: 'overdue' }
  if (diff === 0) return { text: '今日', className: 'today' }
  if (diff === 1) return { text: '明日', className: 'soon' }
  if (diff <= 7) return { text: `あと${diff}日`, className: 'upcoming' }

  return { text: date.toLocaleDateString('ja-JP'), className: '' }
}

/* ========= 描画 ========= */
function renderTasks() {
  const list = document.getElementById('tasksList')
  if (!list) return

  const items = getFilteredAndSortedTasks()

  if (items.length === 0) {
    list.innerHTML = `<p class="empty-state">タスクはまだありません</p>`
    return
  }

  list.innerHTML = items.map(task => {
    const due = formatDueDate(task.dueDate)
    const emoji = categoryEmojis[task.category] || categoryEmojis.default
    const category = categoryLabels[task.category] || ''

    return `
      <div class="task-card ${task.completed ? 'completed' : ''}">
        <input type="checkbox"
          ${task.completed ? 'checked' : ''}
          onchange="window.app.toggleTask('${task.id}')">

        <div class="task-content">
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${task.content ? `<div>${escapeHtml(task.content)}</div>` : ''}

          <div class="task-meta">
           <span class="category ${task.category}">
  ${emoji} ${category}
</span>
            <span class="priority priority-${task.priority}">
              ${priorityLabels[task.priority]}
            </span>
            ${due ? `<span class="${due.className}">${due.text}</span>` : ''}
          </div>
        </div>

        <div class="task-actions">
          <button onclick="window.app.startEditTask('${task.id}')">編集</button>
          <button onclick="window.app.deleteTask('${task.id}')">削除</button>
        </div>
      </div>
    `
  }).join('')
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/* ========= イベント ========= */
function setupEventListeners() {

  // 登録ページ
  const form = document.getElementById('taskForm')
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault()

      const title = taskTitle.value.trim()
      if (!title) {
        alert('タイトルを入力してください')
        return
      }

      await addTask(
        title,
        taskContent.value.trim(),
        taskDueDate.value,
        taskCategory.value,
        taskPriority.value
      )

      form.reset()
      taskTitle.focus()
    })
  }

// 完了 / 未完了 / すべて
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter

    // ★ active切替（これが足りなかった）
    document.querySelectorAll('.filter-btn').forEach(b =>
      b.classList.remove('active')
    )
    btn.classList.add('active')

    renderTasks()
  })
})

  // ソート
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSort = btn.dataset.sort
      renderTasks()
    })
  })

  // 一覧ページ：カテゴリ
  const categorySelect = document.getElementById('listCategory')
  if (categorySelect) {
    categorySelect.addEventListener('change', e => {
      currentCategory = e.target.value
      renderTasks()
    })
  }

  // 一覧ページ：並び替え
  const sortSelect = document.getElementById('listSort')
  if (sortSelect) {
    sortSelect.addEventListener('change', e => {
      currentSort = e.target.value
      renderTasks()
    })
  }
}

/* ========= 初期化 ========= */
export async function initTodoApp() {
  setupEventListeners()
  await loadTasks()

  window.app = {
    toggleTask,
    deleteTask,
    startEditTask
  }
}
