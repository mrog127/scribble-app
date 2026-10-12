// Which layout the main (cards) column is running.
//
// Phone layout below 1000px — and also on a narrow desktop (1000–1240px) while a
// detail page is open, where the left column of the two-column split runs the
// phone layout (App.jsx marks that with `.split-m` on #app).
export const SPLIT_MOBILE_QUERY = '(min-width: 1000px) and (max-width: 1240px)'

export const isPhoneLayout = () =>
  window.innerWidth < 1000 || !!document.querySelector('#app.split-m')
