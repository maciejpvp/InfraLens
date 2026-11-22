import { ArrowLeft, X } from 'lucide-react'
import { Fragment } from 'react'
import { flowDescriptions } from '../../../layout.mjs'
import { changeLabels, changeSummary, countLabel, groupRelations } from '../lib/graph-view'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion'
import { Button } from './ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from './ui/dialog'

const notes = {
  triggers: 'Configured event or invocation route.',
  connects_to: 'Source configuration references the target. The reference does not specify read or write direction.',
  depends_on: 'The source depends on the target during deployment. A dependency does not imply data flow.',
  contains: 'Parent and child relationship in the Pulumi hierarchy.',
}

const topologyName = state => state === 'before' ? 'Before changes' : 'After changes'
const edgeTitle = (edge, byId) => `${byId.get(edge.from).name} → ${byId.get(edge.to).name}`

function Metadata({ rows }) {
  return <dl className="mb-4 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
    {rows.map(([label, value]) => <Fragment key={label}>
      <dt className="text-muted-foreground">{label}</dt><dd>{value}</dd>
    </Fragment>)}
  </dl>
}

function DetailSection({ value, title, children }) {
  return <AccordionItem value={value} className="rounded-lg border bg-muted last:border-b">
    <AccordionTrigger className="min-h-11 px-3 py-2.5 hover:bg-accent hover:no-underline data-[state=open]:rounded-b-none">{title}</AccordionTrigger>
    <AccordionContent className="border-t px-3 py-3">{children}</AccordionContent>
  </AccordionItem>
}

function DetailRow({ children, onClick }) {
  return <Button variant="outline" onClick={onClick}
    className="connection-item block h-auto min-h-11 w-full border-border bg-card px-3 py-2 text-left whitespace-normal wrap-anywhere">
    {children}
  </Button>
}

function ResourcePage({ item, links, byId, onResource, onEdges }) {
  const groups = groupRelations(links)
  return <>
    <Metadata rows={[
      ['Type', item.node?.type || item.service?.name || 'Resource group'],
      ['Stack', item.stack],
      ['Changes', changeSummary(item, byId)],
      ['Connections', groups.map(({ name, relations }) => `${name}: ${relations.length}`).join(' · ') || 'No connections'],
    ]} />
    <Accordion type="multiple" className="space-y-2">
      {item.group && <DetailSection value="members" title={`Resources in group (${item.members.size})`}>
        <div className="space-y-1.5">{[...item.members].sort().map(member => (
          <DetailRow key={member} onClick={event => onResource(member, event.currentTarget)}>{byId.get(member).name}</DetailRow>
        ))}</div>
      </DetailSection>}
      {groups.map(({ kind, name, relations }) => (
        <DetailSection key={kind} value={kind} title={`${name} (${relations.length})`}>
          <div className="space-y-1.5">{relations.map(edge => {
            const descriptions = flowDescriptions([edge]).map(description => description.label).join(' · ')
            const within = item.group && item.members.has(edge.from) && item.members.has(edge.to)
            return <DetailRow key={JSON.stringify([edge.from, edge.to, edge.state])} onClick={event => onEdges([edge], event.currentTarget)}>
              {edgeTitle(edge, byId)}
              {descriptions && <span className="mt-0.5 block text-xs text-muted-foreground">{descriptions}</span>}
              <span className="mt-0.5 block text-xs text-muted-foreground">{countLabel(edge.evidence.length, 'evidence item')}{within && ' · within group'}</span>
            </DetailRow>
          })}</div>
        </DetailSection>
      ))}
    </Accordion>
  </>
}

function endpointRows({ from, to }, byId) {
  return [['Source', from], ['Target', to]].map(([label, id]) => {
    const node = byId.get(id)
    return [label, `${node.stack || 'No stack'} · ${node.type} · ${changeLabels[node.change] || 'unchanged'}`]
  })
}

function Evidence({ edge, byId }) {
  const groups = new Map()
  for (const proof of edge.evidence) {
    const key = JSON.stringify([proof.label || '', proof.details || ''])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(proof)
  }
  return [...groups].map(([key, proofs]) => (
    <Fragment key={key}>
      {proofs[0].label && <h4 className="mt-3 mb-1 font-semibold">{proofs[0].label}</h4>}
      {proofs[0].details && <p className="mb-2 whitespace-pre-wrap">{proofs[0].details}</p>}
      <ul className="mb-2 list-disc space-y-2 pl-5 text-xs text-muted-foreground">
        {proofs.map((proof, index) => <li key={index}>
          {proof.source}
          {proof.resource && <div>Configured by: {byId.get(proof.resource)?.name || proof.resource}</div>}
          <code className="mt-1 block rounded bg-background px-2 py-1.5 font-mono whitespace-pre-wrap text-foreground">{proof.property || proof.source}</code>
        </li>)}
      </ul>
    </Fragment>
  ))
}

