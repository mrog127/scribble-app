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

export function AppProvider({ children }) {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [activeTodos, setActiveTodos] = useState([])
  const [activeNotes, setActiveNotes] = useState([])
  const [loading, setLoading] = useState(true)

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
      projects: (projs || [])
        .filter(p => p.category_id === cat.id)
        .map(proj => ({
          id: proj.id,
          name: proj.name,
          todos: (todos || []).filter(t => t.project_id === proj.id).map(t => ({
            id: t.id, text: t.text, checked: t.checked, activated: t.activated
          })),
          notes: (notes || []).filter(n => n.project_id === proj.id).map(n => ({
            id: n.id, text: n.text, activated: n.activated, editorHTML: n.editor_html
          })),
          links: (links || []).filter(l => l.project_id === proj.id).map(l => ({
            id: l.id, url: l.url, title: l.title, activated: l.activated
          })),
        }))
    }))

    setCategories(builtCats)
    setActiveTodos((aTodos || []).map(t => ({ id: t.id, text: t.text, checked: t.checked, activated: t.activated, source: 'Active' })))
    setActiveNotes((aNotes || []).map(n => ({ id: n.id, text: n.text, activated: n.activated, editorHTML: n.editor_html, source: 'Active', accent: false })))
    setLoading(false)
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
  const addProjectTodo = useCallback((categoryId, projectId, text, activated = false) => {
    const tempId = Date.now()
    const proj = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)
    const sortOrder = proj?.todos.length || 0
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      todos: [...proj.todos, { id: tempId, text, checked: false, activated }]
    }))
    supabase.from('todos')
      .insert({ user_id: user.id, project_id: projectId, text, checked: false, activated, sort_order: sortOrder })
      .select().single().then(({ data }) => {
        if (data) updateProject(categoryId, projectId, proj => ({
          ...proj,
          todos: proj.todos.map(t => t.id === tempId ? { ...t, id: data.id } : t)
        }))
      })
    return tempId
  }, [user, updateProject])

  const addProjectNote = useCallback((categoryId, projectId, text, activated = false) => {
    const tempId = Date.now()
    const proj = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)
    const sortOrder = proj?.notes.length || 0
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      notes: [...proj.notes, { id: tempId, text, activated, editorHTML: null }]
    }))
    supabase.from('notes')
      .insert({ user_id: user.id, project_id: projectId, text, activated, editor_html: null, sort_order: sortOrder })
      .select().single().then(({ data }) => {
        if (data) updateProject(categoryId, projectId, proj => ({
          ...proj,
          notes: proj.notes.map(n => n.id === tempId ? { ...n, id: data.id } : n)
        }))
      })
    return tempId
  }, [user, updateProject])

  const addProjectLink = useCallback((categoryId, projectId, url, activated = false) => {
    const tempId = Date.now()
    const proj = categoriesRef.current.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)
    const sortOrder = proj?.links.length || 0
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      links: [...proj.links, { id: tempId, url, title: url, activated }]
    }))
    supabase.from('links')
      .insert({ user_id: user.id, project_id: projectId, url, title: url, activated, sort_order: sortOrder })
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

  const deleteProjectTodo = useCallback((categoryId, projectId, todoId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, todos: proj.todos.filter(t => t.id !== todoId)
    }))
    db(supabase.from('todos').delete().eq('id', todoId))
  }, [updateProject])

  const deleteProjectNote = useCallback((categoryId, projectId, noteId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, notes: proj.notes.filter(n => n.id !== noteId)
    }))
    db(supabase.from('notes').delete().eq('id', noteId))
  }, [updateProject])

  const deleteProjectLink = useCallback((categoryId, projectId, linkId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj, links: proj.links.filter(l => l.id !== linkId)
    }))
    db(supabase.from('links').delete().eq('id', linkId))
  }, [updateProject])

  const reorderProjectTodos = useCallback((categoryId, projectId, newOrder) => {
    updateProject(categoryId, projectId, proj => ({ ...proj, todos: newOrder }))
    Promise.all(newOrder.map((t, i) => supabase.from('todos').update({ sort_order: i }).eq('id', t.id)))
  }, [updateProject])

  const reorderProjectNotes = useCallback((categoryId, projectId, newOrder) => {
    updateProject(categoryId, projectId, proj => ({ ...proj, notes: newOrder }))
    Promise.all(newOrder.map((n, i) => supabase.from('notes').update({ sort_order: i }).eq('id', n.id)))
  }, [updateProject])

  // ---- Categories ----
  const addCategory = useCallback((name) => {
    const id = `cat-${Date.now()}`
    const sortOrder = categoriesRef.current.length
    setCategories(prev => [...prev, { id, name, projects: [] }])
    db(supabase.from('categories').insert({ id, user_id: user.id, name, sort_order: sortOrder }))
    return id
  }, [user])

  const renameCategory = useCallback((id, newName) => {
    setCategories(prev => prev.map(cat => cat.id !== id ? cat : { ...cat, name: newName }))
    db(supabase.from('categories').update({ name: newName }).eq('id', id))
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
      addCategory,
      renameCategory,
      deleteCategory,
      reorderCategories,
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
      toggleProjectTodoActivated,
      toggleProjectNoteActivated,
      deleteProjectTodo,
      deleteProjectNote,
      deleteProjectLink,
      reorderProjectTodos,
      reorderProjectNotes,
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
