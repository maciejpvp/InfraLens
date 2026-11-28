export function connectTabs(tablist: HTMLElement) {
  const entries = Array.from(tablist.querySelectorAll<HTMLElement>('[data-tab]')).flatMap(tab => {
    const panel = document.getElementById(tab.dataset.tab ?? '')
    return panel ? [{ tab, panel }] : []
  })

  function select(index: number) {
    entries.forEach(({ tab, panel }, i) => {
      const active = i === index
      tab.tabIndex = active ? 0 : -1
      tab.setAttribute('aria-selected', String(active))
      panel.toggleAttribute('data-active', active)
      panel.inert = !active
    })
  }

  tablist.setAttribute('role', 'tablist')
  entries.forEach(({ tab, panel }, index) => {
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', panel.id)
    panel.classList.add('tab-panel')
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', tab.id)
    tab.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      select(index)
    })
    tab.addEventListener('keydown', event => {
      let next = index
      switch (event.key) {
        case 'ArrowRight':
          next = (index + 1) % entries.length
          break
        case 'ArrowLeft':
          next = (index + entries.length - 1) % entries.length
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = entries.length - 1
          break
        case ' ':
          break
        default:
          return
      }
      event.preventDefault()
      select(next)
      entries[next].tab.focus()
    })
  })
  select(0)
  tablist.hidden = false

  return (id: string) => {
    const index = entries.findIndex(({ panel }) => panel.id === id)
    if (index < 0) return false
    select(index)
    entries[index].tab.focus()
    return true
  }
}
