export const CARD = {width:244,height:94};
const GAP=28, PADDING=20, HEADER=48;
const compare=(a,b)=>a.id.localeCompare(b.id);
export const isFlow=e=>e.kind==='triggers'||e.kind==='connects_to';
export const activeEdges=(graph,state='after')=>graph.edges.filter(e=>!e.state||e.state===state);

const services={
  s3:['S3','#39afa4'],lambda:['Lambda','#cf9c66'],iam:['IAM','#c8799e'],ecs:['ECS','#829bd4'],
  'api-gateway':['API Gateway','#aa8dd0'],ec2:['EC2','#6da7af'],cloudwatch:['CloudWatch','#bc87b8'],
  eventbridge:['EventBridge','#bf83a0'],sqs:['SQS','#c7a05d'],sns:['SNS','#ce8fa6'],
  dynamodb:['DynamoDB','#729bd0'],'step-functions':['Step Functions','#a38bce'],opensearch:['OpenSearch','#8a9ed7']
};
export function serviceFor(type=''){
  const [provider,module='']=type.split(':'),namespace=module.split('/')[0];
  if(provider!=='aws')return {id:provider||'unknown',name:provider?provider[0].toUpperCase()+provider.slice(1):'Unknown',icon:null,color:'#91a5bd'};
  let id=namespace;
  if(namespace==='apigateway'||namespace==='apigatewayv2')id='api-gateway';
  if(namespace==='sfn')id='step-functions';
  if(namespace==='cloudwatch'&&/^event(Rule|Target)(:|$)/.test(module.split('/')[1]||''))id='eventbridge';
  const service=services[id];
  return {id:'aws:'+id,name:service?.[0]||namespace||'AWS',icon:service?id:null,color:service?.[1]||'#91a5bd'};
}

// Descriptions belong to evidence; grouping must not discard individual routes or filters.
export function flowDescriptions(edges){
  const descriptions=new Map();
  for(const edge of edges)for(const original of edge.originals||[edge])for(const proof of original.evidence||[]){
    if(proof.label||proof.details){const value={label:proof.label||'Details',details:proof.details||''};descriptions.set(JSON.stringify(value),value);}
  }
  return [...descriptions.values()].sort((a,b)=>a.label.localeCompare(b.label)||a.details.localeCompare(b.details));
}
export function edgeCaption(edge){
  const descriptions=flowDescriptions([edge]),label=descriptions[0]?.label||'';
  const text=Array.from(label),short=text.length>40?text.slice(0,39).join('')+'…':label;
  const count=edge.originals?.length||1;
  return [short+(descriptions.length>1?' +'+(descriptions.length-1):''),count>1?'×'+count:''].filter(Boolean).join(' · ');
}

// Groups are a view of ownership, not new infrastructure resources.
export function buildHierarchy(graph,state='after') {
  const edges=activeEdges(graph,state),nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  const flowIDs=new Set(edges.filter(isFlow).flatMap(e=>[e.from,e.to]));
  const parents=new Map();
  for(const e of edges)if(e.kind==='contains'&&nodes.has(e.from)&&nodes.has(e.to)&&nodes.get(e.from).stack===nodes.get(e.to).stack)parents.set(e.to,e.from);
  const parentIDs=new Set(parents.values()),items=new Map(),resourceItems=new Map(),stacks=new Map();
  const makeGroup=(id,name,stack,node=null,support=false)=>({id,name,stack,node,group:true,support,children:[],members:new Set(node?[node.id]:[]),parent:null});
  for(const n of [...graph.nodes].sort(compare)) {
    const stack=n.stack||'No stack';
    if(!stacks.has(stack)){const g=makeGroup('stack:'+stack,stack,stack);stacks.set(stack,g);items.set(g.id,g);}
    const root=stacks.get(stack);
    if(n.type==='pulumi:pulumi:Stack'){root.node=n;root.members.add(n.id);resourceItems.set(n.id,root);continue;}
    const item=parentIDs.has(n.id)?makeGroup('group:'+n.id,n.name,stack,n):{id:n.id,name:n.name,stack,node:n,group:false,members:new Set([n.id]),parent:null};
    items.set(item.id,item);resourceItems.set(n.id,item);
  }
  function attach(item,parent){item.parent=parent;parent.children.push(item);}
  for(const item of [...items.values()]) {
    if(!item.node||stacks.get(item.stack)===item)continue;
    let parent=resourceItems.get(parents.get(item.node.id));
    if(!parent?.group||parent===item)parent=stacks.get(item.stack);
    // Tolerate incomplete/malformed ownership without creating a recursive tree.
    const seen=new Set([item.node.id]);let ancestor=parents.get(item.node.id),cycle=false;
    while(ancestor){if(seen.has(ancestor)){cycle=true;break;}seen.add(ancestor);ancestor=parents.get(ancestor);}
    if(cycle)parent=stacks.get(item.stack);
    attach(item,parent);
  }
  for(const parent of [...items.values()])if(parent.group) {
    const support=parent.children.filter(c=>!c.group&&!flowIDs.has(c.node.id));
    if(!support.length)continue;
    parent.children=parent.children.filter(c=>!support.includes(c));
    const groups=new Map();
    for(const item of support){
      const service=serviceFor(item.node.type);
      let group=groups.get(service.id);
      if(!group){group=makeGroup('support:'+parent.id+':'+service.id,service.name,parent.stack,null,true);group.service=service;groups.set(service.id,group);items.set(group.id,group);attach(group,parent);}
      attach(item,group);
    }
  }
  function collect(item){if(item.group){item.children.sort(compare);for(const child of item.children)for(const id of collect(child))item.members.add(id);}return item.members;}
  const roots=[...stacks.values()].sort(compare);for(const root of roots)collect(root);
  const expanded=new Set();
  for(const item of items.values())if(item.group&&!item.support&&(roots.includes(item)||[...item.members].some(id=>flowIDs.has(id))))expanded.add(item.id);
  return {roots,items,resourceItems,edges,flowIDs,initialExpanded:expanded};
}

