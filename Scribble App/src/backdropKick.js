// The control bar's glass (backdrop-filter) can go stale after a menu that dims
// the page closes — it shows unblurred until something repaints it (a scroll,
// a hover). Once the closing fade has finished, drop the blur for two frames and
// put it back, which makes the browser rebuild it.
let timer = 0
export function kickBackdrops(delay = 240) {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const app = document.getElementById('app')
    if (!app) return
    app.classList.add('bd-kick')
    requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove('bd-kick')))
  }, delay)
}
