#!/usr/bin/env python3
"""Check a generated flow HTML through file:// using an installed headless Chromium."""
import json
import re
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

CHECK = r"""
<script type="module">
try {
  const $=id=>document.getElementById(id);
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const graph=JSON.parse($('infralens-data').textContent);
  const view=()=>$('diagram').querySelector('.react-flow__viewport').style.transform;
  const card=item=>item.closest('[data-diagram-card]');
  const edgeLabel=edge=>document.querySelector(`[data-edge-label="${edge.dataset.edge}"]`);
  const dialog=()=>$('inspector'),close=()=>$('clear-selection'),back=()=>$('inspector-back');
  const title=()=>dialog().querySelector('[data-slot="dialog-title"]').textContent;
  const inspector=()=>dialog()?.matches('[role="dialog"][data-state="open"]');
  const activePage=()=>dialog().querySelector('[data-inspector-page]:not([hidden])');
  const accordionItems=()=>[...activePage().querySelectorAll('[data-slot="accordion-item"]')];
  const trigger=section=>section.querySelector('[data-slot="accordion-trigger"]');
  const opened=section=>trigger(section).getAttribute('aria-expanded')==='true';
  const waitForLayout=async()=>{
    for(let attempt=0;$('stage')?.getAttribute('aria-busy')!=='false'&&attempt<100;attempt++)await wait(10);
    assert($('stage')?.getAttribute('aria-busy')==='false','Layout did not finish');
    assert(!$('stage').querySelector('[role=alert]'),'Layout failed');
  };
  async function dispatch(target,event){
    target.dispatchEvent(event);
    await wait(40);
    await waitForLayout();
  }
  const clickAt=(target,x,y)=>dispatch(target,new MouseEvent('click',{bubbles:true,detail:1,clientX:x,clientY:y}));
  async function click(target){target.click();await wait(40);await waitForLayout();}
  function hitCenter(element){
    const rect=element.getBoundingClientRect();
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    return {x,y,target:document.elementFromPoint(x,y)};
  }
  await waitForLayout();
  await wait(50);
  const initial=view();
  function checkRoutes(){
    const boxes=[...document.querySelectorAll('[data-item]')].map(item=>{const node=item.closest('.react-flow__node'),matrix=new DOMMatrix(node.style.transform);return {id:item.dataset.item,x:matrix.e,y:matrix.f,w:item.offsetWidth,h:item.offsetHeight};});
    const ports=new Set();
    for(const edge of document.querySelectorAll('[data-edge]')){
      const wire=edge.querySelector('.wire'),d=wire.getAttribute('d');assert(!/[CQ]/.test(d),'Curved connection');
      const points=[];for(const command of d.match(/[MHV][^MHV]*/g)){const numbers=command.slice(1).trim().split(/\s+/).map(Number),previous=points.at(-1);points.push(command[0]==='M'?{x:numbers[0],y:numbers[1]}:command[0]==='H'?{x:numbers[0],y:previous.y}:{x:previous.x,y:numbers[0]});}
      const end=points.at(-1),lead=points.at(-2),marker=document.getElementById(wire.getAttribute('marker-end').replace(/^url\(['"]?#|['"]?\)$/g,''));
      assert(marker?.getAttribute('markerUnits')==='userSpaceOnUse','Missing fixed-size arrowhead');
      const arrow=marker.querySelector('polyline').getBBox();
      const arrowLength=arrow.width/marker.viewBox.baseVal.width*marker.markerWidth.baseVal.value;
      assert(Math.abs(end.x-lead.x)+Math.abs(end.y-lead.y)>=arrowLength,'Arrowhead has no straight lead');
      for(const [id,point] of [[edge.dataset.from,points[0]],[edge.dataset.to,end]]){
        const key=JSON.stringify([id,point.x,point.y]);assert(!ports.has(key),'Two wires share a port on '+id);ports.add(key);
      }
      for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];assert(a.x===b.x||a.y===b.y,'Diagonal connection');for(const box of boxes){if(box.id===edge.dataset.from&&i===1||box.id===edge.dataset.to&&i===points.length-1)continue;const hit=a.y===b.y?a.y>box.y&&a.y<box.y+box.h&&Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.w:a.x>box.x&&a.x<box.x+box.w&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.h;assert(!hit,'Connection crosses an element: '+box.id);}}
    }
    const labelBoxes=[];
    for(const edge of document.querySelectorAll('[data-edge]')){
      const label=edgeLabel(edge);if(+edge.dataset.count>1)assert(label,'Missing connection count');if(!label)continue;
      const r={x:parseFloat(label.style.left)-3,y:parseFloat(label.style.top)-3,w:label.offsetWidth+6,h:label.offsetHeight+6};
      for(const other of [...boxes,...labelBoxes])assert(!(r.x<other.x+other.w&&r.x+r.w>other.x&&r.y<other.y+other.h&&r.y+r.h>other.y),'Connection count overlaps an element');
      labelBoxes.push(r);
    }
    assert(!$('summary').textContent.includes('unrouted'),'Missing connection route');
  }
  assert(document.documentElement.lang==='en','Diagram language is not English');
  const serviceGroups=[...document.querySelectorAll('[data-service]')];
  for(const group of serviceGroups){
    const id=group.dataset.item,toggle=card(group).querySelector('[data-toggle]');
    assert(toggle.getAttribute('aria-expanded')==='false','Service group is initially expanded');
    if(group.dataset.service.startsWith('aws:')&&group.querySelector('.service-icon'))assert(group.querySelector('.service-icon').getAttribute('aria-hidden')==='true','Icon is not decorative');
    await dispatch(toggle,new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    const expanded=[...document.querySelectorAll('[data-item]')].find(g=>g.dataset.item===id);
    assert(card(expanded).querySelector('[data-toggle]').getAttribute('aria-expanded')==='true','Service group did not expand');
    assert(view()===initial,'Service expansion changed camera');checkRoutes();
    await dispatch(card(expanded).querySelector('[data-toggle]'),new MouseEvent('click',{bubbles:true}));
  }
  const icons=[...new Set([...document.querySelectorAll('.service-icon')].map(e=>e.getAttribute('src')))];
  for(const uri of icons){
    assert(uri.startsWith('data:image/svg+xml;base64,'),'Icon is not embedded');
    await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth?resolve():reject(Error('Empty AWS icon'));image.onerror=()=>reject(Error('AWS icon did not load offline'));image.src=uri;});
  }
  if(graph.nodes.some(n=>/^aws:(s3|lambda|iam|ecs|apigatewayv2|ec2|cloudwatch|sqs|sns|dynamodb|sfn|opensearch)\//.test(n.type)))assert(icons.length,'Missing AWS service icons');
  checkRoutes();
  if(innerWidth>620)for(const label of document.querySelectorAll('.edge-label')){
    const box=label.getBoundingClientRect();
    assert(box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,'Initial flow label outside viewport');
  }
  const plannedFlow=graph.edges.filter(e=>(!e.state||e.state==='after')&&['triggers','connects_to'].includes(e.kind));
  if(plannedFlow.length){
    assert($('flow-view').getAttribute('aria-pressed')==='true','Flow did not open by default');
    const shown=[...document.querySelectorAll('[data-edge]')].reduce((n,e)=>n+(+e.dataset.count),0);
    assert(shown===plannedFlow.length,'Configured flow connections are missing');
    const connection=document.querySelector('[data-edge]');
    await dispatch(connection,new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    assert(inspector()&&$('details').textContent.includes('Evidence'),'Connection evidence is inaccessible');
    await click($('clear-selection'));
    for(const connection of document.querySelectorAll('[data-edge]')){
      const proofs=plannedFlow.filter(e=>e.from===connection.dataset.from&&e.to===connection.dataset.to&&connection.classList.contains(e.kind)).flatMap(e=>e.evidence).filter(p=>p.label||p.details);
      if(!proofs.length)continue;
      await dispatch(connection,new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      for(const proof of proofs){
        if(proof.label)assert($('details').textContent.includes(proof.label),'Endpoint or event missing from inspector');
        if(proof.details)assert($('details').textContent.includes(proof.details),'Filter or parameters missing from inspector');
      }
      await click($('clear-selection'));
    }
  }
  if(graph.nodes.length){
    assert(document.querySelectorAll('[data-item]').length>0,'Diagram did not render');
    const toggle=document.querySelector('[data-toggle]');
    const open=toggle.getAttribute('aria-expanded');await dispatch(toggle,new MouseEvent('click',{bubbles:true}));
    assert(view()===initial,'Expansion changed camera');checkRoutes();
    const replacement=[...document.querySelectorAll('[data-toggle]')].find(e=>e.dataset.toggle===toggle.dataset.toggle);
    assert(replacement.getAttribute('aria-expanded')!==open,'Group did not toggle');
    await dispatch(replacement,new MouseEvent('click',{bubbles:true}));
    const item=document.querySelector('[data-item]');
    item.focus();
    await dispatch(item,new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    assert(inspector(),'Keyboard inspection failed');
    assert(document.activeElement===close(),'Modal did not receive focus');
    $('zoom-in').focus();
    assert(document.activeElement===close(),'Background received focus during modal inspection');
    assert(view()===initial,'Inspection changed camera');
    await dispatch(close(),new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert(!inspector()&&document.activeElement===item,'Escape path did not restore focus');
    assert(!document.querySelector('#diagram .selected, #diagram .muted'),'Closing left diagram items highlighted');

    const group=document.querySelector('[data-group]');
    await clickAt(group,0,0);
    const groupTitle=title();
    assert(!back(),'Back is available on the initial details');
    const members=accordionItems()[0];
    assert(inspector()&&trigger(members)?.textContent.startsWith('Resources in group'),'Group members missing from modal');
    assert(!opened(members),'Group accordion should start closed');
    await click(trigger(members));
    assert(opened(members),'Group accordion could not be opened');
    if(group.dataset.item.startsWith('stack:')){
      const stack=group.dataset.item.slice('stack:'.length);
      const resources=new Set(graph.nodes.filter(node=>(node.stack||'No stack')===stack).map(node=>node.id));
      const within=graph.edges.find(edge=>edge.kind!=='contains'&&(!edge.state||edge.state==='after')&&resources.has(edge.from)&&resources.has(edge.to));
      if(within){
        const relationNames={triggers:'Events / invocations',connects_to:'Configuration references',depends_on:'Pulumi dependencies'};
        const section=accordionItems().find(item=>trigger(item).textContent.startsWith(relationNames[within.kind]));
        assert(section,'Missing internal relationship section');
        await click(trigger(section));
        assert([...section.querySelectorAll('.connection-item')].some(button=>button.textContent.includes('within group')),'Missing internal group relationship');
        await click(trigger(section));
      }
    }
    const member=[...members.querySelectorAll('.connection-item')].find(button=>graph.nodes.some(node=>node.type!=='pulumi:pulumi:Stack'&&node.name===button.textContent));
    if(member){
      const memberName=member.textContent;
      await click(member);
      assert(inspector()&&title()===memberName,'Group member did not open in the same dialog');
      assert(document.activeElement===close(),'New modal content did not receive focus');
      const sections=accordionItems();
      const references=sections.find(section=>trigger(section).textContent.startsWith('Configuration references'));
      const links=references||sections.find(section=>!trigger(section).textContent.startsWith('Resources in group'));
      if(links){
        assert(!opened(links),'Resource connection accordion should start closed');
        await click(trigger(links));
        const link=links.querySelector('.connection-item');
        link.scrollIntoView({block:'end'});
        const scroll=$('details').scrollTop;
        await click(link);
        assert(inspector()&&$('details').textContent.includes('Evidence'),'Connection did not open from resource details');
        assert(back(),'Connection does not offer a way back');
        await click(back());
        assert(inspector()&&title()===memberName&&opened(links),'Back did not restore resource details and its accordion');
        assert(document.activeElement===link&&$('details').scrollTop===scroll,'Back did not restore the selected row and scroll');
      }
      assert(back(),'Resource does not offer a way back to the group');
      await click(back());
      assert(inspector()&&title()===groupTitle&&opened(members)&&document.activeElement===member,'Back did not restore group membership');
      assert(!back(),'Back is still visible after returning to the first page');
      await click(member);
      assert(back(),'Back did not become available after reopening a member');
    }
    const backdrop=document.elementFromPoint(1,1);
    assert(backdrop?.matches('[data-slot="dialog-overlay"]'),'Backdrop did not intercept clicks outside the modal');
    backdrop.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:1,clientY:1}));
    close().dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
    assert(inspector(),'Dragging from the backdrop into the dialog closed it');
    backdrop.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:1,clientY:1}));
    backdrop.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:1,clientY:1}));
    await clickAt(backdrop,1,1);
    assert(!inspector()&&document.activeElement.hasAttribute('data-item'),'Backdrop did not close the dialog and restore graph focus');

    await click($('fit'));
    const toggleAtPoint=[...document.querySelectorAll('[data-toggle]')].find(button=>hitCenter(button).target?.closest('[data-toggle]')===button);
    assert(toggleAtPoint,'No group toggle is accessible to the pointer');
    const groupID=toggleAtPoint.dataset.toggle;
    const getToggle=()=>[...document.querySelectorAll('[data-toggle]')].find(g=>g.dataset.toggle===groupID);
    for(let i=0;i<2;i++){
      const button=getToggle(),isExpanded=button.getAttribute('aria-expanded');
      const {target,x,y}=hitCenter(button);
      assert(target?.closest('[data-toggle]')===button,'Group −/+ is covered');
      target.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse',clientX:x,clientY:y}));
      card(button).querySelector('[data-item]').dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse',clientX:x,clientY:y}));
      await wait(180);
      const hit=document.elementFromPoint(x,y);
      assert(hit?.closest('[data-toggle]')===button,'Hover blocked the group −/+');
      await clickAt(hit,x,y);
      assert(!inspector()&&getToggle().getAttribute('aria-expanded')!==isExpanded,'Group −/+ opened details or did not toggle');
    }
    for(const id of ['zoom-out','zoom-in']){
      const button=$(id),{target,x,y}=hitCenter(button),before=view();
      assert(target?.closest('button')===button,'Zoom control is covered: '+id);
      await clickAt(target,x,y);
      assert(view()!==before,'Zoom control did not change camera: '+id);
    }
    const firstEdge=document.querySelector('[data-edge]');
    if(firstEdge){
      await clickAt(firstEdge,0,0);
      assert($('details').textContent.includes('Evidence')&&$('details').querySelector('code'),'Missing evidence paths');
      assert(opened(accordionItems()[0]),'Single relationship type should start expanded');
      assert($('details').textContent.includes('Source')&&$('details').textContent.includes('Target'),'Missing endpoint metadata');
      if(location.search.includes('long-mobile')){
        const rect=dialog().getBoundingClientRect(),body=$('details'),closeTop=close().getBoundingClientRect().top;
        assert(rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,'Mobile modal overflowed the viewport');
        assert(body.scrollWidth<=body.clientWidth,'Long modal content overflowed horizontally');
        assert(body.scrollHeight>body.clientHeight,'Mobile scroll fixture did not overflow vertically');
        body.scrollTop=body.scrollHeight;
        assert(body.scrollTop>0&&close().getBoundingClientRect().top===closeTop,'Scrolling moved the close button');
      }
      await click(close());
      assert(!inspector()&&document.activeElement.dataset.edge===firstEdge.dataset.edge,'Close button did not restore edge focus');
    }
    const beforeMode=view(),beforeCount=document.querySelectorAll('[data-item]').length;await click($('infra-view'));assert(view()===beforeMode,'View switch changed camera');
    assert(document.querySelectorAll('[data-item]').length===beforeCount,'Infrastructure expanded every resource');checkRoutes();
    await click($('dependencies'));assert(view()===beforeMode,'Filter changed camera');assert(!document.querySelector('[data-edge].depends_on'),'Dependency filter left deployment edges visible');await click($('dependencies'));
    await click($('zoom-in'));assert(view()!==beforeMode,'Zoom failed');await click($('fit'));
    await wait(150);
    const rendered=[...document.querySelectorAll('[data-edge]')];
    const kindLabels={triggers:'Events / invocations',connects_to:'Configuration references',depends_on:'Pulumi dependencies'};
    const kindLabel=edge=>kindLabels[[...edge.classList].find(kind=>kindLabels[kind])];
    if(location.search.includes('parallel')){
      assert(rendered.length===3,'Missing parallel arrows');
      for(const edge of rendered){
        const path=edge.querySelector('.wire'),screen=path.getPointAtLength(path.getTotalLength()-6).matrixTransform(path.getScreenCTM());
        const target=document.elementFromPoint(screen.x,screen.y);
        assert(target?.closest('[data-edge]')===edge,'Parallel tip cannot be clicked independently');
        await clickAt(target,screen.x,screen.y);
        assert(inspector()&&accordionItems().length===1&&trigger(accordionItems()[0]).textContent.startsWith(kindLabel(edge)),'Tip opened the wrong relationship');
        await click(close());
      }
    }
    shared: for(const edge of rendered){
      const path=edge.querySelector('.wire');
      for(const fraction of [.25,.5,.75]){
        const p=path.getPointAtLength(path.getTotalLength()*fraction),screen=p.matrixTransform(path.getScreenCTM());
        const target=document.elementFromPoint(screen.x,screen.y);
        if(!target?.closest('[data-edge]'))continue;
        const matches=rendered.filter(g=>g.querySelector('.react-flow__edge-interaction').isPointInStroke(p));
        const expected=new Set(matches.map(kindLabel));
        if(expected.size<2)continue;
        const expectedCount=matches.reduce((count,g)=>count+(+g.dataset.count),0);
        await clickAt(target,screen.x,screen.y);
        assert(inspector()&&title()==='Connections at this point ('+expectedCount+')','Shared route lost original connections');
        for(const kind of expected){
          const section=accordionItems().find(section=>trigger(section).textContent.startsWith(kind));
          assert(section&&!opened(section),'Shared route lost a collapsed relationship type');
          await click(trigger(section));
          assert(opened(section)&&section.querySelector('code'),'Shared route lost evidence');
        }
        await click(close());
        await dispatch(edge,new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        assert(trigger(accordionItems()[0]).textContent.startsWith(kindLabel(edge))&&accordionItems().length===1,'Keyboard did not inspect the focused relationship');
        await click(close());
        break shared;
      }
    }

    for(const target of graph.nodes){
      $('search').value=target.name;await dispatch($('search'),new Event('input',{bubbles:true}));
      const result=[...$('results').querySelectorAll('button')].find(b=>b.dataset.resource===target.id);
      assert(result,'Resource not searchable: '+target.name);await click(result);
      assert(inspector()&&$('details').textContent.includes(target.name),'Search reveal failed: '+target.name);
      assert(!back(),'History leaked into a new modal');
      assert(document.activeElement===close(),'Search did not focus modal');
      await click(close());
      assert(document.activeElement.hasAttribute('data-item'),'Search resource did not receive focus after modal closed');
      const body=document.activeElement.matches('.body')&&document.activeElement;
      if(body&&['create','delete','unchanged'].includes(target.change)){
        const [r,g,b]=getComputedStyle(body).backgroundColor.match(/[\d.]+/g).map(Number);
        if(target.change==='create')assert(g>r*1.5&&g>b,'Created resource is not green');
        if(target.change==='delete')assert(r>g*1.5&&r>b,'Deleted resource is not red');
        if(target.change==='unchanged')assert(Math.max(r,g,b)-Math.min(r,g,b)<35,'Unchanged resource is not neutral');
      }
    }
    checkRoutes();
    const beforePan=view(),pane=$('diagram').querySelector('.react-flow__pane');
    const mouse=(target,type,x,y,buttons)=>target.dispatchEvent(new MouseEvent(type,{bubbles:true,view:window,button:0,buttons,clientX:x,clientY:y}));
    mouse(pane,'mousedown',300,400,1);mouse(window,'mousemove',330,430,1);mouse(window,'mouseup',330,430,0);
    await wait(30);
    assert(!inspector()&&view()!==beforePan,'Pan failed to track');
    const beforeWheel=view();
    await dispatch(pane,new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100,clientX:200,clientY:400}));
    assert(view()!==beforeWheel,'Wheel zoom failed');
    await click($('filter-button'));assert(!$('filters').hidden,'Filter popover failed');
    if(graph.edges.some(edge=>edge.state)){
      const select=$('topology'),cameraBeforeSwitch=view();
      assert(select.labels[0].textContent==='Connections','Preview filter should describe its scope');
      for(const state of ['before','after']){
        select.value=state;
        await dispatch(select,new Event('change',{bubbles:true}));
        assert(select.value===state&&view()===cameraBeforeSwitch,'Connection filter changed camera');
      }
    }
    await dispatch(document,new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert($('filters').hidden,'Filter dismissal failed');
    const cameraBeforeResize=view(),width=$('stage').clientWidth;
    $('stage').style.width=(width-20)+'px';await wait(50);
    const cameraAfterResize=view();
    assert(cameraBeforeResize===cameraAfterResize,'Resize moved camera or changed zoom');
    $('stage').style.width='';await wait(50);
  }else assert(!$('empty').hidden,'Empty graph message missing');
  assert(document.documentElement.scrollWidth<=innerWidth+1,'Horizontal page overflow');
  for(const text of document.querySelectorAll('.node-name,.node-meta'))assert(text.offsetWidth<=215&&getComputedStyle(text).textOverflow==='ellipsis','Card label overflow');
  if(location.search.includes('reduced')){
    const item=document.querySelector('[data-item]');
    await dispatch(item,new KeyboardEvent('keydown',{key:' ',bubbles:true}));
    assert(inspector(),'Space did not open the modal');
    assert(matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(item).transitionDuration==='0s','Reduced motion ignored');
    await click(close());
  }
  await wait(150);
  assert(!window.__qaErrors.length,'Runtime error: '+window.__qaErrors.join(';'));
  assert(!window.__qaCSP.length,'Blocked resource requests: '+window.__qaCSP.join(';'));
  assert(!performance.getEntriesByType('resource').some(e=>/^https?:/.test(e.name)),'HTTP resource request');
  const output=document.createElement('output');output.id='qa-result';output.hidden=true;
  output.textContent=JSON.stringify({ok:true,resources:graph.nodes.length,visible:document.querySelectorAll('[data-item]').length,connections:graph.edges.filter(e=>['triggers','connects_to'].includes(e.kind)).length,width:innerWidth});document.body.append(output);
} catch(error) {
  const output=document.createElement('output');output.id='qa-result';output.hidden=true;output.textContent=JSON.stringify({ok:false,error:error.message});document.body.append(output);
}
</script>
"""