export function revealResource(tree,id,expanded) {
  const item=tree.resourceItems.get(id);if(!item)return null;
  for(let parent=item.parent;parent;parent=parent.parent)expanded.add(parent.id);
  return item.id;
}

export function projectGraph(tree,mode,dependencies,expanded) {
  const items=new Map(),representatives=new Map();
  function visit(item){
    const open=item.group&&expanded.has(item.id);
    const projected={...item,expanded:open,children:open?item.children.map(c=>c.id):[]};items.set(item.id,projected);
    if(!open){for(const id of item.members)representatives.set(id,item.id);}
    else {if(item.node)representatives.set(item.node.id,item.id);for(const child of item.children)visit(child);}
  }
  for(const root of tree.roots)visit(root);
  const edges=[],aggregates=new Map();
  for(const original of tree.edges){
    if(original.kind==='contains'||(mode==='flow'?!isFlow(original):original.kind==='depends_on'&&!dependencies))continue;
    const from=representatives.get(original.from),to=representatives.get(original.to);
    if(!from||!to||from===to)continue;
    const key=JSON.stringify([from,to,original.kind,original.state||'']);
    if(!aggregates.has(key)){const edge={from,to,kind:original.kind,state:original.state,originals:[]};aggregates.set(key,edge);edges.push(edge);}
    aggregates.get(key).originals.push(original);
  }
  edges.sort((a,b)=>JSON.stringify([a.from,a.to,a.kind,a.state]).localeCompare(JSON.stringify([b.from,b.to,b.kind,b.state])));
  return {items,roots:tree.roots.map(g=>g.id),edges,representatives};
}

// Tarjan collapses cycles before assigning layers. Presentation never changes edge direction.
function layers(items,edges) {
  const ids=new Set(items.map(n=>n.id)),adjacent=new Map(items.map(n=>[n.id,[]]));
  for(const e of edges)if(ids.has(e.from)&&ids.has(e.to))adjacent.get(e.from).push(e.to);
  for(const list of adjacent.values())list.sort();
  let counter=0;const index=new Map(),low=new Map(),onStack=new Set(),stack=[],components=[],component=new Map();
  function visit(v){
    index.set(v,counter);low.set(v,counter++);stack.push(v);onStack.add(v);
    for(const w of adjacent.get(v)){if(!index.has(w)){visit(w);low.set(v,Math.min(low.get(v),low.get(w)));}else if(onStack.has(w))low.set(v,Math.min(low.get(v),index.get(w)));}
    if(low.get(v)===index.get(v)){const group=[];let w;do{w=stack.pop();onStack.delete(w);component.set(w,components.length);group.push(w);}while(w!==v);components.push(group);}
  }
  for(const item of [...items].sort(compare))if(!index.has(item.id))visit(item.id);
  const next=components.map(()=>new Set()),incoming=components.map(()=>0),ranks=components.map(()=>0);
  for(const [from,targets]of adjacent)for(const to of targets){const a=component.get(from),b=component.get(to);if(a!==b&&!next[a].has(b)){next[a].add(b);incoming[b]++;}}
  const queue=incoming.flatMap((value,i)=>value===0?[i]:[]);
  for(let i=0;i<queue.length;i++)for(const b of next[queue[i]]){ranks[b]=Math.max(ranks[b],ranks[queue[i]]+1);if(--incoming[b]===0)queue.push(b);}
  const result=[];for(const n of [...items].sort(compare))(result[ranks[component.get(n.id)]]??=[]).push(n);return result;
}

