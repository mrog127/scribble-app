# Scribble — Project Spec for Claude

## What this is
A mobile To Do List app called Scribble. Built in Vite + React, deployed via GitHub → Netlify.

**Local project folder:** `~/NewDocuments/Personal/Projects/Scribble/Code`  
**Dev command:** `npm run dev`  
**Deploy:** `git add . && git commit -m "description" && git push` → Netlify auto-deploys

---

## File Structure

```
Code/
  src/
    components/
      TodoCard.jsx
      NoteCard.jsx
      TabBar.jsx
      ActivePage.jsx
    styles/
      cards.css
      layout.css
    App.jsx
    main.jsx
  index.html
  package.json
  vite.config.js
  CLAUDE.md
```

---

## Design Spec — Do Not Change Unless Explicitly Asked

- **Frame:** 402×874px phone frame
- **Background:** `#F2F0EB` / `#EBE8E1`
- **Blue accent:** `#6993FE` — **Dark blue:** `#3F5999`
- **Display font:** Baskerville Bold/SemiBold — page title 32px, card titles 24px
- **Body font:** Open Sans SemiBold 600 — items 16px, labels 14px
- **Cards:** 8pt corner radius, drop shadow Y=4 blur=20 black 10% opacity, background `#F7F6F3`, border `#C2C1BF`
- **Dividers:** 1px `#DBDAD8`, inset 16px
- **Header:** sticky, cards scroll beneath
- **Underline.svg:** blue squiggly (`#6993FE`), sits 8pt below the "Active" page title
- **Decoration.svg:** large organic blue shape, 10% opacity, top-right, z-index above background but below all content

---

## Interactive Features — Full Intended Behavior

### Checkbox
- Tapping checkbox toggles checked state
- Check: bounce-in animation (scale squish → overshoot → settle), fills blue `#6993FE`, checkmark fades in
- Uncheck: bounce-out animation before clearing
- Checked items get strikethrough, opacity 50%, and move below unchecked items

### Swipe gestures (todo and note rows)
- Swipe left → reveals Delete button (right side, red `#B24A4A`, trash icon + "Delete" label)
- Swipe right → reveals Active Tag button (left side, dark blue `#3F5999`, star icon + "Active" label)
- Threshold: 36px to snap open, 72px max travel
- Buttons appear behind the swipe-content layer

### Drag to reorder
- Long-press or drag a row to reorder within a card
- Uses FLIP animation — snapshot `swipe-row` wrappers (not inner `todo-row` elements)
- Preserve checked items not in DOM when hideCompleted is true

### Hide Completed
- Button appears below the list when ≥1 item is checked
- Animates in with opacity + max-height transition
- Label: "Hide Completed" / "Show N Completed"

### Note detail page
- Tapping a note row slides up a full-screen editor (translateY 100%→0, 350ms)
- Header: notes icon + Done/Save button
- Editor: contenteditable div, caret color `#6993FE`
- Style toolbar: fixed 56px bar, 36px from bottom, 12px side insets, background `#F7F6F3`, border `#DBDAD8`, shadow Y=4 blur=12 black 25%
- Toolbar buttons (in order): Title, Heading, Bold, Body, Italic, Bullet — sliding blue indicator
- Toolbar visible only in edit mode; animates in with opacity + translateY 16px, 100ms
- Enter key creates new paragraph of same style; empty bullet Enter reverts to Body

### Footer input
- Typing shows a send button
- Focusing slides the tab bar down and fades in an input toolbar (Active source label + list/note/link type selector)
- Enter or send button appends item to the correct card

### Tab bar
- Tabs: Active (star icon), Personal, Family, Projects, Trips, Finances
- Active tab highlighted in blue `#6993FE`
- Switching tabs changes the page content

### Add item
- New todo appended to Lists card
- New note appended to Notes card
- Clone animation: item flies from footer to landing position (scroll first 250ms, pause 100ms, then animate)
- Cards animate in (opacity + translateY 16px→0, 200ms) when first item added to a new card

---

## Key Architecture Notes

- **Animation portal:** `#animation-portal` div, `position: absolute; inset: 0; pointer-events: none; z-index: 99999` — clone animations render here to avoid appearing behind list items
- **FLIP drag reorder:** must snapshot `.swipe-row` wrappers, not `.todo-row` inner elements
- **Stale function risk:** when refactoring functions, fully replace old versions — don't shadow them. Old versions referencing removed DOM elements will silently override new ones.
- **hideCompleted:** checked items are removed from DOM when true — preserve them in state so they survive toggle

---

## Communication Style

- Only change exactly what is specified — nothing else
- Do not explain design changes unless explicitly asked
- Fix one feature at a time
- Ask for the relevant file before making changes
- When a fix doesn't work, the next attempt must reflect a meaningfully different approach — not a minor variation
