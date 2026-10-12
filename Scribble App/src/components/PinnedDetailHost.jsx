// Detail pages App renders itself rather than leaving to a card.
//
// Pages normally live in whichever card shows their row, so they close when
// that card goes away (switching easels). Two pages have to outlast that, so
// App renders them here instead, looked up from the data like the cards do:
//   • the pinned (locked) page — desktop's right-hand panel. It mounts already
//     open (it was on screen a moment ago, in the card's copy);
//   • a page opened beside it (openDetail.central) — so switching easels
//     doesn't close it; only its Done, or opening another page, does.
import { createPortal } from 'react-dom'
import { useAppContext } from '../context/AppContext.jsx'
import { DetailSlotContext } from '../detailLock.jsx'
import { NoteDetailPage } from './NoteCard.jsx'
import TodoDetailPage from './TodoDetailPage.jsx'
import LinkDetailPage from './LinkDetailPage.jsx'

const KEY = { todo: 'todos', note: 'notes', link: 'links' }

export default function PinnedDetailHost() {
  const { pinnedDetail, unpinDetail } = useAppContext()
  return <DetailHost detail={pinnedDetail} slot="pinned" instantOpen onClose={unpinDetail} />
}

export function CentralMainDetailHost() {
  const { openDetail, setOpenDetail } = useAppContext()
  return <DetailHost detail={openDetail?.central ? openDetail : null} slot="main" onClose={() => setOpenDetail(null)} />
}

function DetailHost({ detail, slot, instantOpen = false, onClose }) {
  const {
    allCategories, inbox, inboxIds, activeNotes,
    updateProjectNote, toggleProjectNoteActivated, setProjectNoteScheduled, updateActiveNote,
  } = useAppContext()
  const app = typeof document !== 'undefined' ? document.getElementById('app') : null
  if (!detail || !app) return null
  const { type, id } = detail
  const k = `${slot}:${type}:${id}`
  const unpinDetail = onClose

  let page = null
  if (type === 'local-note') {
    const n = activeNotes.find(x => String(x.id) === String(id))
    if (n) page = <NoteDetailPage key={k} instantOpen={instantOpen} note={n} onClose={unpinDetail} onSave={updateActiveNote} />
  } else {
    const cats = [...(allCategories || [])]
    if (inbox && inboxIds) cats.push({ id: inboxIds.categoryId, projects: [inbox], inbox: true })
    let item = null, cat = null, proj = null
    outer:
    for (const c of cats) for (const p of c.projects) {
      const x = (p[KEY[type]] || []).find(x => String(x.id) === String(id))
      if (x) { item = x; cat = c; proj = p; break outer }
    }
    if (item && type === 'todo') {
      page = (
        <TodoDetailPage key={k} instantOpen={instantOpen} todo={item} categoryId={cat.id} projectId={proj.id}
          projectNotes={cat.inbox ? [] : (proj.notes || [])} projectLinks={cat.inbox ? [] : (proj.links || [])}
          onClose={unpinDetail} archived={!!proj.archived} />
      )
    } else if (item && type === 'note') {
      const projectName = cat.inbox ? 'Inbox' : proj.name
      page = (
        <NoteDetailPage key={k} instantOpen={instantOpen}
          note={{ ...item, categoryId: cat.id, projectId: proj.id, projectName }}
          onClose={unpinDetail}
          onSave={(noteId, html, text) => updateProjectNote(cat.id, proj.id, noteId, html, text)}
          activated={!!item.activated}
          onToggleActive={() => toggleProjectNoteActivated(cat.id, proj.id, item.id)}
          onSchedule={(date) => setProjectNoteScheduled(cat.id, proj.id, item.id, date)}
          onClearSchedule={() => setProjectNoteScheduled(cat.id, proj.id, item.id, null)}
          projectName={projectName} categoryId={cat.id} projectId={proj.id}
          archived={!!(item.archived || proj.archived)} />
      )
    } else if (item && type === 'link') {
      page = <LinkDetailPage key={k} instantOpen={instantOpen} link={item} categoryId={cat.id} projectId={proj.id} onClose={unpinDetail} />
    }
  }
  if (!page) return null
  return createPortal(<DetailSlotContext.Provider value={slot}>{page}</DetailSlotContext.Provider>, app)
}
