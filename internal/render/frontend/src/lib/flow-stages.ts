type FlowLink = { from: string; to: string }
export type FlowStage = { rank: number; cyclic: boolean; input: boolean; output: boolean }

export function flowStages(edges: readonly FlowLink[]) {
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const { from, to } of edges) {
    if (!outgoing.has(from)) outgoing.set(from, [])
    if (!outgoing.has(to)) outgoing.set(to, [])
    if (!incoming.has(to)) incoming.set(to, [])
    outgoing.get(from)!.push(to)
    incoming.get(to)!.push(from)
  }

  const finished: string[] = []
  const visited = new Set<string>()
  for (const root of outgoing.keys()) {
    if (visited.has(root)) continue
    const pending: { id: string; finish?: true }[] = [{ id: root }]
    while (pending.length) {
      const { id, finish } = pending.pop()!
      if (finish) {
        finished.push(id)
      } else if (!visited.has(id)) {
        visited.add(id)
        pending.push({ id, finish: true })
        for (const next of outgoing.get(id)!) pending.push({ id: next })
      }
    }
  }

  // Walking the transposed graph in reverse finish order finds components in topological order.
  const componentById = new Map<string, { ids: string[]; rank: number }>()
  const components: { ids: string[]; rank: number }[] = []
  for (const root of finished.reverse()) {
    if (componentById.has(root)) continue
    const component = { ids: [root], rank: 0 }
    components.push(component)
    componentById.set(root, component)
    for (const id of component.ids) {
      for (const parent of incoming.get(id) ?? []) {
        if (componentById.has(parent)) continue
        componentById.set(parent, component)
        component.ids.push(parent)
      }
    }
  }

  const stages = new Map<string, FlowStage>()
  for (const component of components) {
    for (const id of component.ids) {
      const next = outgoing.get(id)!
      stages.set(id, {
        rank: component.rank,
        cyclic: component.ids.length > 1 || next.includes(id),
        input: incoming.has(id),
        output: next.length > 0,
      })
      for (const to of next) {
        const target = componentById.get(to)!
        if (target !== component) target.rank = Math.max(target.rank, component.rank + 1)
      }
    }
  }
  return stages
}
