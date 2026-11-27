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
  const graph=JSON.parse($('laytrace-data').textContent);
  const view=()=>$('diagram').querySelector('.react-flow__viewport').style.transform;
  const card=item=>item.closest('[data-diagram-card]');
  const cardColors={unchanged:'#7b8a9e',create:'#55d98a',delete:'#fa7882',update:'#f0c75e',replace:'#f0c75e'};
  const swatch=document.createElement('span');
  document.body.append(swatch);
  swatch.style.backgroundColor='var(--color-card)';
  const neutralCard=getComputedStyle(swatch).backgroundColor;
  swatch.remove();
  function checkStatusBorder(style,change){
    const color=cardColors[change||'unchanged'];
    assert(style.borderColor==='rgb('+color.slice(1).match(/../g).map(hex=>parseInt(hex,16)).join(', ')+')','Wrong status border color: '+change);
    assert(style.borderTopWidth==='2px','Status border is too thin');
  }
  function checkCardChange(card,change){
    const style=getComputedStyle(card);
    checkStatusBorder(style,change);
    assert(style.backgroundColor===neutralCard,'Card background varies with change status');
    if(change&&change!=='unchanged'){
      assert(style.boxShadow.includes('0px 0px 3px')&&style.boxShadow.includes('0px 0px 12px'),'Missing two-layer status shadow: '+style.boxShadow);
    }
  }
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
  async function expandRelationGroups(section){
    for(const item of section.querySelectorAll('[data-slot="accordion-item"]')){
      assert(!opened(item),'Nested relationship group should start closed');
      await click(trigger(item));
    }
  }
  async function expandConnectionGroups(seen=new Set()){
    while(true){
      const group=[...document.querySelectorAll('[data-connection-group]')].find(node=>!seen.has(node.dataset.item));
      if(!group)return;
      seen.add(group.dataset.item);
      const toggle=card(group).querySelector('[data-toggle]');
      if(toggle.getAttribute('aria-expanded')==='false')await click(toggle);
    }
  }
  function hitCenter(element){
    const rect=element.getBoundingClientRect();
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    return {x,y,target:document.elementFromPoint(x,y)};
  }
  await waitForLayout();
  await wait(50);
  if(location.search.includes('connection-scope')){
    const item=id=>[...document.querySelectorAll('[data-item]')].find(card=>card.dataset.item===id);
    const press=(id,type,detail)=>dispatch(item(id),new MouseEvent(type,{bubbles:true,detail}));
    const exit=()=>$('exit-details-view');
    const expectReduced=()=>{
      assert(exit()?.textContent.trim()==='Exit Details View','Details view has no exit button');
      assert(item('source')&&item('target'),'Direct connection missing from isolated view');
      assert(!item('unrelated')&&!item('indirect'),'Unrelated or indirect cards survived isolation');
      assert(document.querySelectorAll('[data-edge]').length===1,'Isolated view contains an unrelated edge');
    };
    const leave=async()=>{
      await click(exit());
      assert(!exit()&&item('unrelated')&&item('indirect'),'Exiting did not restore the full graph');
    };
    const expectScope=async(id)=>{
      await press(id,'click',1);
      assert(item('unrelated')?.classList.contains('muted'),'Single click should dim unrelated cards');
      await press(id,'click',2);
      await press(id,'dblclick',2);
      expectReduced();
      assert(!document.querySelector('#diagram .muted'),'Isolated view dimmed retained items');
    };
    await expectScope('source');
    await click(close());
    expectReduced();
    await click(item('target'));
    assert(inspector()&&title()==='target','Neighbor details did not open');
    expectReduced();
    await leave();
    await expectScope('stack:app');
    await clickAt(document.querySelector('[data-edge]'),0,0);
    assert(inspector()&&title()==='source → target','Connection details did not open');
    expectReduced();
    await click(close());
    expectReduced();
    await leave();
  }else if(location.search.includes('mixed-changes')){
    for(const mode of ['flow-view','infra-view']){
      await click($(mode));
      for(const resource of graph.nodes){
        const item=document.querySelector(`[data-node="${resource.id}"]`);
        assert(item?.dataset.change===resource.change,'Resource status lost in '+mode+': '+resource.id);
        checkCardChange(item,resource.change);
      }
      assert(document.querySelectorAll('[data-edge]').length===graph.edges.length,'Mixed statuses lost connections');
    }
    const stack=()=>document.querySelector('[data-item="stack:preview"]');
    const toggle=()=>card(stack()).querySelector('[data-toggle]');
    assert(toggle().getAttribute('aria-expanded')==='true','Stack no longer opens by default');
    checkStatusBorder(getComputedStyle(card(stack()).firstElementChild),'unchanged');
    await click(toggle());
    for(let attempt=0;toggle().getAttribute('aria-expanded')!=='false'&&attempt<40;attempt++)await wait(10);
    assert(toggle().getAttribute('aria-expanded')==='false','Stack did not collapse');
    checkCardChange(stack(),'unchanged');
    const summary=stack().querySelector('.node-meta');
    assert(summary.scrollWidth<=summary.clientWidth,'Mixed change counts are clipped');
    for(const [short, label] of [['~ 2','~ update 2'],['− 1','− delete 1'],['+ 1','+ create 1'],['↻ 1','↻ replace 1']]){
      assert(summary.textContent.includes(short),'Missing visible count: '+label);
      assert(stack().title.includes(label)&&stack().getAttribute('aria-label').includes(label),'Missing full count: '+label);
    }
  }else if(location.search.includes('dense-viewer')){
    const lambdaToggle=card(document.querySelector('[data-service="aws:lambda"]')).querySelector('[data-toggle]');
    await click(lambdaToggle);
    const eventsToggle=document.querySelector('[data-toggle^="connections:"]');
    await click(eventsToggle);
    assert(document.querySelectorAll('[data-node^="lambda-"]').length===graph.nodes.length-1,'Expansion lost Lambda cards');
    assert(document.activeElement===eventsToggle,'Expansion lost keyboard focus');
    await click($('fit'));
    const edges=[...document.querySelectorAll('#diagram [data-edge]')];
    assert(edges.length===graph.edges.length,'Simplified diagram lost connections');
    assert(edges.every(edge=>edge.querySelector('.wire[marker-end]')&&edge.querySelector('.react-flow__edge-interaction')),'Simplified connections lost direction or hit area');
    assert(!$('diagram').querySelector('.pipe-current,.pipe-wall,[data-edge-label]'),'Fit view still mounts decorative layers');
    const zoom=()=>new DOMMatrix(view()).a;
    for(let i=0;zoom()<.7&&i<30;i++)await click($('zoom-in'));
    assert(zoom()>=.7&&$('diagram').querySelector('.pipe-current'),'Zoom did not restore visible details');
    await click($('fit'));
    const key=(target,key)=>dispatch(target,new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
    edges[0].focus();
    await key(edges[0],'Enter');
    assert(inspector(),'Keyboard did not open simplified connection');
    assert(getComputedStyle(dialog()).backdropFilter==='none','Inspector filters the diagram behind it');
    assert(getComputedStyle(edges.find(edge=>edge.classList.contains('muted'))).filter==='none','Muted connections still use a graphics filter');
    await click(close());
    assert(document.activeElement===edges[0],'Closing the inspector lost connection focus');
    await click(document.querySelector('[data-connection-group]'));
    await click(trigger(accordionItems().find(item=>trigger(item).textContent.startsWith('Resources in group'))));
    const member=activePage().querySelector('[data-member-id="lambda-150"]').closest('button');
    member.scrollIntoView({block:'center'});
    await wait(100);
    const memberOffset=()=>member.getBoundingClientRect().top-$('details').getBoundingClientRect().top;
    const previousOffset=memberOffset();
    await click(member);
    await click(back());
    assert(document.activeElement===member&&Math.abs(memberOffset()-previousOffset)<2,'Back did not restore the visible row position');
    await click(close());
    const search=$('search'), results=$('results');
    const rows=()=>[...results.querySelectorAll('[data-resource]')];
    search.value='Benchmark Lambda';
    await dispatch(search,new Event('input',{bubbles:true}));
    assert(rows().length===50&&results.querySelector('[role=status]').textContent.includes(graph.edges.length+' results'),'First page does not show the full result count');
    await key(rows().at(-1),'ArrowDown');
    assert(document.activeElement.dataset.resource==='lambda-050','ArrowDown did not enter the next page');
    await key(rows()[0],'ArrowUp');
    assert(document.activeElement.dataset.resource==='lambda-049','ArrowUp did not return to the previous page');
    await click([...results.querySelectorAll('button')].find(button=>button.textContent==='Next'));
    assert(document.activeElement===rows()[0],'Next did not focus the first result of the new page');
    await click(rows()[0]);
    assert(inspector()&&title()==='Benchmark Lambda 050','A result beyond the first page could not be opened');
    await click(close());
  }else if(location.search.includes('zoomed-drag')){
    await clickAt(document.querySelector('[data-edge]'),0,0);
    assert(inspector(),'Connection did not open the inspector');
    document.documentElement.style.zoom='1.5';
    await wait(100);
    const grip=dialog().querySelector('[data-window-grip]'),header=grip.closest('header');
    const rect=()=>dialog().getBoundingClientRect();
    const assertInViewport=()=>{
      const {left,top,right,bottom}=rect(),port=window.visualViewport;
      assert(left>=port.offsetLeft&&top>=port.offsetTop&&right<=port.offsetLeft+port.width&&bottom<=port.offsetTop+port.height,'Inspector escaped the visible viewport');
    };
    // Synthetic pointers cannot register capture with Chromium.
    header.setPointerCapture=()=>{};
    const grab=()=>{
      const {x,y,target}=hitCenter(grip);
      assert(target?.closest('[data-window-grip]')===grip,'Inspector grip is covered');
      const pointer=(element,type,dx,dy)=>element.dispatchEvent(new PointerEvent(type,{
        bubbles:true,isPrimary:true,pointerId:21,clientX:x+dx,clientY:y+dy,
      }));
      pointer(target,'pointerdown',0,0);
      return (type,dx,dy)=>pointer(header,type,dx,dy);
    };
    assertInViewport();
    const start=rect();
    let send=grab();
    send('pointermove',-100,0);
    assert(Math.abs(rect().x-start.x+100)<1,'Inspector did not follow the pointer at 150%');
    send('pointermove',2000,2000);
    assertInViewport();
    send('pointercancel',0,0);
    const retry=rect();
    send=grab();
    send('pointerup',-100,0);
    assert(Math.abs(rect().x-retry.x+100)<1,'Inspector ignored the release position after interruption');
    assertInViewport();
    await wait(650);
    assertInViewport();
  }else{
  const initial=view();
  async function checkRoutes(){
    // An in-flight transition can briefly move cards across the previous routes.
    await wait(320);
    const boxes=[...document.querySelectorAll('[data-item]')].map(item=>{const node=item.closest('.react-flow__node'),matrix=new DOMMatrix(node.style.transform);return {id:item.dataset.item,x:matrix.e,y:matrix.f,w:item.offsetWidth,h:item.offsetHeight};});
    const ports=new Set();
    for(const edge of document.querySelectorAll('[data-edge]')){
      const wire=edge.querySelector('.wire'),d=wire.getAttribute('d');
      if(edge.getAttribute('aria-hidden')!=='true')
        assert(edge.querySelector('.react-flow__edge-interaction')?.getAttribute('d')===d,'Visible and clickable paths diverged');
      const points=[];let curveExit;
      const commands=d.match(/[MLHVQ][^MLHVQ]*/g);
      for(const [index,command] of commands.entries()){
        const numbers=command.slice(1).trim().split(/\s+/).map(Number),previous=points.at(-1);
        const [x,y,exitX,exitY]=numbers;
        if(command[0]==='Q'){
          const entry=commands[index-1].slice(1).trim().split(/\s+/).map(Number);
          const radius=Math.abs(x-entry[0])+Math.abs(y-entry[1]);
          assert(radius>0&&radius<=5.001&&Math.abs(radius-Math.abs(x-exitX)-Math.abs(y-exitY))<.001,'Invalid corner radius');
          points.push({x,y});
          curveExit={x:exitX,y:exitY};
        }else if(!commands[index+1]?.startsWith('Q')){
          points.push(command[0]==='H'?{x,y:previous.y}:command[0]==='V'?{x:previous.x,y:x}:{x,y});
          if(index!==commands.length-1)curveExit=undefined;
        }
      }
      const end=points.at(-1),lead=curveExit??points.at(-2),marker=document.getElementById(wire.getAttribute('marker-end').replace(/^url\(['"]?#|['"]?\)$/g,''));
      assert(marker?.getAttribute('markerUnits')==='userSpaceOnUse','Missing fixed-size arrowhead');
      const arrow=marker.querySelector('polyline').getBBox();
      const arrowLength=arrow.width/marker.viewBox.baseVal.width*marker.markerWidth.baseVal.value;
      assert(Math.abs(end.x-lead.x)+Math.abs(end.y-lead.y)>=arrowLength,'Arrowhead has no straight lead');
      for(const [id,point] of [[edge.dataset.from,points[0]],[edge.dataset.to,end]]){
        const key=JSON.stringify([id,point.x,point.y]);assert(!ports.has(key),'Two wires share a port on '+id);ports.add(key);
      }
      for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];assert(a.x===b.x||a.y===b.y,'Diagonal connection');for(const box of boxes){if(box.id===edge.dataset.from&&i===1||box.id===edge.dataset.to&&i===points.length-1)continue;const hit=a.y===b.y?a.y>box.y&&a.y<box.y+box.h&&Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.w:a.x>box.x&&a.x<box.x+box.w&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.h;assert(!hit,'Connection '+edge.dataset.from+' → '+edge.dataset.to+' crosses an element: '+box.id);}}
    }
    const labelBoxes=[];
    for(const edge of document.querySelectorAll('[data-edge]')){
      const label=edgeLabel(edge);if(!label)continue;
      const r={x:parseFloat(label.style.left)-3,y:parseFloat(label.style.top)-3,w:label.offsetWidth+6,h:label.offsetHeight+6};
      for(const other of [...boxes,...labelBoxes])assert(!(r.x<other.x+other.w&&r.x+r.w>other.x&&r.y<other.y+other.h&&r.y+r.h>other.y),'Connection count overlaps an element');
      labelBoxes.push(r);
    }
    assert(!$('summary').textContent.includes('unrouted'),'Missing connection route');
  }
  assert(document.documentElement.lang==='en','Diagram language is not English');
  const legend=$('connection-legend'),legendButton=document.querySelector('[aria-controls="connection-legend"]');
  if(graph.nodes.length){
    assert(legend&&legendButton,'Diagram has no connection legend');
    assert(legend.hidden===(innerWidth<=620),'Legend starts in the wrong state for this viewport');
    if(legend.hidden)await click(legendButton);
    const swatches=[...legend.querySelectorAll('li')];
    assert(swatches.length===3&&new Set(swatches.map(row=>row.querySelector('svg>path:last-child')?.getAttribute('fill'))).size===3,'Legend does not distinguish its three connection types');
    const pipe=document.querySelector('[data-edge] .pipe-current')||legend.querySelector('.pipe-current');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    assert(getComputedStyle(pipe).animationName===(reduced?'none':'pipe-current'),'Flow animation did not respect the motion preference');
    if(!reduced){
      await click(document.querySelector('[aria-label="Pause flow animation"]'));
      assert(getComputedStyle(pipe).animationPlayState==='paused','Legend did not pause flow motion');
      await click(document.querySelector('[aria-label="Resume flow animation"]'));
      assert(getComputedStyle(pipe).animationPlayState==='running','Legend did not resume flow motion');
    }
    if(innerWidth<=620)await click(legendButton);
    else {
      const overlay=legend.closest('section').getBoundingClientRect();
      for(const item of document.querySelectorAll('[data-item]')){
        const card=item.getBoundingClientRect();
        assert(card.right<=overlay.left||card.left>=overlay.right||card.bottom<=overlay.top||card.top>=overlay.bottom,'Legend covers a resource in the initial view');
      }
    }
  }
  const icons=[...new Set([...document.querySelectorAll('.service-icon')].map(e=>e.getAttribute('src')))];
  for(const uri of icons){
    assert(uri.startsWith('data:image/svg+xml;base64,'),'Icon is not embedded');
    await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth?resolve():reject(Error('Empty AWS icon'));image.onerror=()=>reject(Error('AWS icon did not load offline'));image.src=uri;});
  }
  if(graph.nodes.some(n=>/^aws:(s3|lambda|iam|ecs|apigatewayv2|ec2|cloudwatch|sqs|sns|dynamodb|sfn|opensearch)\//.test(n.type)))assert(icons.length,'Missing AWS service icons');
  await checkRoutes();
  if(innerWidth>620)for(const label of document.querySelectorAll('.edge-label')){
    const box=label.getBoundingClientRect();
    assert(box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,'Initial flow label outside viewport');
  }
  const plannedFlow=graph.edges.filter(e=>(!e.state||e.state==='after')&&['triggers','connects_to'].includes(e.kind));
  if(plannedFlow.length){
    assert($('flow-view').getAttribute('aria-pressed')==='true','Flow did not open by default');
    const endpoints=new Set(plannedFlow.flatMap(e=>[e.from,e.to]));
    for(const group of document.querySelectorAll('[data-service]')){
      const toggle=card(group).querySelector('[data-toggle]');
      assert(toggle.getAttribute('aria-expanded')==='false','Flow service group should start collapsed');
      await click(toggle);
    }
    await expandConnectionGroups();
    assert($('summary').textContent.includes(endpoints.size+' in flow · '+graph.nodes.length+' total'),'Incorrect Flow counts');
    assert([...document.querySelectorAll('[data-node]')].every(n=>endpoints.has(n.dataset.node)),'Flow contains an unrelated resource');
    const shown=[...document.querySelectorAll('[data-edge]')].reduce((n,e)=>n+(+e.dataset.count),0);
    assert(shown===plannedFlow.length,'Configured flow connections are missing');
    if(location.search==='?desktop'){
      const handle=document.querySelector('[data-drag-handle]');
      if(handle){
        const id=handle.dataset.dragHandle;
        const getHandle=()=>[...document.querySelectorAll('[data-drag-handle]')].find(h=>h.dataset.dragHandle===id);
        const getCard=()=>getHandle().closest('[data-diagram-card]');
        const shift=()=>getCard().getBoundingClientRect();
        const zoom=new DOMMatrix(view()).a;
        const key=(key)=>dispatch(getHandle(),new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
        const initialCard=shift();
        await key('Enter');await key('ArrowLeft');await key('Enter');
        const dropped=shift();
        assert(Math.abs(dropped.left-initialCard.left+12*zoom)<.5,'Keyboard drop did not move the card');
        const toggle=document.querySelector('[data-toggle]').dataset.toggle;
        const root=()=>[...document.querySelectorAll('[data-toggle]')].find(t=>t.dataset.toggle===toggle);
        await click(root());
        assert(!getHandle(),'Collapse left a movable card visible');
        await click(root());
        assert(Math.abs(shift().left-dropped.left)<.5,'Reopening lost the manual position');
        const rapid=root();
        rapid.click();rapid.click();
        await waitForLayout();
        assert(root().getAttribute('aria-expanded')==='true','Rapid toggles settled in the wrong state');
        const dragTarget=getHandle();
        dragTarget.setPointerCapture=()=>{};
        const rect=dragTarget.getBoundingClientRect();
        const pointer=(kind,dx)=>dragTarget.dispatchEvent(new PointerEvent(kind,{
          bubbles:true,isPrimary:true,pointerId:4,button:0,clientX:rect.x+10+dx,clientY:rect.y+10,
        }));
        pointer('pointerdown',0);pointer('pointermove',-600);pointer('pointerup',-600);
        await waitForLayout();
        assert(Math.abs(shift().left-dropped.left)<.5,'Invalid pointer drop changed the saved position');
        pointer('pointerdown',0);pointer('pointermove',12*zoom);pointer('pointerup',12*zoom);
        await waitForLayout();
        assert(Math.abs(shift().left-initialCard.left)<.5,'Valid pointer drop did not follow the pointer');
        await checkRoutes();
      }
    }
    const flowEdges=[...document.querySelectorAll('[data-edge]')];
    const flowCards=[...document.querySelectorAll('[data-node]')];
    const focusCard=flowCards.find(card=>flowEdges.some(edge=>[edge.dataset.from,edge.dataset.to].includes(card.dataset.node)));
    if(focusCard){
      const grid=getComputedStyle($('stage')).backgroundImage;
      await click(focusCard);
      const selectedStyle=getComputedStyle(focusCard);
      checkStatusBorder(selectedStyle,focusCard.dataset.change);
      assert(selectedStyle.outlineStyle==='solid'&&selectedStyle.outlineWidth==='2px','Selected card lost its outline');
      for(const element of [...flowEdges,...flowCards]){
        for(const animation of element.getAnimations())if(animation instanceof CSSTransition)animation.finish();
      }
      const neighbors=new Set([focusCard.dataset.node]);
      for(const edge of flowEdges){
        const incident=[edge.dataset.from,edge.dataset.to].includes(focusCard.dataset.node);
        if(incident){neighbors.add(edge.dataset.from);neighbors.add(edge.dataset.to);}
        assert(+getComputedStyle(edge).opacity===(incident?1:.08),'Wrong arrow opacity in object focus: '+getComputedStyle(edge).opacity+' '+edge.getAttribute('class')+' incident='+incident+' connected='+edge.isConnected);
        const caption=edgeLabel(edge);
        if(caption)assert(+getComputedStyle(caption).opacity===(incident?1:.08),'Arrow label did not follow object focus');
        const stream=edge.querySelector('.pipe-current');
        if(!incident&&stream)assert(getComputedStyle(stream).animationPlayState==='paused','Unrelated arrow is still animated');
      }
      for(const node of flowCards){
        assert(+getComputedStyle(node).opacity===(neighbors.has(node.dataset.node)?1:.25),'Wrong card opacity in object focus');
        assert(node.classList.contains('selected')===(node===focusCard),'Object focus selected an adjacent resource');
      }
      assert(getComputedStyle($('stage')).backgroundImage!==grid,'Object focus did not dim the grid');
      await click(close());
      assert(getComputedStyle($('stage')).backgroundImage===grid,'Closing details did not restore the grid');
    }
    const connection=document.querySelector('[data-edge]');
    await dispatch(connection,new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    assert(inspector()&&$('details').textContent.includes('Evidence'),'Connection evidence is inaccessible');
    await click($('clear-selection'));
    for(const connection of document.querySelectorAll('[data-edge]')){
      const proofs=plannedFlow.filter(e=>e.from===connection.dataset.from&&e.to===connection.dataset.to&&connection.classList.contains(e.kind)).flatMap(e=>e.evidence).filter(p=>p.label||p.details);
      if(!proofs.length)continue;
      await dispatch(connection,new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      for(const section of accordionItems().filter(opened))await expandRelationGroups(section);
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
    assert(view()===initial,'Expansion changed camera');await checkRoutes();
    const replacement=[...document.querySelectorAll('[data-toggle]')].find(e=>e.dataset.toggle===toggle.dataset.toggle);
    assert(replacement.getAttribute('aria-expanded')!==open,'Group did not toggle');
    await dispatch(replacement,new MouseEvent('click',{bubbles:true}));
    const item=document.querySelector('[data-item]');
    item.focus();
    await dispatch(item,new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    assert(inspector(),'Keyboard inspection failed');
    assert(document.activeElement===close(),'Modal did not receive focus');
    $('zoom-in').focus();
    assert(document.activeElement===$('zoom-in'),'Inspector trapped focus on the diagram');
    assert(view()===initial,'Inspection changed camera');
    close().focus();
    await dispatch(close(),new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert(!inspector()&&document.activeElement===item,'Escape path did not restore focus');
    assert(!document.querySelector('#diagram .selected, #diagram .muted'),'Closing left diagram items highlighted');

    const group=document.querySelector('[data-group]');
    await click(group);
    const groupTitle=title();
    assert(!back(),'Back is available on the initial details');
    const members=accordionItems()[0];
    assert(inspector()&&trigger(members)?.textContent.startsWith('Resources in group'),'Group members missing from modal');
    assert(!opened(members),'Group accordion should start closed');
    await click(trigger(members));
    assert(opened(members),'Group accordion could not be opened');
    if(group.dataset.item.startsWith('stack:')){
      const stack=group.dataset.item.slice('stack:'.length);
      const shownMembers=new Set([...document.querySelectorAll('[data-item]')].map(item=>item.dataset.item));
      const resources=new Set(graph.nodes.filter(node=>(node.stack||'No stack')===stack&&(!plannedFlow.length||shownMembers.has(node.id)||shownMembers.has('group:'+node.id)||node.stackRoot)).map(node=>node.id));
      const within=graph.edges.find(edge=>edge.kind!=='contains'&&(!edge.state||edge.state==='after')&&resources.has(edge.from)&&resources.has(edge.to));
      if(within){
        const relationNames={triggers:'Events / invocations',connects_to:'Configuration references',depends_on:'Deployment dependencies'};
        const section=accordionItems().find(item=>trigger(item).textContent.startsWith(relationNames[within.kind]));
        assert(section,'Missing internal relationship section');
        await click(trigger(section));
        await expandRelationGroups(section);
        assert([...section.querySelectorAll('.connection-item')].some(button=>button.textContent.includes('within group')),'Missing internal group relationship');
        await click(trigger(section));
      }
    }
    const memberNames=[...members.querySelectorAll('[data-member-id]')];
    assert(memberNames.length,'Group has no resource rows');
    for(const name of memberNames){
      const resource=graph.nodes.find(node=>node.id===name.dataset.memberId);
      const button=name.closest('button');
      assert(resource&&name.textContent===resource.name,'Group row lost the full resource name');
      assert(button.textContent.includes(resource.type),'Group row is missing the resource type');
      assert(name.scrollWidth<=name.clientWidth+1,'Resource name overflows its row');
    }
    const memberNameElement=memberNames.find(name=>graph.nodes.some(node=>!node.stackRoot&&node.id===name.dataset.memberId));
    if(memberNameElement){
      const member=memberNameElement.closest('button');
      const memberName=memberNameElement.textContent;
      await click(member);
      assert(inspector()&&title()===memberName,'Group member did not open in the same dialog');
      assert(document.activeElement===close(),'New modal content did not receive focus');
      const sections=accordionItems();
      const references=sections.find(section=>trigger(section).textContent.startsWith('Configuration references'));
      const links=references||sections.find(section=>!trigger(section).textContent.startsWith('Resources in group'));
      if(links){
        assert(!opened(links),'Resource connection accordion should start closed');
        await click(trigger(links));
        await expandRelationGroups(links);
        const link=links.querySelector('.connection-item');
        const linkGroup=link.closest('[data-slot="accordion-item"]');
        assert(link.scrollWidth<=link.clientWidth+1,'Connection overflows its row');
        link.scrollIntoView({block:'end'});
        const scroll=$('details').scrollTop;
        await click(link);
        assert(inspector()&&$('details').textContent.includes('Evidence'),'Connection did not open from resource details');
        assert(back(),'Connection does not offer a way back');
        await click(back());
        assert(inspector()&&title()===memberName&&opened(links),'Back did not restore resource details and its accordion');
        assert(opened(linkGroup),'Back did not restore the nested relationship group');
        assert(document.activeElement===link&&$('details').scrollTop===scroll,'Back did not restore the selected row and scroll');
      }
      assert(back(),'Resource does not offer a way back to the group');
      await click(back());
      assert(inspector()&&title()===groupTitle&&opened(members)&&document.activeElement===member,'Back did not restore group membership');
      assert(!back(),'Back is still visible after returning to the first page');
      await click(member);
      assert(back(),'Back did not become available after reopening a member');
    }
    assert(!document.querySelector('[data-slot="dialog-overlay"]'),'Inspector creates a backdrop');
    assert(document.body.style.pointerEvents!=='none','Inspector blocks diagram interaction');
    const beforeWindowZoom=view();
    await click($('zoom-in'));
    assert(inspector()&&view()!==beforeWindowZoom,'Zoom did not work while the inspector was open');

    const grip=dialog().querySelector('[data-window-grip]');
    const header=grip.closest('header');
    const beforeDrag=dialog().getBoundingClientRect();
    const handle=grip.getBoundingClientRect();
    const startX=handle.x+handle.width/2,startY=handle.y+handle.height/2;
    const dx=innerWidth>620?-110:0,dy=innerWidth>620?40:-76;
    // A synthetic pointer cannot register capture with Chromium. Record the request for this gesture.
    let captured=false;
    header.setPointerCapture=()=>{captured=true;};
    header.hasPointerCapture=()=>captured;
    header.releasePointerCapture=()=>{captured=false;};
    const dragEvent=(target,type,x,y)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,isPrimary:true,button:0,pointerId:21,clientX:x,clientY:y}));
    dragEvent(grip,'pointerdown',startX,startY);
    assert(captured,'Window did not capture its drag pointer');
    dragEvent(header,'pointermove',startX+dx,startY+dy);
    const during=dialog().getBoundingClientRect();
    assert(Math.abs(during.x-beforeDrag.x-dx)<1&&Math.abs(during.y-beforeDrag.y-dy)<1,'Inspector did not track the drag directly');
    dragEvent(header,'pointerup',startX+dx,startY+dy);
    assert(!captured&&inspector(),'Drag release lost the inspector or left pointer capture');
    await wait(650);
    const settled=dialog().getBoundingClientRect();
    assert(settled.left>=0&&settled.top>=0&&settled.right<=innerWidth&&settled.bottom<=innerHeight,'Inspector settled outside the viewport');

    const keyboardStart=settled.y;
    grip.focus();
    await dispatch(grip,new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
    assert(dialog().getBoundingClientRect().y<keyboardStart,'Keyboard could not move the inspector');
    await dispatch(grip,new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
    const reset=dialog().getBoundingClientRect();
    assert(Math.abs(reset.x-beforeDrag.x)<1&&Math.abs(reset.y-beforeDrag.y)<1,'Home did not reset inspector position');

    await click(close());
    assert(!inspector()&&document.activeElement.hasAttribute('data-item'),'Close did not restore graph focus');

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
      for(let attempt=0;attempt<25&&getToggle().getAttribute('aria-expanded')===isExpanded&&!inspector();attempt++)await wait(20);
      await waitForLayout();
      assert(!inspector(),'Group −/+ opened details');
      assert(getToggle().getAttribute('aria-expanded')!==isExpanded,'Group −/+ did not toggle');
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
    const flowItems=new Set([...document.querySelectorAll('[data-item]')].map(item=>item.dataset.item));
    const hiddenResources=plannedFlow.length ? graph.nodes.filter(n=>!n.stackRoot&&!flowItems.has(n.id)&&!flowItems.has('group:'+n.id)) : [];
    const outsideFlow=hiddenResources.find(n=>graph.nodes.some(other=>other.name===n.name&&flowItems.has(other.id)))??hiddenResources[0];
    if(outsideFlow){
      $('search').value=outsideFlow.name;await dispatch($('search'),new Event('input',{bubbles:true}));
      const result=[...$('results').querySelectorAll('button')].find(b=>b.dataset.resource===outsideFlow.id);
      assert(result?.textContent.includes(outsideFlow.type),'Search result does not identify the resource type');
      await click(result);
      assert($('infra-view').getAttribute('aria-pressed')==='true'&&inspector()&&title()===outsideFlow.name,'Search did not reveal the resource in Infrastructure');
      await click(close());
      const owningGroup=[...document.querySelectorAll('[data-service]')].find(g=>g.getAttribute('aria-label')&&card(g).querySelector('[data-toggle]').getAttribute('aria-expanded')==='true');
      if(owningGroup)await click(card(owningGroup).querySelector('[data-toggle]'));
      await click($('flow-view'));
    }
    if(plannedFlow.length&&!graph.edges.some(e=>(!e.state||e.state==='before')&&['triggers','connects_to'].includes(e.kind))){
      const select=$('topology');
      select.value='before';await dispatch(select,new Event('change',{bubbles:true}));
      assert(!$('empty').hidden&&$('empty').textContent==='No configured connections'&&!document.querySelector('[data-item]'),'Before view drew unrelated resources');
      select.value='after';await dispatch(select,new Event('change',{bubbles:true}));
    }
    await click($('infra-view'));
    assert($('summary').textContent.startsWith(graph.nodes.length+' resource'),'Incorrect Infrastructure count');
    if(graph.nodes.every(n=>n.change==='create'))assert($('summary').textContent.includes('+ create '+graph.nodes.length),'Incorrect create count');
    const infraViewport=view();
    const serviceGroups=[...document.querySelectorAll('[data-service]')];
    for(const group of serviceGroups){
      const id=group.dataset.item,toggle=card(group).querySelector('[data-toggle]');
      assert(toggle.getAttribute('aria-expanded')==='false','Service group is initially expanded');
      checkCardChange(group,group.dataset.change);
      const visibleNodes=new Set([...document.querySelectorAll('[data-node]')].map(n=>n.dataset.node));
      const visibleSubgroups=new Set([...document.querySelectorAll('[data-connection-group]')].map(n=>n.dataset.item));
      if(group.dataset.service.startsWith('aws:')&&group.querySelector('.service-icon'))assert(group.querySelector('.service-icon').getAttribute('aria-hidden')==='true','Icon is not decorative');
      await dispatch(toggle,new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      const expanded=[...document.querySelectorAll('[data-item]')].find(g=>g.dataset.item===id);
      assert(card(expanded).querySelector('[data-toggle]').getAttribute('aria-expanded')==='true','Service group did not expand');
      checkStatusBorder(getComputedStyle(card(expanded).firstElementChild),expanded.dataset.change);
      await expandConnectionGroups(visibleSubgroups);
      const members=[...document.querySelectorAll('[data-node]')].filter(n=>!visibleNodes.has(n.dataset.node));
      const statuses=new Set(members.map(node=>node.dataset.change||'unchanged'));
      assert(statuses.size===1&&statuses.has(group.dataset.change||'unchanged'),'Service group members have inconsistent change statuses');
      if(group.dataset.service==='aws:lambda'&&graph.nodes.filter(n=>n.service==='lambda').length===4){
        const lambdaNodes=graph.nodes.filter(n=>n.service==='lambda');
        if(lambdaNodes.filter(n=>n.type.endsWith(':Function')).length===2&&lambdaNodes.filter(n=>n.type.endsWith(':Permission')).length===2){
          assert(group.textContent.includes('4 resources'),'Lambda card does not count all Lambda resources');
          for(const node of lambdaNodes)assert(document.querySelectorAll('[data-node="'+node.id+'"]').length===1,'Lambda resource missing or duplicated');
        }
      }
      assert(view()===infraViewport,'Service expansion changed camera');await checkRoutes();
      await dispatch(card(expanded).querySelector('[data-toggle]'),new MouseEvent('click',{bubbles:true}));
    }
    const beforeMode=view();
    await checkRoutes();
    await click($('dependencies'));assert(view()===beforeMode,'Filter changed camera');assert(!document.querySelector('[data-edge].depends_on'),'Dependency filter left deployment edges visible');await click($('dependencies'));
    await click($('zoom-in'));assert(view()!==beforeMode,'Zoom failed');
    if(location.search.includes('parallel')){
      const legendWasHidden=legend.hidden;
      if(legendWasHidden)await click(legendButton);
      const entryFor=kind=>legend.querySelector('[data-connection-kind="'+kind+'"]');
      const edgesOf=kind=>document.querySelectorAll('[data-edge].'+kind);
      const kinds=['triggers','connects_to','depends_on'];
      const cardCount=document.querySelectorAll('[data-item]').length;
      assert(kinds.every(kind=>edgesOf(kind).length===1),'Test diagram is missing a connection kind');
      for(const [index,kind] of kinds.entries()){
        const entry=entryFor(kind);
        await click(entry);
        assert(entry.getAttribute('aria-pressed')==='false'&&getComputedStyle(entry).filter==='grayscale(1)','Hidden connection is not greyed out in the legend');
        assert(edgesOf(kind).length===0,'Legend left a hidden connection visible: '+kind);
        assert(kinds.slice(index+1).every(other=>edgesOf(other).length===1),'Legend hid another connection kind');
        const sample=entry.querySelector('.pipe-current');
        if(sample)assert(getComputedStyle(sample).animationPlayState==='paused','Hidden legend sample is still animated');
      }
      assert(document.querySelectorAll('[data-item]').length===cardCount,'Hiding all connections removed cards');
      assert($('dependencies').getAttribute('aria-checked')==='false','Legend state did not reach the dependency filter');
      for(const kind of kinds)await click(entryFor(kind));
      assert(kinds.every(kind=>edgesOf(kind).length===1),'Legend did not restore every connection');
      await click($('dependencies'));
      assert(entryFor('depends_on').getAttribute('aria-pressed')==='false','Dependency filter state did not reach the legend');
      await click($('dependencies'));
      if(legendWasHidden)await click(legendButton);
    }
    await click($('fit'));
    await wait(150);
    const rendered=[...document.querySelectorAll('[data-edge]')];
    const kindLabels={triggers:'Events / invocations',connects_to:'Configuration references',depends_on:'Deployment dependencies'};
    const kindLabel=edge=>kindLabels[[...edge.classList].find(kind=>kindLabels[kind])];
    if(location.search.includes('parallel')){
      assert(rendered.length===3,'Missing parallel arrows');
      const appearance=new Set(rendered.map(edge=>{
        const wire=getComputedStyle(edge.querySelector('.wire'));
        return [wire.stroke,wire.strokeDasharray,wire.strokeWidth].join('/');
      }));
      assert(appearance.size===3,'Parallel routes lack distinct appearances');
      for(const edge of rendered.filter(edge=>!edge.classList.contains('depends_on'))){
        const wire=edge.querySelector('.wire');
        const stream=edge.querySelector('.pipe-current');
        const shell=edge.querySelector('.pipe-wall');
        const channel=edge.querySelector('.pipe-channel');
        const rim=edge.querySelector('.pipe-rim');
        const shadow=edge.querySelector('.pipe-shadow');
        const width=path=>parseFloat(getComputedStyle(path).strokeWidth);
        assert(shell&&channel&&rim&&shadow,'Pipe is missing its dimensional layers');
        assert([shell,channel,wire,stream].every(path=>path.getAttribute('d')===wire.getAttribute('d')),'Data or wall detached from the connection');
        assert([shell,channel,wire].every(path=>getComputedStyle(path).strokeDasharray==='none'),'Pipe body is broken into segments');
        assert(width(shell)>width(channel)&&width(channel)>width(wire)&&width(wire)>width(stream),'Animated data does not sit inside the channel');
        assert([shell,channel,rim,shadow,stream].every(path=>getComputedStyle(path).pointerEvents==='none'),'Decorative layers intercept pointer input');
      }
      assert(!document.querySelector('[data-edge].depends_on .pipe-current'),'Deployment dependency incorrectly shows flowing data');
      for(const edge of rendered){
        const path=edge.querySelector('.wire'),screen=path.getPointAtLength(path.getTotalLength()-6).matrixTransform(path.getScreenCTM());
        const target=document.elementFromPoint(screen.x,screen.y);
        assert(target?.closest('[data-edge]')===edge,'Parallel tip cannot be clicked independently');
        await clickAt(target,screen.x,screen.y);
        assert(inspector()&&accordionItems().length===1&&trigger(accordionItems()[0]).textContent.startsWith(kindLabel(edge)),'Tip opened the wrong relationship');
        await click(close());
      }
      const path=rendered[0].querySelector('.wire');
      const start=path.getPointAtLength(path.getTotalLength()-6).matrixTransform(path.getScreenCTM());
      const target=document.elementFromPoint(start.x,start.y),before=view();
      const mouse=(element,type,offset,buttons)=>element.dispatchEvent(new MouseEvent(type,{
        bubbles:true,view:window,button:0,buttons,clientX:start.x+offset,clientY:start.y+offset,
      }));
      mouse(target,'mousedown',0,1);
      mouse(window,'mousemove',32,1);
      mouse(window,'mouseup',32,0);
      await wait(50);
      assert(view()!==before&&!inspector(),'Dragging from a connection did not pan the diagram');
      await click($('fit'));
    }
    shared: for(const edge of rendered){
      const path=edge.querySelector('.wire');
      for(const fraction of [.25,.5,.75]){
        const p=path.getPointAtLength(path.getTotalLength()*fraction),screen=p.matrixTransform(path.getScreenCTM());
        const target=document.elementFromPoint(screen.x,screen.y);
        if(!target?.closest('[data-edge]'))continue;
        const event=new MouseEvent('click',{bubbles:true,clientX:screen.x,clientY:screen.y});
        const eventPoint=new DOMPoint(event.clientX,event.clientY).matrixTransform(path.getScreenCTM().inverse());
        const matches=rendered.filter(g=>g===target.closest('[data-edge]')||g.querySelector('.react-flow__edge-interaction').isPointInStroke(eventPoint));
        const expected=new Set(matches.map(kindLabel));
        if(expected.size<2)continue;
        const expectedCount=matches.reduce((count,g)=>count+(+g.dataset.count),0);
        await dispatch(target,event);
        assert(inspector()&&title()==='Connections at this point ('+expectedCount+')','Shared route lost original connections: expected '+expectedCount+', got '+title());
        for(const kind of expected){
          const section=accordionItems().find(section=>trigger(section).textContent.startsWith(kind));
          assert(section&&!opened(section),'Shared route lost a collapsed relationship type');
          await click(trigger(section));
          await expandRelationGroups(section);
          assert(opened(section)&&section.querySelector('code'),'Shared route lost evidence');
        }
        await click(close());
        await dispatch(edge,new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        assert(trigger(accordionItems()[0]).textContent.startsWith(kindLabel(edge))&&accordionItems().length===1,'Keyboard did not inspect the focused relationship');
        await click(close());
        break shared;
      }
    }

    const lambda=graph.nodes.find(node=>node.provider==='aws'&&node.service==='lambda');
    if(lambda){
      const filterButton=document.querySelector('[aria-controls="search-filters"]');
      const filterPanel=$('search-filters'),search=$('search'),results=$('results');
      const resultButtons=()=>[...results.querySelectorAll('button[data-resource]')];
      const action=(panel,label)=>[...panel.querySelectorAll('button')].find(button=>button.textContent===label);
      const key=(target,key)=>dispatch(target,new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
      const update=async value=>{
        search.value=value;
        await dispatch(search,new Event('input',{bubbles:true}));
      };
      const snapshot=()=>JSON.stringify([view(),[...document.querySelectorAll('[data-item]')].map(node=>node.dataset.item)]);
      const beforeSearch=snapshot();
      const changeLabels={create:'+ create',update:'~ update',delete:'− delete',replace:'↻ replace',unchanged:'Unchanged'};
      if(search.value)await click(document.querySelector('[aria-label="Clear search"]'));
      await click(filterButton);
      assert(!filterPanel.hidden&&filterButton.getAttribute('aria-expanded')==='true','Search filters did not open');
      const panel=filterPanel.getBoundingClientRect();
      assert(panel.left>=0&&panel.right<=innerWidth&&panel.bottom<=innerHeight,'Search filters overflowed the viewport');
      for(const [index,value] of ['Lambda',lambda.stack||'No stack',changeLabels[lambda.change||'unchanged']].entries()){
        const label=[...filterPanel.querySelectorAll('fieldset')[index].querySelectorAll('label')].find(label=>label.children[label.children.length-2]?.textContent===value);
        assert(label?.control,'Search filter is missing '+value);
        if(index===0){
          const [icon,name,count]=label.children;
          assert(icon?.src.startsWith('data:image/svg+xml;base64,'),'Missing offline icon on service filter');
          const center=element=>{const rect=element.getBoundingClientRect();return rect.top+rect.height/2;};
          assert([label.control,icon,name,count].every(element=>Math.abs(center(element)-center(label))<1),'Service filter contents are not vertically aligned');
          assert(count.getBoundingClientRect().left>name.getBoundingClientRect().right,'Service count is not separated from its label');
        }
        await click(label.control);
      }
      assert(filterButton.getAttribute('aria-label').includes('3 active'),'Search filters did not report the active count');
      await click(action(filterPanel,'Show results'));
      const expected=graph.nodes.filter(node=>node.provider==='aws'&&node.service==='lambda'&&
        (node.stack||'')===(lambda.stack||'')&&(node.change||'unchanged')===(lambda.change||'unchanged'));
      const pageCount=Math.min(expected.length,50);
      assert(!results.hidden&&resultButtons().length===pageCount,'Filters did not produce results with an empty query');
      assert(resultButtons().every(button=>expected.some(node=>node.id===button.dataset.resource)),'Search results did not combine the three filters');
      await update('lamdba');
      assert(resultButtons().length===pageCount&&resultButtons()[0]?.querySelector('img')?.src.startsWith('data:image/svg+xml;base64,'),'Fuzzy service query lost filtered or offline results');
      await update('qqzzqqzz');
      assert(results.querySelector('[role="status"]').textContent==='No resources found.','Search has no empty state');
      await click(document.querySelector('[aria-label="Clear search"]'));
      assert(search.value===''&&resultButtons().length===pageCount,'Clearing search did not retain filters');
      assert(snapshot()===beforeSearch,'Search filters changed the diagram');
      await key(search,'ArrowDown');
      assert(document.activeElement===resultButtons()[0],'ArrowDown did not focus the first search result');
      await key(document.activeElement,'ArrowUp');
      assert(document.activeElement===search,'ArrowUp did not return to the search field');
      await key(search,'Escape');
      assert(results.hidden&&document.activeElement===search,'Escape did not dismiss search');
      await key(search,'ArrowDown');
      assert(document.activeElement===resultButtons()[0],'ArrowDown did not reopen search and focus results');
      const match=expected.find(node=>node.id===resultButtons()[0].dataset.resource);
      await key(document.activeElement,'ArrowUp');
      await key(search,'Enter');
      assert(inspector()&&title()===match.name,'Enter did not open the first result');
      await click(close());
      await click(filterButton);
      await click(action(filterPanel,'Clear filters'));
      await click(action(filterPanel,'Show results'));
      assert(filterPanel.hidden&&results.hidden&&filterButton.getAttribute('aria-label')==='Search filters','Reset did not clear search filters');
    }
    for(const target of graph.nodes){
      $('search').value=target.name;await dispatch($('search'),new Event('input',{bubbles:true}));
      const searchButtons=()=>[...$('results').querySelectorAll('button')];
      let result=searchButtons().find(button=>button.dataset.resource===target.id);
      while(!result){
        const next=searchButtons().find(button=>button.textContent==='Next'&&!button.disabled);
        if(!next)break;
        await click(next);
        result=searchButtons().find(button=>button.dataset.resource===target.id);
      }
      assert(result,'Resource not searchable: '+target.name);await click(result);
      assert(inspector()&&title()===target.name,'Search reveal failed: '+target.name);
      assert(!back(),'History leaked into a new modal');
      assert(document.activeElement===close(),'Search did not focus modal');
      await click(close());
      assert(document.activeElement.hasAttribute('data-item'),'Search resource did not receive focus after modal closed');
      const body=document.activeElement.matches('.body')&&document.activeElement;
      if(body){body.blur();checkCardChange(body,body.dataset.group?body.dataset.change:target.change);}
    }
    await checkRoutes();
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
  }
  await wait(150);
  assert(!window.__qaErrors.length,'Runtime error: '+window.__qaErrors.join(';'));
  assert(!window.__qaCSP.length,'Blocked resource requests: '+window.__qaCSP.join(';'));
  assert(!performance.getEntriesByType('resource').some(e=>/^https?:/.test(e.name)),'HTTP resource request');
  const output=document.createElement('output');output.id='qa-result';output.hidden=true;
  output.textContent=JSON.stringify({ok:true,resources:graph.nodes.length,visible:document.querySelectorAll('[data-item]').length,connections:graph.edges.filter(e=>['triggers','connects_to'].includes(e.kind)).length,width:innerWidth});document.body.append(output);
} catch(error) {
  const output=document.createElement('output');output.id='qa-result';output.hidden=true;output.textContent=JSON.stringify({ok:false,error:error.message,location:error.stack?.split('\n').at(-1)});document.body.append(output);
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
    with tempfile.TemporaryDirectory(prefix='laytrace-html-check-') as folder:
        path = Path(folder) / 'check.html'
        data_pattern = r'(<script id="laytrace-data" type="application/json">)(.*?)(</script>)'
        source_graph = json.loads(re.search(data_pattern, original, re.S).group(2))
        long_graph = json.loads(json.dumps(source_graph))
        changes = ('create', 'delete', 'update', 'replace', 'unchanged')
        for index, node in enumerate(long_graph['nodes']):
            node['change'] = changes[index % len(changes)]
            node['name'] = 'WWWWWWWWWWWWWWWWWWWWWWWWWWWW 中文 ' + node['name'] + ' bardzo-długa-nazwa' * 8
        mobile_graph = json.loads(json.dumps(long_graph))
        for edge in mobile_graph['edges']:
            for proof in edge['evidence']:
                proof['details'] = (proof.get('details') or '') + '\n' + '\n'.join(['Long configuration value'] * 50)
        empty_graph = {'schemaVersion': 1, 'nodes': [], 'edges': []}
        parallel_graph = {'schemaVersion': 1, 'nodes': [{'id': key, 'name': key, 'type': 'test:resource:Resource', 'stack': 'shared/dev', 'change': 'create' if key == 'source' else 'delete'} for key in ['source', 'target']], 'edges': [{'from': 'source', 'to': 'target', 'kind': kind, 'evidence': [{'source': 'test', 'property': kind}]} for kind in ['triggers', 'connects_to', 'depends_on']]}
        scope_graph = {
            'schemaVersion': 1,
            'nodes': [{'id': key, 'name': key, 'type': 'test:resource:Resource',
                       'stack': 'app' if key == 'source' else 'other'}
                      for key in ['source', 'target', 'indirect', 'unrelated']],
            'edges': [{'from': source, 'to': target, 'kind': 'triggers', 'evidence': []}
                      for source, target in [('source', 'target'), ('target', 'indirect'), ('unrelated', 'indirect')]],
        }
        queue = {'id': 'queue', 'name': 'Benchmark queue', 'stack': 'benchmark/dev', 'type': 'aws:sqs/queue:Queue', 'provider': 'aws', 'service': 'sqs'}
        lambdas = [
            {'id': f'lambda-{i:03}', 'name': f'Benchmark Lambda {i:03}', 'stack': queue['stack'],
             'type': 'aws:lambda/function:Function', 'provider': 'aws', 'service': 'lambda'}
            for i in range(220)
        ]
        dense_graph = {
            'schemaVersion': 1, 'nodes': [queue, *lambdas],
            'edges': [{'from': queue['id'], 'to': node['id'], 'kind': 'triggers',
                       'evidence': [{'source': 'benchmark', 'property': 'EventSource'}]} for node in lambdas],
        }
        queues = [dict(queue, id=f'queue-{i}', stack='preview', change=change)
                  for i, change in enumerate(('update', 'update', 'delete', 'create'))]
        mixed_graph = {
            'schemaVersion': 1,
            'nodes': [*queues, dict(lambdas[0], stack='preview', change='replace')],
            'edges': [{'from': node['id'], 'to': lambdas[0]['id'], 'kind': 'triggers',
                       'evidence': [{'source': 'test', 'property': 'EventSource'}]} for node in queues],
        }
        scenarios = [('zoomed-drag', 1440, 900, mobile_graph, False), ('desktop', 1440, 1000, source_graph, False), ('mobile', 390, 844, source_graph, False), ('long-reduced', 1440, 1000, long_graph, True), ('long-mobile', 390, 844, mobile_graph, False), ('empty', 390, 844, empty_graph, False), ('dense-viewer', 1440, 1000, dense_graph, False), ('parallel-desktop', 1440, 1000, parallel_graph, False), ('parallel-mobile', 390, 844, parallel_graph, False), ('mixed-changes-desktop', 1440, 1000, mixed_graph, False), ('mixed-changes-mobile', 390, 844, mixed_graph, False)]
        scenarios.extend([('connection-scope-desktop', 1440, 1000, scope_graph, False),
                          ('connection-scope-mobile', 390, 844, scope_graph, False)])
        for name, width, height, graph, reduced in scenarios:
            data = json.dumps(graph).replace('<', r'\u003c').replace('>', r'\u003e').replace('&', r'\u0026')
            document = re.sub(data_pattern, lambda m: m.group(1) + data + m.group(3), original, flags=re.S)
            path.write_text(document.replace('<script id="laytrace-data"', instrument + '<script id="laytrace-data"', 1).replace('</body>', CHECK + '</body>', 1))
            screenshot = Path(tempfile.gettempdir()) / f'laytrace-{name}.png'
            command = [sys.argv[2], '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--user-data-dir=' + str(Path(folder) / f'profile-{name}'), f'--window-size={width},{height}', '--virtual-time-budget=15000', '--dump-dom']
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
