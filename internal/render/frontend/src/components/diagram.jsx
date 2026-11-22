import { useLayoutEffect, useRef, useState } from 'react'
import { CARD, edgeCaption, flowDescriptions, serviceFor } from '../../../layout.mjs'
import { placeEdgeLabel } from '../../../routing.mjs'
import { changeLabels, changeSummary, countLabel, relationNames } from '../lib/graph-view'

const wireColors = { triggers: '#51cfc1', connects_to: '#ad98e6', depends_on: '#7f91a8' }
const wireDash = { connects_to: '5 5', depends_on: '4 6' }
const changeStyles = {
  create: 'fill-[#18352b] stroke-[#63b98d]',
  delete: 'fill-[#3b2229] stroke-[#d67e89]',
  update: 'fill-[#3b3220] stroke-[#c9a65d]',
  replace: 'fill-[#3b3220] stroke-[#a98b57]',
}

function activation(action) {
  return {
    onClick: action,
    onKeyDown: event => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      action(event)
    },
  }
}

function FittedText({ children, width, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const text = ref.current
    text.textContent = children
    if (text.getComputedTextLength() <= width) return
    const value = Array.from(children)
    let low = 0, high = value.length
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      text.textContent = value.slice(0, mid).join('') + '…'
      if (text.getComputedTextLength() <= width) low = mid
      else high = mid - 1
    }
    text.textContent = value.slice(0, low).join('') + '…'
  }, [children, width])
  return <text {...props} ref={ref} />
}

function ServiceIcon({ service, icons, x, y }) {
  const icon = Object.hasOwn(icons, service?.icon) && icons[service.icon]
  return icon
    ? <image className="service-icon" x={x} y={y} width="24" height="24" href={icon} aria-hidden="true" />
    : <text x={x + 1} y={y + 17} className="fill-foreground text-[11px] font-semibold" aria-hidden="true">◇</text>
}

function GroupToggle({ item, x, y, toggle }) {
  return <g transform={`translate(${x},${y})`} tabIndex={0} role="button" data-toggle={item.id}
    aria-label={`${item.expanded ? 'Collapse' : 'Expand'} ${item.name}`} aria-expanded={item.expanded}
    className="group/toggle outline-none" {...activation(event => { event.stopPropagation(); toggle(item.id) })}>
    <rect width="30" height="30" rx="7" className="fill-accent stroke-input group-hover/toggle:fill-[#456070] group-focus-visible/toggle:stroke-ring" />
    <text x="15" y="21" textAnchor="middle" className="fill-foreground text-lg font-medium">{item.expanded ? '−' : '+'}</text>
  </g>
}

function DiagramItem({ item, position, byId, icons, selected, muted, onItem, toggle }) {
  const p = position
  const service = item.service || (item.node && serviceFor(item.node.type))
  const change = item.node?.change
  const className = `group cursor-pointer outline-none motion-safe:transition-opacity ${item.expanded ? 'group-header' : 'node'} ${item.support ? 'support' : ''} ${selected ? 'selected' : ''} ${muted ? 'muted opacity-40' : ''}`
  return <g transform={`translate(${p.x},${p.y})`} data-item={item.id}
    data-group={item.group ? item.id : undefined} data-service={item.service?.id}
    data-node={!item.group ? item.id : undefined} data-change={change ?? ''}
    tabIndex={0} role="button" aria-haspopup="dialog" aria-label={`${item.name}, ${item.group ? countLabel(item.members.size, 'resource') : item.node.type}`}
    className={className} {...activation(event => onItem(item.id, event.currentTarget))}>
    {item.expanded ? <>
      <rect className={`header-bg group-hover:fill-accent/70 group-focus-visible:fill-accent ${selected ? 'fill-accent' : 'fill-transparent'}`} width={p.width} height="44" rx="10" />
      <FittedText className="fill-foreground text-sm font-semibold" x={service ? 48 : 16} y="27" width={p.width - (service ? 182 : 150)}>{item.name}</FittedText>
      <text className="fill-muted-foreground text-xs" x={p.width - 54} y="27" textAnchor="end">{countLabel(item.members.size, 'resource')}</text>
      {service && <ServiceIcon service={service} icons={icons} x={16} y={10} />}
      <GroupToggle item={item} x={p.width - 42} y={7} toggle={toggle} />
    </> : <>
      <rect className={`body group-hover:stroke-ring group-focus-visible:stroke-ring ${changeStyles[change] || 'fill-card stroke-input'} ${item.support ? '[stroke-dasharray:4_3]' : ''} ${selected ? 'stroke-ring [stroke-width:2px]' : '[stroke-width:1.2px]'}`} width={CARD.width} height={CARD.height} rx="10" />
      <rect x="0" y="17" width="3" height="28" rx="1" fill={service?.color || '#8ba6be'} />
      <ServiceIcon service={service} icons={icons} x={15} y={10} />
      <FittedText className="node-type fill-muted-foreground text-[11px]" x="47" y="25" width={item.group ? 145 : 112}>
        {item.service ? 'SERVICE' : item.group ? 'GROUP' : (service?.icon ? service.name + ' · ' : '') + item.node.type.split(':').at(-1)}
      </FittedText>
      {item.group ? <GroupToggle item={item} x={CARD.width - 41} y={8} toggle={toggle} /> : change && change !== 'unchanged' && (
        <text className={`text-[11px] ${change === 'delete' ? 'fill-destructive' : change === 'create' ? 'fill-emerald-300' : 'fill-amber-200'}`} x={CARD.width - 12} y="25" textAnchor="end">{changeLabels[change]}</text>
      )}
      <FittedText className="node-name fill-foreground text-sm font-medium" x="15" y="54" width={CARD.width - 30}>{item.name}</FittedText>
      <FittedText className="node-meta fill-muted-foreground text-xs" x="15" y="78" width={CARD.width - 30}>
        {item.group ? `${countLabel(item.members.size, 'resource')} · ${changeSummary(item, byId)}` : item.stack}
      </FittedText>
    </>}
  </g>
}

