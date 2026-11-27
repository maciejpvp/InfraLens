(() => {
  const storageKey = 'laytrace-theme'
  const root = document.documentElement
  function readLightMode() {
    try {
      return localStorage.getItem(storageKey) === 'light'
    } catch {
      // The site remains usable when storage is blocked.
    }
  }

  let light = readLightMode() ?? false
  root.classList.toggle('dark', !light)

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('theme-toggle')
    const images = [...document.querySelectorAll('[data-light-src]')].map(image => ({
      image, darkSrc: image.getAttribute('src'), lightSrc: image.dataset.lightSrc,
    }))

    function applyTheme() {
      root.classList.toggle('dark', !light)
      toggle.setAttribute('aria-pressed', String(light))
      for (const { image, darkSrc, lightSrc } of images) {
        image.setAttribute('src', light ? lightSrc : darkSrc)
      }
    }

    applyTheme()
    toggle.hidden = false
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return
      light = readLightMode() ?? light
      applyTheme()
    })
    toggle.addEventListener('click', () => {
      light = !light
      applyTheme()
      try {
        localStorage.setItem(storageKey, light ? 'light' : 'dark')
      } catch {
        // The new theme still applies on this page.
      }
    })
  })
})()
