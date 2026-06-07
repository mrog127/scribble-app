import { createContext, useContext, useState, useCallback } from 'react'

export const AppContext = createContext(null)

let nextItemId = 1000

const initialCategories = [
  {
    id: 'personal',
    name: 'Personal',
    projects: [
      {
        id: 'proj-scheduling',
        name: 'Scheduling',
        todos: [],
        notes: [],
        links: []
      }
    ]
  },
  {
    id: 'planning',
    name: 'Planning',
    projects: []
  }
]

export function AppProvider({ children }) {
  const [categories, setCategories] = useState(initialCategories)

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

  // ---- Add project ----
  const addProject = useCallback((categoryId, name) => {
    const id = `proj-${Date.now()}`
    setCategories(prev => prev.map(cat =>
      cat.id !== categoryId ? cat : {
        ...cat,
        projects: [...cat.projects, { id, name, todos: [], notes: [], links: [] }]
      }
    ))
    return id
  }, [])

  // ---- Add items ----
  const addProjectTodo = useCallback((categoryId, projectId, text, activated = false) => {
    const id = nextItemId++
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      todos: [...proj.todos, { id, text, checked: false, activated }]
    }))
    return id
  }, [updateProject])

  const addProjectNote = useCallback((categoryId, projectId, text, activated = false) => {
    const id = nextItemId++
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      notes: [...proj.notes, { id, text, activated, editorHTML: null }]
    }))
    return id
  }, [updateProject])

  const addProjectLink = useCallback((categoryId, projectId, url, activated = false) => {
    const id = nextItemId++
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      links: [...proj.links, { id, url, title: url, activated }]
    }))
    return id
  }, [updateProject])

  // ---- Toggle / update ----
  const toggleProjectTodo = useCallback((categoryId, projectId, todoId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      todos: proj.todos.map(t =>
        t.id !== todoId ? t : { ...t, checked: !t.checked }
      )
    }))
  }, [updateProject])

  const updateProjectNote = useCallback((categoryId, projectId, noteId, editorHTML, text) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      notes: proj.notes.map(n =>
        n.id !== noteId ? n : { ...n, editorHTML, text: text || n.text }
      )
    }))
  }, [updateProject])

  // ---- Activate / deactivate ----
  const toggleProjectTodoActivated = useCallback((categoryId, projectId, todoId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      todos: proj.todos.map(t =>
        t.id !== todoId ? t : { ...t, activated: !t.activated }
      )
    }))
  }, [updateProject])

  const toggleProjectNoteActivated = useCallback((categoryId, projectId, noteId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      notes: proj.notes.map(n =>
        n.id !== noteId ? n : { ...n, activated: !n.activated }
      )
    }))
  }, [updateProject])

  // ---- Delete ----
  const deleteProjectTodo = useCallback((categoryId, projectId, todoId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      todos: proj.todos.filter(t => t.id !== todoId)
    }))
  }, [updateProject])

  const deleteProjectNote = useCallback((categoryId, projectId, noteId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      notes: proj.notes.filter(n => n.id !== noteId)
    }))
  }, [updateProject])

  const deleteProjectLink = useCallback((categoryId, projectId, linkId) => {
    updateProject(categoryId, projectId, proj => ({
      ...proj,
      links: proj.links.filter(l => l.id !== linkId)
    }))
  }, [updateProject])

  // ---- Reorder ----
  const reorderProjectTodos = useCallback((categoryId, projectId, newOrder) => {
    updateProject(categoryId, projectId, proj => ({ ...proj, todos: newOrder }))
  }, [updateProject])

  const reorderProjectNotes = useCallback((categoryId, projectId, newOrder) => {
    updateProject(categoryId, projectId, proj => ({ ...proj, notes: newOrder }))
  }, [updateProject])

  return (
    <AppContext.Provider value={{
      categories,
      addProject,
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