function EdgePage({ edges, byId }) {
  const groups = groupRelations(edges)
  const states = [...new Set(edges.map(edge => edge.state).filter(Boolean))].sort().reverse()
  const rows = [
    ['Type', groups.map(group => group.name).join(' · ')],
    ['Evidence', `${countLabel(edges.length, 'connection')} · ${countLabel(edges.reduce((sum, edge) => sum + edge.evidence.length, 0), 'evidence item')}`],
  ]
  if (edges.length === 1) rows.push(...endpointRows(edges[0], byId))
  if (states.length) rows.push(['Topology', states.map(topologyName).join(' · ')])
  return <>
    <Metadata rows={rows} />
    <Accordion type="multiple" defaultValue={groups.length === 1 ? [groups[0].kind] : []} className="space-y-2">
      {groups.map(({ kind, name, relations }) => (
        <DetailSection key={kind} value={kind} title={`${name} · ${countLabel(relations.length, 'connection')}`}>
          <p className="mb-2 text-muted-foreground">{notes[kind]}</p>
          <div className="divide-y">{relations.map(edge => (
            <div key={JSON.stringify([edge.from, edge.to, edge.state])} className="py-3 first:pt-0 last:pb-0">
              {edges.length > 1 && <><h3 className="mb-2 text-base font-semibold">{edgeTitle(edge, byId)}</h3><Metadata rows={endpointRows(edge, byId)} /></>}
              {states.length > 1 && edge.state && <p className="mb-2 text-muted-foreground">{topologyName(edge.state)}</p>}
              <Evidence edge={edge} byId={byId} />
            </div>
          ))}</div>
        </DetailSection>
      ))}
    </Accordion>
  </>
}

export function DetailsDialog({ inspector, byId, onResource, onEdges }) {
  const { pages, body, closeButton, back, close, restoreGraphFocus } = inspector
  const page = pages.at(-1)
  const title = page?.item?.name ?? (page?.edges?.length === 1 ? edgeTitle(page.edges[0], byId) : page && `Connections at this point (${page.edges.length})`)
  return <Dialog open={Boolean(page)} onOpenChange={open => { if (!open) close() }}>
    <DialogContent id="inspector" showCloseButton={false} aria-describedby={undefined}
      className="flex max-h-[min(50rem,calc(100dvh-max(1.5rem,env(safe-area-inset-top)+env(safe-area-inset-bottom))))] min-h-0 flex-col gap-0 overflow-hidden rounded-2xl bg-card p-0 sm:max-w-[44rem]"
      onOpenAutoFocus={event => { event.preventDefault(); closeButton.current?.focus() }}
      onCloseAutoFocus={restoreGraphFocus} onPointerDownOutside={event => event.preventDefault()}
      overlayProps={{ onClick: close }}>
      <header className="flex shrink-0 items-center gap-3 border-b bg-muted px-3 py-1.5 sm:px-5">
        {pages.length > 1 && <Button id="inspector-back" variant="ghost" size="icon-lg" aria-label="Back to previous details" onClick={back}><ArrowLeft /></Button>}
        <span id="inspector-label" className="flex-1 text-sm font-semibold">
          {page?.item ? page.item.group ? 'Resource group' : 'Resource' : 'Connection details'}
        </span>
        <DialogClose asChild>
          <Button id="clear-selection" ref={closeButton} variant="ghost" size="icon-lg" aria-label="Close details"><X /></Button>
        </DialogClose>
      </header>
      <div id="details" ref={body} className="min-h-0 overflow-auto overscroll-contain p-4 wrap-anywhere sm:p-6">
        <DialogTitle className="mb-4 text-xl leading-tight sm:text-2xl">{title}</DialogTitle>
        {pages.map((entry, index) => <div key={index} data-inspector-page hidden={entry !== page}>
          {entry.item
            ? <ResourcePage item={entry.item} links={entry.links} byId={byId} onResource={onResource} onEdges={onEdges} />
            : <EdgePage edges={entry.edges} byId={byId} />}
        </div>)}
      </div>
    </DialogContent>
  </Dialog>
}