class Result(HTMLParser):
    def __init__(self):
        super().__init__()
        self.collect = False
        self.text = ''

    def handle_starttag(self, tag, attrs):
        if tag == 'output' and ('id', 'qa-result') in attrs:
            self.collect = True

    def handle_endtag(self, tag):
        if tag == 'output':
            self.collect = False

    def handle_data(self, data):
        if self.collect:
            self.text += data


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python3 scripts/check_html.py RESULT.html CHROMIUM_EXECUTABLE')
    original = Path(sys.argv[1]).read_text()
    instrument = '<script>window.__qaErrors=[];window.__qaCSP=[];addEventListener("error",e=>window.__qaErrors.push(e.message));addEventListener("securitypolicyviolation",e=>window.__qaCSP.push(e.blockedURI));</script>'
    with tempfile.TemporaryDirectory(prefix='infralens-html-check-') as folder:
        path = Path(folder) / 'check.html'
        data_pattern = r'(<script id="infralens-data" type="application/json">)(.*?)(</script>)'
        source_graph = json.loads(re.search(data_pattern, original, re.S).group(2))
        long_graph = json.loads(json.dumps(source_graph))
        for node in long_graph['nodes']:
            node['name'] = 'WWWWWWWWWWWWWWWWWWWWWWWWWWWW 中文 ' + node['name'] + ' bardzo-długa-nazwa' * 8
        mobile_graph = json.loads(json.dumps(long_graph))
        for edge in mobile_graph['edges']:
            for proof in edge['evidence']:
                proof['details'] = (proof.get('details') or '') + '\n' + '\n'.join(['Long configuration value'] * 50)
        empty_graph = {'schemaVersion': 1, 'nodes': [], 'edges': []}
        parallel_graph = {'schemaVersion': 1, 'nodes': [{'id': key, 'name': key, 'type': 'test:resource:Resource', 'stack': 'shared/dev'} for key in ['source', 'target']], 'edges': [{'from': 'source', 'to': 'target', 'kind': kind, 'evidence': [{'source': 'test', 'property': kind}]} for kind in ['triggers', 'connects_to', 'depends_on']]}
        scenarios = [('desktop', 1440, 1000, source_graph, False), ('mobile', 390, 844, source_graph, False), ('long-reduced', 1440, 1000, long_graph, True), ('long-mobile', 390, 844, mobile_graph, False), ('empty', 390, 844, empty_graph, False), ('parallel-desktop', 1440, 1000, parallel_graph, False), ('parallel-mobile', 390, 844, parallel_graph, False)]
        for name, width, height, graph, reduced in scenarios:
            data = json.dumps(graph).replace('<', r'\u003c').replace('>', r'\u003e').replace('&', r'\u0026')
            document = re.sub(data_pattern, lambda m: m.group(1) + data + m.group(3), original, flags=re.S)
            path.write_text(document.replace('<script id="infralens-data"', instrument + '<script id="infralens-data"', 1).replace('</body>', CHECK + '</body>', 1))
            screenshot = Path(tempfile.gettempdir()) / f'infralens-{name}.png'
            command = [sys.argv[2], '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--user-data-dir=' + str(Path(folder) / f'profile-{name}'), f'--window-size={width},{height}', '--virtual-time-budget=12000', '--dump-dom']
            if reduced:
                command.append('--force-prefers-reduced-motion')
            result = subprocess.run(command + [path.as_uri() + '?' + name], capture_output=True, text=True, timeout=45)
            assert result.returncode == 0, f'Browser failed: {result.stderr[:300]}'
            parser = Result()
            parser.feed(result.stdout)
            assert parser.text, 'Browser did not run the checks'
            report = json.loads(parser.text)
            assert report.get('ok'), report
            # Screenshots show the actual initial view, separate from the interaction checks.
            path.write_text(document)
            capture = subprocess.run([arg for arg in command if arg != '--dump-dom' and not arg.startswith('--user-data-dir=')] + ['--user-data-dir=' + str(Path(folder) / f'capture-{name}'), '--screenshot=' + str(screenshot), path.as_uri()], capture_output=True, text=True, timeout=45)
            assert capture.returncode == 0, capture.stderr[:300]
            print(name, json.dumps(report), screenshot)


if __name__ == '__main__':
    main()
