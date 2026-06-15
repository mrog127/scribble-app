import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from './AuthContext'

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
      projects: (projs || [])
        .filter(p => p.category_id === cat.id)
        .map(proj => ({
          id: proj.id,
          name: proj.name,
          todos: (todos || []).filter(t => t.project_id === proj.id).map(t => ({
            id: t.id, text: t.text, checked: t.checked, activated: t.activated, scheduledDate: t.scheduled_date,
            linkedNoteIds: normalizeIds(t.linked_note_ids), linkedLinkIds: normalizeIds(t.linked_link_ids)
          })),
          notes: (notes || []).filter(n => n.project_id === proj.id).map(n => ({
            id: n.id, text: n.text, activated: n.activated, scheduledDate: n.scheduled_date, editorHTML: n.editor_html
          })),
          links: (links || []).filter(l => l.project_id === proj.id).map(l => ({
            id: l.id, url: l.url, title: l.title, activated: l.activated, scheduledDate: l.scheduled_date
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
    builtCats.forEach(cat => cat.projects.forEach(proj => {
      proj.todos = proj.todos.map(t => { if (isDue(t.scheduledDate)) { dueTodoIds.push(t.id); return { ...t, activated: true, scheduledDate: null } } return t })
      proj.notes = proj.notes.map(n => { if (isDue(n.scheduledDate)) { dueNoteIds.push(n.id); return { ...n, activated: true, scheduledDate: null } } return n })
      proj.links = proj.links.map(l => { if (isDue(l.scheduledDate)) { dueLinkIds.push(l.id); return { ...l, activated: true, scheduledDate: null } } return l })
    }))
    if (dueTodoIds.length) db(supabase.from('todos').update({ activated: true, scheduled_date: null }).in('id', dueTodoIds))
    if (dueNoteIds.length) db(supabase.from('notes').update({ activated: true, scheduled_date: null }).in('id', dueNoteIds))
    if (dueLinkIds.length) db(supabase.from('links').update({ activated: true, scheduled_date: null }).in('id', dueLinkIds))

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
  const addActiveNote = useCallback((text) => {
    const tempId = Date.now()
    setActiveNotes(prev => [...prev, { id: tempId, text, activated: false, editorHTML: null, source: 'Active', accent: false }])
    supabase.from('notes')
      .insert({ user_id: user.id, project_id: null, text, activated: false, editor_html: null, sort_order: 0 })
      .select().single().then(({ data }) => {
        if (data) setActiveNotes(prev => prev.map(n => n.id === tempId ? { ...n, id: data.id } : n))
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

  const addProjectNote = useCallback((categoryId, projectId, text, activated = false, scheduledDate = null) => {
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
    const newChecked = !todo.checked
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, checked: newChecked })
    }))
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

  const attachNoteToTodo = useCallback((categoryId, projectId, todoId, noteId) => {
    const todo = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.todos.find(t => t.id === todoId)
    if (!todo) return
    const current = todo.linkedNoteIds || []
    if (current.includes(noteId)) return
    const newIds = [...current, noteId]
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedNoteIds: newIds })
    }))
    dbw(supabase.from('todos').update({ linked_note_ids: newIds }).eq('id', todoId), 'attachNote')
  }, [updateProject])

  const detachNoteFromTodo = useCallback((categoryId, projectId, todoId, noteId) => {
    const todo = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.todos.find(t => t.id === todoId)
    if (!todo) return
    const newIds = (todo.linkedNoteIds || []).filter(id => id !== noteId)
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedNoteIds: newIds })
    }))
    dbw(supabase.from('todos').update({ linked_note_ids: newIds }).eq('id', todoId), 'detachNote')
  }, [updateProject])

  const attachLinkToTodo = useCallback((categoryId, projectId, todoId, linkId) => {
    const todo = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.todos.find(t => t.id === todoId)
    if (!todo) return
    const current = todo.linkedLinkIds || []
    if (current.includes(linkId)) return
    const newIds = [...current, linkId]
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedLinkIds: newIds })
    }))
    dbw(supabase.from('todos').update({ linked_link_ids: newIds }).eq('id', todoId), 'attachLink')
  }, [updateProject])

  const detachLinkFromTodo = useCallback((categoryId, projectId, todoId, linkId) => {
    const todo = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.todos.find(t => t.id === todoId)
    if (!todo) return
    const newIds = (todo.linkedLinkIds || []).filter(id => id !== linkId)
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, linkedLinkIds: newIds })
    }))
    dbw(supabase.from('todos').update({ linked_link_ids: newIds }).eq('id', todoId), 'detachLink')
  }, [updateProject])

  // Create a new note in the project AND attach it to the todo
  const addTodoNote = useCallback((categoryId, projectId, todoId, text, activated = false) => {
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
  const moveProjectTodo = useCallback((fromCat, fromProj, toCat, toProj, todoId) => {
    if (fromCat === toCat && fromProj === toProj) return
    const todo = categoriesRef.current.find(c => c.id === fromCat)?.projects.find(p => p.id === fromProj)?.todos.find(t => t.id === todoId)
    if (!todo) return
    const sortOrder = categoriesRef.current.find(c => c.id === toCat)?.projects.find(p => p.id === toProj)?.todos.length || 0
    setCategories(prev => prev.map(cat => {
      let projects = cat.projects
      if (cat.id === fromCat) projects = projects.map(p => p.id === fromProj ? { ...p, todos: p.todos.filter(t => t.id !== todoId) } : p)
      if (cat.id === toCat) projects = projects.map(p => p.id === toProj ? { ...p, todos: [...p.todos, todo] } : p)
      return projects === cat.projects ? cat : { ...cat, projects }
    }))
    db(supabase.from('todos').update({ project_id: toProj, sort_order: sortOrder }).eq('id', todoId))
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

  const toggleProjectTodoActivated = useCallback((categoryId, projectId, todoId) => {
    const cat = categoriesRef.current.find(c => c.id === categoryId)
    const proj = cat?.projects.find(p => p.id === projectId)
    const todo = proj?.todos.find(t => t.id === todoId)
    if (!todo) return
    const newActivated = !todo.activated
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
    updateProject(categoryId, projectId, proj => ({
      ...proj, notes: proj.notes.map(n => n.id !== noteId ? n : { ...n, activated: newActivated })
    }))
    db(supabase.from('notes').update({ activated: newActivated }).eq('id', noteId))
  }, [updateProject])

  const toggleProjectLinkActivated = useCallback((categoryId, projectId, linkId) => {
    const cat = categoriesRef.current.find(c => c.id === categoryId)
    const proj = cat?.projects.find(p => p.id === projectId)
    const link = proj?.links.find(l => l.id === linkId)
    if (!link) return
    const newActivated = !link.activated
    updateProject(categoryId, projectId, proj => ({
      ...proj, links: proj.links.map(l => l.id !== linkId ? l : { ...l, activated: newActivated })
    }))
    db(supabase.from('links').update({ activated: newActivated }).eq('id', linkId))
  }, [updateProject])

  // ---- Scheduled activation: set a date (or pass null to clear) ----
  const setProjectTodoScheduled = useCallback((categoryId, projectId, todoId, dateStr) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.map(t => t.id !== todoId ? t : { ...t, scheduledDate: dateStr, activated: dateStr ? false : t.activated })
    }))
    dbw(supabase.from('todos').update({ scheduled_date: dateStr, ...(dateStr ? { activated: false } : {}) }).eq('id', todoId), 'scheduleTodo')
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
      categories,
      activeTodos,
      activeNotes,
      loading,
      openDetail,
      setOpenDetail,
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
      attachNoteToTodo,
      detachNoteFromTodo,
      attachLinkToTodo,
      detachLinkFromTodo,
      addTodoNote,
      addTodoLink,
      moveProjectTodo,
      moveProjectNote,
      toggleProjectTodoActivated,
      toggleProjectNoteActivated,
      toggleProjectLinkActivated,
      setProjectTodoScheduled,
      setProjectNoteScheduled,
      setProjectLinkScheduled,
      deleteProjectTodo,
      deleteProjectNote,
      deleteProjectLink,
      reorderProjectTodos,
      reorderProjectNotes,
      reorderProjectLinks,
      reorderProjects,
      renameProject,
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