function grid(items,columns=Math.ceil(Math.sqrt(items.length))) {
  if(!items.length)return {positions:new Map(),width:0,height:0};
  // Keep support below a lone flow resource, clear of its external arrows.
  if(items.length===2&&items.some(item=>item.support))columns=1;
  const widths=Array(columns).fill(0),heights=[];
  items.forEach((n,i)=>{widths[i%columns]=Math.max(widths[i%columns],n.width);const row=Math.floor(i/columns);heights[row]=Math.max(heights[row]||0,n.height);});
  const positions=new Map();let y=0;
  for(let row=0;row<heights.length;row++){let x=0;for(let col=0;col<columns;col++){const n=items[row*columns+col];if(n)positions.set(n.id,{x,y});x+=widths[col]+GAP;}y+=heights[row]+GAP;}
  return {positions,width:widths.reduce((a,b)=>a+b,0)+GAP*(columns-1),height:y-GAP};
}

function pack(items,edges) {
  if(!items.length)return grid([]);
  const triggers=edges.filter(isFlow).filter(e=>e.kind==='triggers');
  let ranking=triggers.length?triggers:edges.filter(e=>e.kind==='depends_on').map(e=>({...e,from:e.to,to:e.from}));
  if(!ranking.length)ranking=edges;
  const connected=new Set(ranking.flatMap(e=>[e.from,e.to]));
  const connectedItems=items.filter(n=>connected.has(n.id)),islands=items.filter(n=>!connected.has(n.id));
  if(!connectedItems.length)return grid([...items].sort(compare));
  const columns=layers(connectedItems,ranking).map(c=>grid(c,c.length<=3?1:Math.ceil(Math.sqrt(c.length))));
  const columnGap=Math.max(64,...edges.map(e=>Array.from(edgeCaption(e)).length*7+24));
  const height=Math.max(...columns.map(c=>c.height)),positions=new Map();let width=0;
  for(const col of columns){for(const [id,p]of col.positions)positions.set(id,{x:width+p.x,y:p.y+(height-col.height)/2});width+=col.width+columnGap;}
  width-=columnGap;let totalHeight=height;
  if(islands.length){const shelf=grid([...islands].sort(compare));for(const [id,p]of shelf.positions)positions.set(id,{x:p.x,y:p.y+height+GAP});width=Math.max(width,shelf.width);totalHeight+=GAP+shelf.height;}
  return {positions,width,height:totalHeight};
}

export function layoutGroupedGraph(view) {
  const measured=new Map();
  function measure(id){
    const item=view.items.get(id);
    if(!item.expanded){const box={...item,...CARD};measured.set(id,box);return box;}
    const children=item.children.map(measure),owners=new Map();
    for(const child of children){owners.set(child.id,child.id);const queue=[...child.children];for(let i=0;i<queue.length;i++){const descendant=view.items.get(queue[i]);owners.set(descendant.id,child.id);queue.push(...descendant.children);}}
    const links=view.edges.map(e=>({...e,from:owners.get(e.from),to:owners.get(e.to)})).filter(e=>e.from&&e.to&&e.from!==e.to);
    const content=pack(children,links),box={...item,width:Math.max(CARD.width,content.width+PADDING*2),height:HEADER+Math.max(30,content.height)+PADDING,content};measured.set(id,box);return box;
  }
  const roots=view.roots.map(measure),rootOwners=new Map();
  for(const root of roots){rootOwners.set(root.id,root.id);for(const item of view.items.values()){let top=item;while(top.parent)top=top.parent;if(top.id===root.id)rootOwners.set(item.id,root.id);}}
  const links=view.edges.map(e=>({...e,from:rootOwners.get(e.from),to:rootOwners.get(e.to)})).filter(e=>e.from&&e.to&&e.from!==e.to);
  const content=pack(roots,links),positions=new Map();
  function place(id,x,y,depth){const box=measured.get(id);positions.set(id,{x,y,width:box.width,height:box.height,depth});if(box.expanded)for(const [child,p]of box.content.positions)place(child,x+p.x+PADDING,y+p.y+HEADER,depth+1);}
  for(const [id,p]of content.positions)place(id,p.x+36,p.y+36,0);
  return {positions,width:content.width+72,height:content.height+72};
}