function useEdgeLabels(scene, measure) {
  const [labels, setLabels] = useState(new Map())
  useLayoutEffect(() => {
    const { current, layout, routes } = scene
    const obstacles = [...layout.positions].map(([id, p]) => ({ ...p, height: current.items.get(id).expanded ? 44 : p.height }))
    const next = new Map()
    for (const text of measure.current.children) {
      const index = Number(text.dataset.caption)
      const measured = text.getBBox()
      const position = placeEdgeLabel(routes[index].points, measured.width + 8, measured.height + 8, obstacles)
      if (!position) continue
      obstacles.push(position)
      next.set(index, { x: position.x + 4 - measured.x, y: position.y + 4 - measured.y })
    }
    setLabels(next)
  }, [scene, measure])
  return labels
}

export function Diagram({ svg, scene, byId, icons, selection, onItem, onEdges, toggle }) {
  const { current, layout, routes } = scene
  const items = [...current.items.values()]
  const measure = useRef(null)
  const wireGroup = useRef(null)
  const labels = useEdgeLabels(scene, measure)
  const visible = new Set(selection?.ids.map(id => current.representatives.get(id) || id))

  function openEdge(event, index) {
    let matches = [current.edges[index]]
    if (event.clientX || event.clientY) {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.current.getScreenCTM().inverse())
      const hits = [...wireGroup.current.children].filter(group => group.querySelector('.hit').isPointInStroke(point))
      if (hits.length) matches = hits.map(group => current.edges[Number(group.dataset.edge)])
    }
    onEdges([...new Set(matches.flatMap(edge => edge.originals))], event.currentTarget)
  }

  return <svg id="diagram" ref={svg} role="group" aria-label="Stacks, components and connections" className="block size-full select-none">
    <defs>
      <path id="arrow-shape" d="M0 4 H6 V1 L14 5 L6 9 V6 H0 Z" />
      {Object.entries(wireColors).map(([kind, color]) => (
        <marker key={kind} id={`arrow-${kind}`} viewBox="0 0 14 10" refX="14" refY="5" markerWidth="14" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
          <use href="#arrow-shape" fill={color} />
        </marker>
      ))}
    </defs>
    <g id="groups">{items.filter(item => item.expanded).map(item => {
      const { x, y, width, height, depth } = layout.positions.get(item.id)
      return <rect key={item.id} x={x} y={y} width={width} height={height} rx="12" className="pointer-events-none fill-card/65 stroke-input" strokeDasharray={depth ? '5 5' : undefined} />
    })}</g>
    <g aria-hidden="true" visibility="hidden" ref={measure}>
      {current.edges.map((edge, i) => routes[i] && edgeCaption(edge) && <text className="text-xs" textAnchor="middle" key={i} data-caption={i}>{edgeCaption(edge)}</text>)}
    </g>
    <g id="edges" ref={wireGroup}>
      {current.edges.map((edge, index) => {
        if (!routes[index]) return null
        const { d } = routes[index]
        const selected = edge.originals.some(original => selection?.edges.includes(original))
        const muted = selection && (!visible.has(edge.from) || !visible.has(edge.to))
        const title = `${current.items.get(edge.from).name} → ${current.items.get(edge.to).name}`
        return <g key={JSON.stringify([edge.from, edge.kind, edge.to, edge.state])} className={`edge group cursor-pointer outline-none motion-safe:transition-opacity ${edge.kind} ${selected ? 'selected' : ''} ${muted ? 'muted opacity-15' : ''}`}
          data-edge={index} data-from={edge.from} data-to={edge.to} data-count={edge.originals.length}
          tabIndex={0} role="button" aria-haspopup="dialog"
          aria-label={`${title}, ${relationNames[edge.kind]}, ${flowDescriptions([edge]).map(d => d.label).join(', ')}, ${countLabel(edge.originals.length, 'connection')}`}
          {...activation(event => openEdge(event, index))}>
          <path className="hit fill-none stroke-transparent" strokeWidth="18" d={d} />
          <path className={`wire fill-none group-hover:[stroke-width:3px] group-focus-visible:[stroke-width:3px] ${selected ? '[stroke-width:3px]' : ''}`}
            stroke={wireColors[edge.kind]} strokeWidth={edge.kind === 'depends_on' ? 1.1 : 1.8} strokeDasharray={wireDash[edge.kind]}
            strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#arrow-${edge.kind})`} d={d} />
          {labels.has(index) && <text className="edge-label pointer-events-none fill-foreground stroke-background text-xs [paint-order:stroke] [stroke-linejoin:round] [stroke-width:5px]"
            textAnchor="middle" {...labels.get(index)}>{edgeCaption(edge)}</text>}
        </g>
      })}
    </g>
    <g id="nodes">{items.map(item => <DiagramItem key={item.id} item={item} position={layout.positions.get(item.id)} byId={byId} icons={icons}
      selected={visible.has(item.id)} muted={Boolean(selection && !visible.has(item.id))} onItem={onItem} toggle={toggle} />)}</g>
  </svg>
}
