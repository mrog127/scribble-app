import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { supabase, functionsUrl, functionsKey } from '../supabaseClient'
import { useAuth } from './AuthContext'
import { fireGalleryPulse } from '../galleryPulse.js'
import { isRecurring, nextRecurrence } from '../components/ScheduleBits.jsx'

export const AppContext = createContext(null)

const DEFAULT_CATEGORIES = [
  { id: 'personal', name: 'Personal', sort_order: 0 },
  { id: 'planning', name: 'Planning', sort_order: 1 },
]
const DEFAULT_PROJECT = { id: 'proj-scheduling', category_id: 'personal', name: 'Scheduling', sort_order: 0 }

const db = (promise) => promise.then(() => {}) // fire-and-forget helper

// Normalize a linked-id column into a clean array of string ids.
// Handles: a real array, a Postgres array literal string "{a,b}", a JSON string "[a,b]", "{}", or null.
function normalizeIds(v) {
  if (Array.isArray(v)) return v.map(x => String(x))
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s || s === '{}' || s === '[]') return []
    const inner = (s.startsWith('{') || s.startsWith('[')) ? s.slice(1, -1) : s
    return inner.split(',').map(x => x.replace(/^["']|["']$/g, '').trim()).filter(Boolean)
  }
  return []
}
// Fire-and-forget, but surface DB errors to the console (e.g. missing column / stale schema cache)
const dbw = (promise, label) => promise.then(({ error }) => {
  if (error) console.error(`Supabase write failed [${label}]:`, error.message || error)
})

export function AppProvider({ children }) {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [activeTodos, setActiveTodos] = useState([])
  const [activeNotes, setActiveNotes] = useState([])
  const [loading, setLoading] = useState(true)
  // Single source of truth for which detail page is open, so only one row is
  // highlighted at a time across all cards. Shape: { type, id } | null
  const [openDetail, setOpenDetail] = useState(null)
  // Id of a freshly-created note that should auto-enter edit mode when its page opens.
  const [autoEditNoteId, setAutoEditNoteId] = useState(null)

  // Refs so toggle/delete callbacks can read current state without stale closures
  const activeTodosRef = useRef([])
  const activeNotesRef = useRef([])
  const categoriesRef = useRef([])
  useEffect(() => { activeTodosRef.current = activeTodos }, [activeTodos])
  useEffect(() => { activeNotesRef.current = activeNotes }, [activeNotes])
  useEffect(() => { categoriesRef.current = categories }, [categories])

  useEffect(() => {
    if (!user) return
    loadAll()
  }, [user?.id]) // eslint-disable-line

  async function loadAll() {
    setLoading(true)

    let { data: cats } = await supabase.from('categories').select('*').order('sort_order')

    if (!cats || cats.length === 0) {
      await supabase.from('categories').insert(
        DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: user.id }))
      )
      await supabase.from('projects').insert({ ...DEFAULT_PROJECT, user_id: user.id })
      cats = DEFAULT_CATEGORIES
    }

    const [{ data: projs }, { data: todos }, { data: notes }, { data: links }, { data: aTodos }, { data: aNotes }] = await Promise.all([
      supabase.from('projects').select('*').order('sort_order'),
      supabase.from('todos').select('*').not('project_id', 'is', null).order('sort_order'),
      supabase.from('notes').select('*').not('project_id', 'is', null).order('sort_order'),
      supabase.from('links').select('*').order('sort_order'),
      supabase.from('todos').select('*').is('project_id', null).order('sort_order'),
      supabase.from('notes').select('*').is('project_id', null).order('sort_order'),
    ])

    const builtCats = (cats || []).map(cat => ({
      id: cat.id,
      name: cat.name,
      sendToHomescreen: cat.send_to_homescreen !== false,
      archived: cat.archived === true,
      projects: (projs || [])
        .filter(p => p.category_id === cat.id)
        .map(proj => ({
          id: proj.id,
          name: proj.name,
          archived: proj.archived === true,
          todos: (todos || []).filter(t => t.project_id === proj.id).map(t => ({
            id: t.id, text: t.text, comment: t.comment ?? null, checked: t.checked, activated: t.activated, scheduledDate: t.scheduled_date,
            recurrence: t.recurrence ?? null, recurAnchor: t.recur_anchor ?? null,
            homeSortOrder: t.home_sort_order ?? null, catSortOrder: t.cat_sort_order ?? null,
            linkedNoteIds: normalizeIds(t.linked_note_ids), linkedLinkIds: normalizeIds(t.linked_link_ids)
          })),
          notes: (notes || []).filter(n => n.project_id === proj.id).map(n => ({
            id: n.id, text: n.text, activated: n.activated, scheduledDate: n.scheduled_date, homeSortOrder: n.home_sort_order ?? null, catSortOrder: n.cat_sort_order ?? null, editorHTML: n.editor_html, archived: n.archived === true
          })),
          links: (links || []).filter(l => l.project_id === proj.id).map(l => ({
            id: l.id, url: l.url, title: l.title, activated: l.activated, scheduledDate: l.scheduled_date, homeSortOrder: l.home_sort_order ?? null, catSortOrder: l.cat_sort_order ?? null, archived: l.archived === true,
            imageUrl: l.image_url ?? null, imageFetchedAt: l.image_fetched_at ?? null, siteName: l.site_name ?? null
          })),
        }))
    }))

    // Client-side fallback for scheduled activation: flip any item whose
    // scheduled date is today or past. Mirrors the server-side daily job so
    // items never appear stuck "scheduled" once the app is opened.
    const pad2 = (n) => String(n).padStart(2, '0')
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
    const dueTodoIds = [], dueNoteIds = [], dueLinkIds = []
    const isDue = (s) => s && s <= todayStr
    // An item that comes due slots in at the TOP of its homescreen card. Home
    // order is ascending and manual reordering writes 0…n, so a negative value
    // sorts above everything; using -epoch means each day's batch also lands
    // above the batches before it. (Mirrors activate_due_scheduled() in SQL.)
    const dueOrder = -Math.floor(Date.now() / 1000)
    const due = (item) => ({ ...item, activated: true, scheduledDate: null, homeSortOrder: dueOrder })
    builtCats.forEach(cat => cat.projects.forEach(proj => {
      proj.todos = proj.todos.map(t => { if (isDue(t.scheduledDate)) { dueTodoIds.push(t.id); return due(t) } return t })
      proj.notes = proj.notes.map(n => { if (isDue(n.scheduledDate)) { dueNoteIds.push(n.id); return due(n) } return n })
      proj.links = proj.links.map(l => { if (isDue(l.scheduledDate)) { dueLinkIds.push(l.id); return due(l) } return l })
    }))
    const dueUpdate = { activated: true, scheduled_date: null, home_sort_order: dueOrder }
    if (dueTodoIds.length) db(supabase.from('todos').update(dueUpdate).in('id', dueTodoIds))
    if (dueNoteIds.length) db(supabase.from('notes').update(dueUpdate).in('id', dueNoteIds))
    if (dueLinkIds.length) db(supabase.from('links').update(dueUpdate).in('id', dueLinkIds))

    setCategories(builtCats)
    setActiveTodos((aTodos || []).map(t => ({ id: t.id, text: t.text, checked: t.checked, activated: t.activated, source: 'Active' })))
    setActiveNotes((aNotes || []).map(n => ({ id: n.id, text: n.text, activated: n.activated, editorHTML: n.editor_html, source: 'Active', accent: false })))
    setLoading(false)

    // Midnight reset: once per calendar day, deactivate any todos that are
    // both checked (completed) and activated (showing on homescreen).
    const today = new Date().toLocaleDateString()
    const lastReset = localStorage.getItem('scribble_last_midnight_reset')
    if (lastReset !== today) {
      const { error } = await supabase
        .from('todos')
        .update({ activated: false })
        .eq('checked', true)
        .eq('activated', true)
      if (!error) {
        localStorage.setItem('scribble_last_midnight_reset', today)
        setActiveTodos(prev => prev.map(t =>
          t.checked && t.activated ? { ...t, activated: false } : t
        ))
        setCategories(prev => prev.map(cat => ({
          ...cat,
          projects: cat.projects.map(proj => ({
            ...proj,
            todos: proj.todos.map(t =>
              t.checked && t.activated ? { ...t, activated: false } : t
            ),
          })),
        })))
      }
    }
  }

  // ---- Internal helper ----
  const updateProject = useCallback((categoryId, projectId, updater) => {
    setCategories(prev => prev.map(cat =>
      cat.id !== categoryId ? cat : {
        ...cat,
        projects: cat.projects.map(proj =>
          proj.id !== projectId ? proj : updater(proj)
        )
      }
    ))
  }, [])

  // ---- Active todos ----
  const addActiveTodo = useCallback((text) => {
    const tempId = Date.now()
    setActiveTodos(prev => [...prev, { id: tempId, text, checked: false, activated: false, source: 'Active' }])
    supabase.from('todos')
      .insert({ user_id: user.id, project_id: null, text, checked: false, activated: false, sort_order: 0 })
      .select().single().then(({ data }) => {
        if (data) setActiveTodos(prev => prev.map(t => t.id === tempId ? { ...t, id: data.id } : t))
      })
    return tempId
  }, [user])

  const toggleActiveTodo = useCallback((id) => {
    const item = activeTodosRef.current.find(t => t.id === id)
    if (!item) return
    const newChecked = !item.checked
    setActiveTodos(prev => {
      const t = prev.find(x => x.id === id)
      if (!t) return prev
      const toggled = { ...t, checked: newChecked }
      const rest = prev.filter(x => x.id !== id)
      return [...rest.filter(x => !x.checked), toggled, ...rest.filter(x => x.checked)]
    })
    db(supabase.from('todos').update({ checked: newChecked }).eq('id', id))
  }, [])

  const deleteActiveTodo = useCallback((id) => {
    setActiveTodos(prev => prev.filter(t => t.id !== id))
    db(supabase.from('todos').delete().eq('id', id))
  }, [])

  const reorderActiveTodos = useCallback((newOrder) => {
    setActiveTodos(newOrder)
    Promise.all(newOrder.map((t, i) => supabase.from('todos').update({ sort_order: i }).eq('id', t.id)))
  }, [])

  // ---- Active notes ----
  const addActiveNote = useCallback((text, onCreated) => {
    const tempId = Date.now()
    setActiveNotes(prev => [...prev, { id: tempId, text, activated: false, editorHTML: null, source: 'Active', accent: false }])
    supabase.from('notes')
      .insert({ user_id: user.id, project_id: null, text, activated: false, editor_html: null, sort_order: 0 })
      .select().single().then(({ data }) => {
        if (data) setActiveNotes(prev => prev.map(n => n.id === tempId ? { ...n, id: data.id } : n))
        if (data && onCreated) onCreated(data.id)
      })
    return tempId
  }, [user])

  const deleteActiveNote = useCallback((id) => {
    setActiveNotes(prev => prev.filter(n => n.id !== id))
    db(supabase.from('notes').delete().eq('id', id))
  }, [])

  const updateActiveNote = useCallback((id, editorHTML, text) => {
    setActiveNotes(prev => prev.map(n => n.id === id ? { ...n, editorHTML, text: text || n.text } : n))
    db(supabase.from('notes').update({ editor_html: editorHTML, ...(text ? { text } : {}) }).eq('id', id))
  }, [])

  const reorderActiveNotes = useCallback((newOrder) => {
    setActiveNotes(newOrder)
    Promise.all(newOrder.map((n, i) => supabase.from('notes').update({ sort_order: i }).eq('id', n.id)))
  }, [])

  // ---- Projects ----
  const addProject = useCallback((categoryId, name) => {
    const id = `proj-${Date.now()}`
    const sortOrder = categoriesRef.current.find(c => c.id === categoryId)?.projects.length || 0
    setCategories(prev => prev.map(cat =>
      cat.id !== categoryId ? cat : {
        ...cat,
        projects: [...cat.projects, { id, name, todos: [], notes: [], links: [] }]
      }
    ))
    db(supabase.from('projects').insert({ id, user_id: user.id, category_id: categoryId, name, sort_order: sortOrder }))
    return id
  }, [user])

  // ---- Project todos ----
  const addProjectTodo = useCallback((categoryId, projectId, text, activated = false, scheduledDate = null) => {
    if (scheduledDate) activated = false
    const tempId = Date.now()
    const proj = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)
    const sortOrder = proj?.todos.length || 0
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      todos: [...proj.todos, { id: tempId, text, checked: false, activated, scheduledDate, linkedNoteIds: [], linkedLinkIds: [] }]
    }))
    supabase.from('todos')
      .insert({ user_id: user.id, project_id: projectId, text, checked: false, activated, scheduled_date: scheduledDate, sort_order: sortOrder })
      .select().single().then(({ data }) => {
        if (data) updateProject(categoryId, projectId, proj => ({
          ...proj,
          todos: proj.todos.map(t => t.id === tempId ? { ...t, id: data.id } : t)
        }))
      })
    return tempId
  }, [user, updateProject])

  const addProjectNote = useCallback((categoryId, projectId, text, activated = false, scheduledDate = null, onCreated) => {
    if (scheduledDate) activated = false
    const tempId = Date.now()
    const proj = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)
    const sortOrder = proj?.notes.length || 0
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      notes: [...proj.notes, { id: tempId, text, activated, scheduledDate, editorHTML: null }]
    }))
    supabase.from('notes')
      .insert({ user_id: user.id, project_id: projectId, text, activated, scheduled_date: scheduledDate, editor_html: null, sort_order: sortOrder })
      .select().single().then(({ data }) => {
        if (data) updateProject(categoryId, projectId, proj => ({
          ...proj,
          notes: proj.notes.map(n => n.id === tempId ? { ...n, id: data.id } : n)
        }))
        if (data && onCreated) onCreated(data.id)
      })
    return tempId
  }, [user, updateProject])

  const addProjectLink = useCallback((categoryId, projectId, title, url, activated = false, scheduledDate = null) => {
    if (scheduledDate) activated = false
    const tempId = Date.now()
    const finalTitle = (title && title.trim()) || url
    const proj = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)
    const sortOrder = proj?.links.length || 0
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      links: [...proj.links, { id: tempId, url, title: finalTitle, activated, scheduledDate }]
    }))
    supabase.from('links')
      .insert({ user_id: user.id, project_id: projectId, url, title: finalTitle, activated, scheduled_date: scheduledDate, sort_order: sortOrder })
      .select().single().then(({ data }) => {
        if (data) updateProject(categoryId, projectId, proj => ({
          ...proj,
          links: proj.links.map(l => l.id === tempId ? { ...l, id: data.id } : l)
        }))
      })
    return tempId
  }, [user, updateProject])

  const toggleProjectTodo = useCallback((categoryId, projectId, todoId) => {
    const cat = categoriesRef.current.find(c => c.id === categoryId)
    const proj = cat?.projects.find(p => p.id === projectId)
    const todo = proj?.todos.find(t => t.id === todoId)
    if (!todo) return
    // A recurring item is never "completed": checking it rolls the series on to
    // the next occurrence and drops it back among the unchecked items, showing
    // the new date. Unchecking one (it can't be checked) is unaffected.
    if (!todo.checked && isRecurring(todo.recurrence)) {
      const next = nextRecurrence(todo.recurAnchor || todo.scheduledDate, todo.recurrence)
      updateProject(categoryId, projectId, proj => {
        const t = proj.todos.find(x => x.id === todoId)
        if (!t) return proj
        const rolled = { ...t, checked: false, activated: false, scheduledDate: next, recurAnchor: next }
        const rest = proj.todos.filter(x => x.id !== todoId)
        return { ...proj, todos: [...rest.filter(x => !x.checked), rolled, ...rest.filter(x => x.checked)] }
      })
      db(supabase.from('todos').update({
        checked: false, activated: false, scheduled_date: next, recur_anchor: next,
      }).eq('id', todoId))
      return
    }
    const newChecked = !todo.checked
    // Reorder so a checked item lands at the top of the checked group and an
    // unchecked item lands at the bottom of the unchecked group (mirrors
    // toggleActiveTodo). The card displays filter by checked + stable activation
    // grouping, so this carries through everywhere the todo is shown.
    updateProject(categoryId, projectId, proj => {
      const t = proj.todos.find(x => x.id === todoId)
      if (!t) return proj
      const toggled = { ...t, checked: newChecked }
      const rest = proj.todos.filter(x => x.id !== todoId)
      return { ...proj, todos: [...rest.filter(x => !x.checked), toggled, ...rest.filter(x => x.checked)] }
    })
    db(supabase.from('todos').update({ checked: newChecked }).eq('id', todoId))
  }, [updateProject])

  const updateProjectNote = useCallback((categoryId, projectId, noteId, editorHTML, text) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      notes: proj.notes.map(n => n.id !== noteId ? n : { ...n, editorHTML, text: text || n.text })
    }))
    db(supabase.from('notes').update({ editor_html: editorHTML, ...(text ? { text } : {}) }).eq('id', noteId))
  }, [updateProject])

  // ---- Todo title + attachments ----
  const updateProjectTodoText = useCallback((categoryId, projectId, todoId, text) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, text })
    }))
    db(supabase.from('todos').update({ text }).eq('id', todoId))
  }, [updateProject])

  const updateProjectTodoComment = useCallback((categoryId, projectId, todoId, comment) => {
    const value = comment && comment.trim() ? comment : null
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, comment: value })
    }))
    db(supabase.from('todos').update({ comment: value }).eq('id', todoId))
  }, [updateProject])

  const attachNoteToTodo = useCallback((categoryId, projectId, todoId, noteId) => {
    const todo = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.todos.find(t => t.id === todoId)
    if (!todo) return
    const current = todo.linkedNoteIds || []
    // Stored ids are strings — compare and store as strings so detach can match
    const id = String(noteId)
    if (current.includes(id)) return
    const newIds = [...current, id]
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedNoteIds: newIds })
    }))
    dbw(supabase.from('todos').update({ linked_note_ids: newIds }).eq('id', todoId), 'attachNote')
  }, [updateProject])

  const detachNoteFromTodo = useCallback((categoryId, projectId, todoId, noteId) => {
    const todo = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.todos.find(t => t.id === todoId)
    if (!todo) return
    const newIds = (todo.linkedNoteIds || []).filter(id => String(id) !== String(noteId))
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedNoteIds: newIds })
    }))
    dbw(supabase.from('todos').update({ linked_note_ids: newIds }).eq('id', todoId), 'detachNote')
  }, [updateProject])

  const attachLinkToTodo = useCallback((categoryId, projectId, todoId, linkId) => {
    const todo = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.todos.find(t => t.id === todoId)
    if (!todo) return
    const current = todo.linkedLinkIds || []
    const id = String(linkId)
    if (current.includes(id)) return
    const newIds = [...current, id]
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedLinkIds: newIds })
    }))
    dbw(supabase.from('todos').update({ linked_link_ids: newIds }).eq('id', todoId), 'attachLink')
  }, [updateProject])

  const detachLinkFromTodo = useCallback((categoryId, projectId, todoId, linkId) => {
    const todo = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.todos.find(t => t.id === todoId)
    if (!todo) return
    const newIds = (todo.linkedLinkIds || []).filter(id => String(id) !== String(linkId))
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedLinkIds: newIds })
    }))
    dbw(supabase.from('todos').update({ linked_link_ids: newIds }).eq('id', todoId), 'detachLink')
  }, [updateProject])

  // Reorder a todo's attached notes / links (sets the linked id arrays' order)
  const reorderTodoNotes = useCallback((categoryId, projectId, todoId, newIds) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedNoteIds: newIds })
    }))
    dbw(supabase.from('todos').update({ linked_note_ids: newIds }).eq('id', todoId), 'reorderTodoNotes')
  }, [updateProject])

  const reorderTodoLinks = useCallback((categoryId, projectId, todoId, newIds) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedLinkIds: newIds })
    }))
    dbw(supabase.from('todos').update({ linked_link_ids: newIds }).eq('id', todoId), 'reorderTodoLinks')
  }, [updateProject])

  // Create a new note in the project AND attach it to the todo
  const addTodoNote = useCallback((categoryId, projectId, todoId, text, activated = false, onCreated) => {
    const tempId = Date.now()
    const proj = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)
    const sortOrder = proj?.notes.length || 0
    const current = proj?.todos.find(t => t.id === todoId)?.linkedNoteIds || []
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      notes: [...proj.notes, { id: tempId, text, activated, editorHTML: null }],
      todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedNoteIds: [...current, tempId] })
    }))
    supabase.from('notes')
      .insert({ user_id: user.id, project_id: projectId, text, activated, editor_html: null, sort_order: sortOrder })
      .select().single().then(({ data }) => {
        if (!data) return
        const realIds = [...current, data.id]
        updateProject(categoryId, projectId, proj => ({
          ...proj,
          notes: proj.notes.map(n => n.id === tempId ? { ...n, id: data.id } : n),
          todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedNoteIds: (t.linkedNoteIds || []).map(x => x === tempId ? data.id : x) })
        }))
        dbw(supabase.from('todos').update({ linked_note_ids: realIds }).eq('id', todoId), 'addTodoNote')
        if (onCreated) onCreated(data.id)
      })
    return tempId
  }, [user, updateProject])

  // Create a new link in the project AND attach it to the todo
  const addTodoLink = useCallback((categoryId, projectId, todoId, title, url, activated = false) => {
    const tempId = Date.now()
    const finalTitle = (title && title.trim()) || url
    const proj = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)
    const sortOrder = proj?.links.length || 0
    const current = proj?.todos.find(t => t.id === todoId)?.linkedLinkIds || []
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      links: [...proj.links, { id: tempId, url, title: finalTitle, activated }],
      todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedLinkIds: [...current, tempId] })
    }))
    supabase.from('links')
      .insert({ user_id: user.id, project_id: projectId, url, title: finalTitle, activated, sort_order: sortOrder })
      .select().single().then(({ data }) => {
        if (!data) return
        const realIds = [...current, data.id]
        updateProject(categoryId, projectId, proj => ({
          ...proj,
          links: proj.links.map(l => l.id === tempId ? { ...l, id: data.id } : l),
          todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedLinkIds: (t.linkedLinkIds || []).map(x => x === tempId ? data.id : x) })
        }))
        dbw(supabase.from('todos').update({ linked_link_ids: realIds }).eq('id', todoId), 'addTodoLink')
      })
    return tempId
  }, [user, updateProject])

  // ---- Move a todo / note to a different project ----
  // Move a list item to another project. opts.moveAttachments: when true, the
  // item's attached notes/links travel with it (keeping them attached); when
  // false, the attachments stay in the original project and are detached from the
  // moved item, so it doesn't reference items that aren't in its new project.
  const moveProjectTodo = useCallback((fromCat, fromProj, toCat, toProj, todoId, opts = {}) => {
    if (fromCat === toCat && fromProj === toProj) return
    const { moveAttachments = false } = opts
    const src = categoriesRef.current.find(c => c.id === fromCat)?.projects.find(p => p.id === fromProj)
    const todo = src?.todos.find(t => t.id === todoId)
    if (!todo) return
    const noteIds = moveAttachments ? (todo.linkedNoteIds || []) : []
    const linkIds = moveAttachments ? (todo.linkedLinkIds || []) : []
    const movedNotes = noteIds.map(id => src.notes.find(n => String(n.id) === String(id))).filter(Boolean)
    const movedLinks = linkIds.map(id => src.links.find(l => String(l.id) === String(id))).filter(Boolean)
    const movedNoteIdSet = new Set(movedNotes.map(n => n.id))
    const movedLinkIdSet = new Set(movedLinks.map(l => l.id))
    const movedTodo = moveAttachments ? todo : { ...todo, linkedNoteIds: [], linkedLinkIds: [] }
    const sortOrder = categoriesRef.current.find(c => c.id === toCat)?.projects.find(p => p.id === toProj)?.todos.length || 0
    setCategories(prev => prev.map(cat => {
      let projects = cat.projects
      if (cat.id === fromCat) projects = projects.map(p => p.id !== fromProj ? p : {
        ...p,
        todos: p.todos.filter(t => t.id !== todoId),
        notes: movedNoteIdSet.size ? p.notes.filter(n => !movedNoteIdSet.has(n.id)) : p.notes,
        links: movedLinkIdSet.size ? p.links.filter(l => !movedLinkIdSet.has(l.id)) : p.links,
      })
      if (cat.id === toCat) projects = projects.map(p => p.id !== toProj ? p : {
        ...p,
        todos: [...p.todos, movedTodo],
        notes: movedNotes.length ? [...p.notes, ...movedNotes] : p.notes,
        links: movedLinks.length ? [...p.links, ...movedLinks] : p.links,
      })
      return projects === cat.projects ? cat : { ...cat, projects }
    }))
    db(supabase.from('todos').update(moveAttachments
      ? { project_id: toProj, sort_order: sortOrder }
      : { project_id: toProj, sort_order: sortOrder, linked_note_ids: [], linked_link_ids: [] }
    ).eq('id', todoId))
    movedNotes.forEach(n => db(supabase.from('notes').update({ project_id: toProj }).eq('id', n.id)))
    movedLinks.forEach(l => db(supabase.from('links').update({ project_id: toProj }).eq('id', l.id)))
  }, [])

  const moveProjectNote = useCallback((fromCat, fromProj, toCat, toProj, noteId) => {
    if (fromCat === toCat && fromProj === toProj) return
    const note = categoriesRef.current.find(c => c.id === fromCat)?.projects.find(p => p.id === fromProj)?.notes.find(n => n.id === noteId)
    if (!note) return
    const sortOrder = categoriesRef.current.find(c => c.id === toCat)?.projects.find(p => p.id === toProj)?.notes.length || 0
    setCategories(prev => prev.map(cat => {
      let projects = cat.projects
      if (cat.id === fromCat) projects = projects.map(p => p.id === fromProj ? { ...p, notes: p.notes.filter(n => n.id !== noteId) } : p)
      if (cat.id === toCat) projects = projects.map(p => p.id === toProj ? { ...p, notes: [...p.notes, note] } : p)
      return projects === cat.projects ? cat : { ...cat, projects }
    }))
    db(supabase.from('notes').update({ project_id: toProj, sort_order: sortOrder }).eq('id', noteId))
  }, [])

  const moveProjectLink = useCallback((fromCat, fromProj, toCat, toProj, linkId) => {
    if (fromCat === toCat && fromProj === toProj) return
    const link = categoriesRef.current.find(c => c.id === fromCat)?.projects.find(p => p.id === fromProj)?.links.find(l => l.id === linkId)
    if (!link) return
    const sortOrder = categoriesRef.current.find(c => c.id === toCat)?.projects.find(p => p.id === toProj)?.links.length || 0
    setCategories(prev => prev.map(cat => {
      let projects = cat.projects
      if (cat.id === fromCat) projects = projects.map(p => p.id === fromProj ? { ...p, links: p.links.filter(l => l.id !== linkId) } : p)
      if (cat.id === toCat) projects = projects.map(p => p.id === toProj ? { ...p, links: [...p.links, link] } : p)
      return projects === cat.projects ? cat : { ...cat, projects }
    }))
    db(supabase.from('links').update({ project_id: toProj, sort_order: sortOrder }).eq('id', linkId))
  }, [])

  const toggleProjectTodoActivated = useCallback((categoryId, projectId, todoId) => {
    const cat = categoriesRef.current.find(c => c.id === categoryId)
    const proj = cat?.projects.find(p => p.id === projectId)
    const todo = proj?.todos.find(t => t.id === todoId)
    if (!todo) return
    const newActivated = !todo.activated
    if (newActivated) fireGalleryPulse(categoryId, todoId)
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, activated: newActivated })
    }))
    db(supabase.from('todos').update({ activated: newActivated }).eq('id', todoId))
  }, [updateProject])

  const toggleProjectNoteActivated = useCallback((categoryId, projectId, noteId) => {
    const cat = categoriesRef.current.find(c => c.id === categoryId)
    const proj = cat?.projects.find(p => p.id === projectId)
    const note = proj?.notes.find(n => n.id === noteId)
    if (!note) return
    const newActivated = !note.activated
    if (newActivated) fireGalleryPulse(categoryId, noteId)
    updateProject(categoryId, projectId, proj => ({
      ...proj, notes: proj.notes.map(n => n.id !== noteId ? n : { ...n, activated: newActivated })
    }))
    db(supabase.from('notes').update({ activated: newActivated }).eq('id', noteId))
  }, [updateProject])

  // ---- Archive / retrieve a project note ----
  // Archiving clears the note from its zones: it stops showing on the homescreen
  // (activated → false) and is hidden from the project note list unless "Show Archived".
  const archiveProjectNote = useCallback((categoryId, projectId, noteId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, notes: proj.notes.map(n => n.id !== noteId ? n : { ...n, archived: true, activated: false })
    }))
    dbw(supabase.from('notes').update({ archived: true, activated: false }).eq('id', noteId), 'archiveNote')
  }, [updateProject])

  const unarchiveProjectNote = useCallback((categoryId, projectId, noteId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, notes: proj.notes.map(n => n.id !== noteId ? n : { ...n, archived: false })
    }))
    dbw(supabase.from('notes').update({ archived: false }).eq('id', noteId), 'unarchiveNote')
  }, [updateProject])

  // Archive several notes in one project at once (used when completing a todo
  // whose attached notes should be archived alongside it).
  const archiveProjectNotes = useCallback((categoryId, projectId, noteIds) => {
    const ids = (noteIds || []).filter(Boolean)
    if (!ids.length) return
    const idSet = new Set(ids.map(String))
    updateProject(categoryId, projectId, proj => ({
      ...proj, notes: proj.notes.map(n => idSet.has(String(n.id)) ? { ...n, archived: true, activated: false } : n)
    }))
    dbw(supabase.from('notes').update({ archived: true, activated: false }).in('id', ids), 'archiveNotesBatch')
  }, [updateProject])

  // ---- Archive / retrieve a project link ----
  const archiveProjectLink = useCallback((categoryId, projectId, linkId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, links: proj.links.map(l => l.id !== linkId ? l : { ...l, archived: true, activated: false })
    }))
    dbw(supabase.from('links').update({ archived: true, activated: false }).eq('id', linkId), 'archiveLink')
  }, [updateProject])

  const unarchiveProjectLink = useCallback((categoryId, projectId, linkId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, links: proj.links.map(l => l.id !== linkId ? l : { ...l, archived: false })
    }))
    dbw(supabase.from('links').update({ archived: false }).eq('id', linkId), 'unarchiveLink')
  }, [updateProject])

  // Modal prompt: "archive this completed todo's attached notes?" The check
  // handlers call promptArchiveAttachments; a single global modal resolves it.
  const [archivePrompt, setArchivePrompt] = useState(null)
  const archivePromptRef = useRef(null)
  useEffect(() => { archivePromptRef.current = archivePrompt }, [archivePrompt])
  const promptArchiveAttachments = useCallback((categoryId, projectId, noteIds) => {
    const ids = (noteIds || []).filter(Boolean)
    if (!ids.length) return
    setArchivePrompt({ categoryId, projectId, noteIds: ids })
  }, [])
  const resolveArchivePrompt = useCallback((confirm) => {
    const p = archivePromptRef.current
    if (p && confirm) archiveProjectNotes(p.categoryId, p.projectId, p.noteIds)
    setArchivePrompt(null)
  }, [archiveProjectNotes])

  // Modal prompt: "Are you sure you want to delete?" for notes, links, project
  // cards and categories. The caller passes a callback that does the actual
  // (animated) delete; it runs only if the user confirms — after the modal has
  // closed, so the page is back before the delete animation plays.
  const [deletePrompt, setDeletePrompt] = useState(null)
  const deletePromptRef = useRef(null)
  useEffect(() => { deletePromptRef.current = deletePrompt }, [deletePrompt])
  // opts: { title, confirmLabel } — lets callers reuse the modal for other
  // destructive actions (e.g. clearing completed items).
  const promptDelete = useCallback((onConfirm, opts = {}) => {
    setDeletePrompt({ onConfirm, ...opts })
  }, [])
  const resolveDeletePrompt = useCallback((confirm) => {
    const p = deletePromptRef.current
    setDeletePrompt(null)
    if (p && confirm && typeof p.onConfirm === 'function') {
      requestAnimationFrame(() => p.onConfirm())
    }
  }, [])

  // Modal prompt: when a list item with attachments moves to another project, ask
  // whether the attachments should move along. The caller passes a resolver that
  // receives true (move them) or false (leave them in the original project).
  const [moveAttachPrompt, setMoveAttachPrompt] = useState(null)
  const moveAttachPromptRef = useRef(null)
  useEffect(() => { moveAttachPromptRef.current = moveAttachPrompt }, [moveAttachPrompt])
  const promptMoveAttachments = useCallback((info, onResolve) => {
    setMoveAttachPrompt({ ...info, onResolve })
  }, [])
  const resolveMoveAttachPrompt = useCallback((confirm) => {
    const p = moveAttachPromptRef.current
    setMoveAttachPrompt(null)
    if (p && typeof p.onResolve === 'function') p.onResolve(confirm)
  }, [])

  // Footer compose request: a project card's "Add ..." button asks the footer to
  // open, preset to that project + content type. App registers the handler so the
  // focus happens synchronously inside the click (needed for the mobile keyboard).
  const composeHandlerRef = useRef(null)
  const registerComposeHandler = useCallback((fn) => { composeHandlerRef.current = fn }, [])
  const requestCompose = useCallback((target) => { composeHandlerRef.current?.(target) }, [])

  const updateProjectLink = useCallback((categoryId, projectId, linkId, title, url) => {
    const finalUrl = (url || '').trim()
    const finalTitle = (title && title.trim()) || finalUrl
    updateProject(categoryId, projectId, proj => ({
      ...proj, links: proj.links.map(l => l.id !== linkId ? l : { ...l, title: finalTitle, url: finalUrl })
    }))
    db(supabase.from('links').update({ title: finalTitle, url: finalUrl }).eq('id', linkId))
  }, [updateProject])

  const toggleProjectLinkActivated = useCallback((categoryId, projectId, linkId) => {
    const cat = categoriesRef.current.find(c => c.id === categoryId)
    const proj = cat?.projects.find(p => p.id === projectId)
    const link = proj?.links.find(l => l.id === linkId)
    if (!link) return
    const newActivated = !link.activated
    if (newActivated) fireGalleryPulse(categoryId, linkId)
    updateProject(categoryId, projectId, proj => ({
      ...proj, links: proj.links.map(l => l.id !== linkId ? l : { ...l, activated: newActivated })
    }))
    db(supabase.from('links').update({ activated: newActivated }).eq('id', linkId))
  }, [updateProject])

  // ---- Scheduled activation: set a date (or pass null to clear) ----
  // `recurrence` is optional: omit it to leave the item's repeat setting alone,
  // pass 'never'/'weekly'/'monthly'/'yearly' to set it. Clearing the schedule
  // (dateStr = null) also ends the series.
  const setProjectTodoScheduled = useCallback((categoryId, projectId, todoId, dateStr, recurrence) => {
    const setsRecur = recurrence !== undefined || !dateStr
    const recur = !dateStr ? null : (isRecurring(recurrence) ? recurrence : null)
    const patch = { scheduledDate: dateStr, ...(dateStr ? { activated: false } : {}) }
    if (setsRecur) { patch.recurrence = recur; patch.recurAnchor = recur ? dateStr : null }
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, ...patch })
    }))
    dbw(supabase.from('todos').update({
      scheduled_date: dateStr,
      ...(dateStr ? { activated: false } : {}),
      ...(setsRecur ? { recurrence: recur, recur_anchor: recur ? dateStr : null } : {}),
    }).eq('id', todoId), 'scheduleTodo')
  }, [updateProject])

  const setProjectNoteScheduled = useCallback((categoryId, projectId, noteId, dateStr) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, notes: proj.notes.map(n => n.id !== noteId ? n : { ...n, scheduledDate: dateStr, activated: dateStr ? false : n.activated })
    }))
    dbw(supabase.from('notes').update({ scheduled_date: dateStr, ...(dateStr ? { activated: false } : {}) }).eq('id', noteId), 'scheduleNote')
  }, [updateProject])

  const setProjectLinkScheduled = useCallback((categoryId, projectId, linkId, dateStr) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, links: proj.links.map(l => l.id !== linkId ? l : { ...l, scheduledDate: dateStr, activated: dateStr ? false : l.activated })
    }))
    dbw(supabase.from('links').update({ scheduled_date: dateStr, ...(dateStr ? { activated: false } : {}) }).eq('id', linkId), 'scheduleLink')
  }, [updateProject])

  const deleteProjectTodo = useCallback((categoryId, projectId, todoId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.filter(t => t.id !== todoId)
    }))
    db(supabase.from('todos').delete().eq('id', todoId))
  }, [updateProject])

  const deleteProjectNote = useCallback((categoryId, projectId, noteId) => {
    const sid = String(noteId)
    const proj = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)
    const affected = (proj?.todos || []).filter(t => (t.linkedNoteIds || []).map(String).includes(sid))
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      notes: proj.notes.filter(n => n.id !== noteId),
      todos: proj.todos.map(t => (t.linkedNoteIds || []).map(String).includes(sid)
        ? { ...t, linkedNoteIds: (t.linkedNoteIds || []).filter(id => String(id) !== sid) }
        : t)
    }))
    db(supabase.from('notes').delete().eq('id', noteId))
    affected.forEach(t => {
      const newIds = (t.linkedNoteIds || []).filter(id => String(id) !== sid)
      dbw(supabase.from('todos').update({ linked_note_ids: newIds }).eq('id', t.id), 'deleteNote-detach')
    })
  }, [updateProject])

  const deleteProjectLink = useCallback((categoryId, projectId, linkId) => {
    const sid = String(linkId)
    const proj = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)
    const affected = (proj?.todos || []).filter(t => (t.linkedLinkIds || []).map(String).includes(sid))
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      links: proj.links.filter(l => l.id !== linkId),
      todos: proj.todos.map(t => (t.linkedLinkIds || []).map(String).includes(sid)
        ? { ...t, linkedLinkIds: (t.linkedLinkIds || []).filter(id => String(id) !== sid) }
        : t)
    }))
    db(supabase.from('links').delete().eq('id', linkId))
    affected.forEach(t => {
      const newIds = (t.linkedLinkIds || []).filter(id => String(id) !== sid)
      dbw(supabase.from('todos').update({ linked_link_ids: newIds }).eq('id', t.id), 'deleteLink-detach')
    })
  }, [updateProject])

  const reorderProjectTodos = useCallback((categoryId, projectId, newOrder) => {
    updateProject(categoryId, projectId, proj => ({ ...proj, todos: newOrder }))
    Promise.all(newOrder.map((t, i) => supabase.from('todos').update({ sort_order: i }).eq('id', t.id)))
  }, [updateProject])

  const reorderProjectNotes = useCallback((categoryId, projectId, newOrder) => {
    updateProject(categoryId, projectId, proj => ({ ...proj, notes: newOrder }))
    Promise.all(newOrder.map((n, i) => supabase.from('notes').update({ sort_order: i }).eq('id', n.id)))
  }, [updateProject])

  const reorderProjectLinks = useCallback((categoryId, projectId, newOrder) => {
    updateProject(categoryId, projectId, proj => ({ ...proj, links: newOrder }))
    Promise.all(newOrder.map((l, i) => supabase.from('links').update({ sort_order: i }).eq('id', l.id)))
  }, [updateProject])

  // ---- Cross-project home-screen ordering ----
  // newOrder is the full reordered list of activated items shown in a home card
  // (across every category/project). We stamp each item's home_sort_order by its
  // index so the intermixed order survives reload. Local state is updated in place
  // so the aggregated home cards (sorted by homeSortOrder) re-flow immediately.
  const reorderHomeTodos = useCallback((newOrder) => {
    const orderMap = new Map(newOrder.map((t, i) => [t.id, i]))
    setCategories(prev => prev.map(cat => ({
      ...cat,
      projects: cat.projects.map(proj => ({
        ...proj,
        todos: proj.todos.map(t => orderMap.has(t.id) ? { ...t, homeSortOrder: orderMap.get(t.id) } : t)
      }))
    })))
    Promise.all(newOrder.map((t, i) => supabase.from('todos').update({ home_sort_order: i }).eq('id', t.id)))
  }, [])

  const reorderHomeNotes = useCallback((newOrder) => {
    const orderMap = new Map(newOrder.map((n, i) => [n.id, i]))
    setCategories(prev => prev.map(cat => ({
      ...cat,
      projects: cat.projects.map(proj => ({
        ...proj,
        notes: proj.notes.map(n => orderMap.has(n.id) ? { ...n, homeSortOrder: orderMap.get(n.id) } : n)
      }))
    })))
    Promise.all(newOrder.map((n, i) => supabase.from('notes').update({ home_sort_order: i }).eq('id', n.id)))
  }, [])

  const reorderHomeLinks = useCallback((newOrder) => {
    const orderMap = new Map(newOrder.map((l, i) => [l.id, i]))
    setCategories(prev => prev.map(cat => ({
      ...cat,
      projects: cat.projects.map(proj => ({
        ...proj,
        links: proj.links.map(l => orderMap.has(l.id) ? { ...l, homeSortOrder: orderMap.get(l.id) } : l)
      }))
    })))
    Promise.all(newOrder.map((l, i) => supabase.from('links').update({ home_sort_order: i }).eq('id', l.id)))
  }, [])

  // ---- Collapsed-category ordering (cat_sort_order) ----
  // newOrder is the full reordered aggregate of a category's items (across projects).
  // We stamp each item's cat_sort_order by index so the intermixed order survives reload
  // and a drag can freely mix items from different projects within its activation group.
  const reorderCategoryTodos = useCallback((categoryId, newOrder) => {
    const orderMap = new Map(newOrder.map((t, i) => [String(t.id), i]))
    setCategories(prev => prev.map(cat => cat.id !== categoryId ? cat : {
      ...cat,
      projects: cat.projects.map(proj => ({
        ...proj,
        todos: proj.todos.map(t => orderMap.has(String(t.id)) ? { ...t, catSortOrder: orderMap.get(String(t.id)) } : t)
      }))
    }))
    Promise.all(newOrder.map((t, i) => supabase.from('todos').update({ cat_sort_order: i }).eq('id', t.id)))
  }, [])

  const reorderCategoryNotes = useCallback((categoryId, newOrder) => {
    const orderMap = new Map(newOrder.map((n, i) => [String(n.id), i]))
    setCategories(prev => prev.map(cat => cat.id !== categoryId ? cat : {
      ...cat,
      projects: cat.projects.map(proj => ({
        ...proj,
        notes: proj.notes.map(n => orderMap.has(String(n.id)) ? { ...n, catSortOrder: orderMap.get(String(n.id)) } : n)
      }))
    }))
    Promise.all(newOrder.map((n, i) => supabase.from('notes').update({ cat_sort_order: i }).eq('id', n.id)))
  }, [])

  const reorderCategoryLinks = useCallback((categoryId, newOrder) => {
    const orderMap = new Map(newOrder.map((l, i) => [String(l.id), i]))
    setCategories(prev => prev.map(cat => cat.id !== categoryId ? cat : {
      ...cat,
      projects: cat.projects.map(proj => ({
        ...proj,
        links: proj.links.map(l => orderMap.has(String(l.id)) ? { ...l, catSortOrder: orderMap.get(String(l.id)) } : l)
      }))
    }))
    Promise.all(newOrder.map((l, i) => supabase.from('links').update({ cat_sort_order: i }).eq('id', l.id)))
  }, [])

  const reorderProjects = useCallback((categoryId, newOrder) => {
    setCategories(prev => prev.map(cat =>
      cat.id !== categoryId ? cat : { ...cat, projects: newOrder }
    ))
    Promise.all(newOrder.map((p, i) => supabase.from('projects').update({ sort_order: i }).eq('id', p.id)))
  }, [])

  // ---- Categories ----
  const addCategory = useCallback((name) => {
    const id = `cat-${Date.now()}`
    const sortOrder = categoriesRef.current.length
    setCategories(prev => [...prev, { id, name, sendToHomescreen: true, projects: [] }])
    db(supabase.from('categories').insert({ id, user_id: user.id, name, sort_order: sortOrder }))
    return id
  }, [user])

  const renameCategory = useCallback((id, newName) => {
    setCategories(prev => prev.map(cat => cat.id !== id ? cat : { ...cat, name: newName }))
    db(supabase.from('categories').update({ name: newName }).eq('id', id))
  }, [])

  const toggleCategoryHomescreen = useCallback((id) => {
    const cat = categoriesRef.current.find(c => c.id === id)
    if (!cat) return
    const newVal = !(cat.sendToHomescreen !== false)
    setCategories(prev => prev.map(c => c.id !== id ? c : { ...c, sendToHomescreen: newVal }))
    dbw(supabase.from('categories').update({ send_to_homescreen: newVal }).eq('id', id), 'toggleHomescreen')
  }, [])

  const deleteCategory = useCallback(async (id) => {
    const cat = categoriesRef.current.find(c => c.id === id)
    setCategories(prev => prev.filter(c => c.id !== id))
    if (cat) {
      for (const proj of cat.projects) {
        await supabase.from('todos').delete().eq('project_id', proj.id)
        await supabase.from('notes').delete().eq('project_id', proj.id)
        await supabase.from('links').delete().eq('project_id', proj.id)
        await supabase.from('projects').delete().eq('id', proj.id)
      }
    }
    await supabase.from('categories').delete().eq('id', id)
  }, [])

  // Archiving an easel hides it everywhere except the Settings Tabs card.
  const archiveCategory = useCallback((id) => {
    setCategories(prev => prev.map(c => c.id !== id ? c : { ...c, archived: true }))
    db(supabase.from('categories').update({ archived: true }).eq('id', id))
  }, [])

  const unarchiveCategory = useCallback((id) => {
    setCategories(prev => prev.map(c => c.id !== id ? c : { ...c, archived: false }))
    db(supabase.from('categories').update({ archived: false }).eq('id', id))
  }, [])

  // Resolve a link's own preview image (og:image) via the edge function, once.
  // image_fetched_at is stamped either way so pages without one aren't retried
  // on every load.
  const linkImageInFlight = useRef(new Set())
  const ensureLinkImage = useCallback(async (categoryId, projectId, link) => {
    if (!link || link.imageFetchedAt || linkImageInFlight.current.has(link.id)) return
    linkImageInFlight.current.add(link.id)
    let image = null
    let siteName = null
    let answered = false          // did the function actually respond?
    try {
      const res = await fetch(
        `${functionsUrl}/link-preview?url=${encodeURIComponent(link.url)}`,
        { headers: { apikey: functionsKey } },
      )
      if (res.ok) {
        const data = await res.json()
        answered = true
        if (data && typeof data.image === 'string') image = data.image
        if (data && typeof data.siteName === 'string') siteName = data.siteName
      } else {
        console.warn('[link-preview] HTTP', res.status)
      }
    } catch (err) {
      console.warn('[link-preview] request failed', err)
    }

    // Only mark it checked when we got a real answer. Stamping on failure would
    // permanently write off links looked at before the function was deployed.
    if (!answered) {
      linkImageInFlight.current.delete(link.id)
      return
    }

    const stamp = new Date().toISOString()
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      links: proj.links.map(l => l.id !== link.id ? l : { ...l, imageUrl: image, siteName, imageFetchedAt: stamp }),
    }))
    db(supabase.from('links').update({ image_url: image, site_name: siteName, image_fetched_at: stamp }).eq('id', link.id))
  }, [])

  const reorderCategories = useCallback((newOrder) => {
    setCategories(newOrder)
    Promise.all(newOrder.map((cat, i) => supabase.from('categories').update({ sort_order: i }).eq('id', cat.id)))
  }, [])

  const renameProject = useCallback((categoryId, projectId, newName) => {
    setCategories(prev => prev.map(cat =>
      cat.id !== categoryId ? cat : {
        ...cat,
        projects: cat.projects.map(proj =>
          proj.id !== projectId ? proj : { ...proj, name: newName }
        )
      }
    ))
    db(supabase.from('projects').update({ name: newName }).eq('id', projectId))
  }, [])

  // Move a canvas to another category page. Mirrors renameProject: local state
  // first, then persist the new category_id (and a sort_order at the end of the
  // destination list).
  const moveProject = useCallback((fromCategoryId, projectId, toCategoryId) => {
    if (fromCategoryId === toCategoryId) return
    const from = categoriesRef.current.find(c => c.id === fromCategoryId)
    const proj = from?.projects.find(p => p.id === projectId)
    if (!proj) return
    const sortOrder = categoriesRef.current.find(c => c.id === toCategoryId)?.projects.length || 0
    setCategories(prev => prev.map(cat => {
      if (cat.id === fromCategoryId) return { ...cat, projects: cat.projects.filter(p => p.id !== projectId) }
      if (cat.id === toCategoryId) return { ...cat, projects: [...cat.projects, proj] }
      return cat
    }))
    db(supabase.from('projects').update({ category_id: toCategoryId, sort_order: sortOrder }).eq('id', projectId))
  }, [])

  // Archive a project (canvas): flag it archived and move it to the bottom of the
  // category's project array so it sits beneath the active stack. Read-only is
  // handled in the UI; its items are also hidden from the homescreen/collapsed cards.
  const archiveProject = useCallback((categoryId, projectId) => {
    const cat = categoriesRef.current.find(c => c.id === categoryId)
    if (!cat) return
    const proj = cat.projects.find(p => p.id === projectId)
    if (!proj) return
    const rest = cat.projects.filter(p => p.id !== projectId)
    const newProjects = [...rest, { ...proj, archived: true }]
    setCategories(prev => prev.map(c => c.id !== categoryId ? c : { ...c, projects: newProjects }))
    dbw(supabase.from('projects').update({ archived: true }).eq('id', projectId), 'archiveProject')
    Promise.all(newProjects.map((p, i) => supabase.from('projects').update({ sort_order: i }).eq('id', p.id)))
  }, [])

  // Unarchive: clear the flag and place it at the bottom of the ACTIVE stack
  // (after the last non-archived project, before any archived ones).
  const unarchiveProject = useCallback((categoryId, projectId) => {
    const cat = categoriesRef.current.find(c => c.id === categoryId)
    if (!cat) return
    const proj = cat.projects.find(p => p.id === projectId)
    if (!proj) return
    const rest = cat.projects.filter(p => p.id !== projectId)
    let lastActiveIdx = -1
    rest.forEach((p, i) => { if (!p.archived) lastActiveIdx = i })
    const newProjects = [...rest.slice(0, lastActiveIdx + 1), { ...proj, archived: false }, ...rest.slice(lastActiveIdx + 1)]
    setCategories(prev => prev.map(c => c.id !== categoryId ? c : { ...c, projects: newProjects }))
    dbw(supabase.from('projects').update({ archived: false }).eq('id', projectId), 'unarchiveProject')
    Promise.all(newProjects.map((p, i) => supabase.from('projects').update({ sort_order: i }).eq('id', p.id)))
  }, [])

  const deleteProject = useCallback(async (categoryId, projectId) => {
    setCategories(prev => prev.map(cat =>
      cat.id !== categoryId ? cat : {
        ...cat,
        projects: cat.projects.filter(proj => proj.id !== projectId)
      }
    ))
    await supabase.from('todos').delete().eq('project_id', projectId)
    await supabase.from('notes').delete().eq('project_id', projectId)
    await supabase.from('links').delete().eq('project_id', projectId)
    await supabase.from('projects').delete().eq('id', projectId)
  }, [])

  return (
    <AppContext.Provider value={{
      // Active only — archived easels are hidden from every list in the app.
      categories: categories.filter(c => !c.archived),
      allCategories: categories,
      archivedCategories: categories.filter(c => c.archived),
      archiveCategory,
      unarchiveCategory,
      activeTodos,
      activeNotes,
      loading,
      openDetail,
      setOpenDetail,
      autoEditNoteId,
      setAutoEditNoteId,
      refresh: loadAll,
      addCategory,
      renameCategory,
      deleteCategory,
      reorderCategories,
      toggleCategoryHomescreen,
      addProject,
      addActiveTodo,
      addActiveNote,
      toggleActiveTodo,
      deleteActiveTodo,
      deleteActiveNote,
      updateActiveNote,
      reorderActiveTodos,
      reorderActiveNotes,
      addProjectTodo,
      addProjectNote,
      addProjectLink,
      toggleProjectTodo,
      updateProjectNote,
      updateProjectTodoText,
      updateProjectTodoComment,
      attachNoteToTodo,
      detachNoteFromTodo,
      attachLinkToTodo,
      detachLinkFromTodo,
      addTodoNote,
      addTodoLink,
      reorderTodoNotes,
      reorderTodoLinks,
      ensureLinkImage,
      moveProject,
      moveProjectTodo,
      moveProjectNote,
      moveProjectLink,
      toggleProjectTodoActivated,
      toggleProjectNoteActivated,
      archiveProjectNote,
      unarchiveProjectNote,
      archiveProjectNotes,
      archiveProjectLink,
      unarchiveProjectLink,
      archivePrompt,
      promptArchiveAttachments,
      resolveArchivePrompt,
      deletePrompt,
      promptDelete,
      resolveDeletePrompt,
      moveAttachPrompt,
      promptMoveAttachments,
      resolveMoveAttachPrompt,
      registerComposeHandler,
      requestCompose,
      toggleProjectLinkActivated,
      updateProjectLink,
      setProjectTodoScheduled,
      setProjectNoteScheduled,
      setProjectLinkScheduled,
      deleteProjectTodo,
      deleteProjectNote,
      deleteProjectLink,
      reorderProjectTodos,
      reorderProjectNotes,
      reorderProjectLinks,
      reorderHomeTodos,
      reorderHomeNotes,
      reorderHomeLinks,
      reorderCategoryTodos,
      reorderCategoryNotes,
      reorderCategoryLinks,
      reorderProjects,
      renameProject,
      archiveProject,
      unarchiveProject,
      deleteProject,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
