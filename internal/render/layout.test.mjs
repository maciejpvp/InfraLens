import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildHierarchy,projectGraph,layoutGroupedGraph,revealResource,serviceFor,CARD} from './layout.mjs';
const node=(id,type='test',stack='stack')=>({id,name:id,type,stack,change:'create'});
const edge=(from,to,kind='contains',state)=>({from,to,kind,state,evidence:[{source:'test',property:from+'.'+to}]});
const nodes=['a','b','c','d'].map(id=>node(id));
const edges=[edge('a','b','triggers'),edge('a','c','triggers'),edge('b','d','triggers'),edge('c','d','triggers'),edge('d','a','connects_to')];
function arrangeResources(nodes,edges){
  const tree=buildHierarchy({nodes,edges});
  const view=projectGraph(tree,'infra',true,new Set(tree.items.keys()));
  const layout=layoutGroupedGraph(view);
  return {...layout,positions:new Map(nodes.map(node=>[node.id,layout.positions.get(node.id)]))};
}
test('trigger ordering takes precedence over configuration references',()=>{
  const {positions}=arrangeResources(nodes,edges);
  assert.equal(positions.get('b').x,positions.get('c').x);
  assert.ok(positions.get('a').x<positions.get('b').x);
  assert.ok(positions.get('d').x>positions.get('c').x);
  assert.ok(Math.abs(positions.get('b').y-positions.get('c').y)>CARD.height);
});
test('cycles and disconnected resources have finite non-overlapping positions in compact grids',()=>{
  for(const [items,links]of [[nodes,[...edges,edge('d','a','triggers')]],[Array.from({length:500},(_,i)=>node(String(i))),[]]]){
    const {positions,width,height}=arrangeResources(items,links);assert.equal(positions.size,items.length);
    const boxes=[...positions.values()];for(const p of boxes)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+CARD.width<=b.x||b.x+CARD.width<=a.x||a.y+CARD.height<=b.y||b.y+CARD.height<=a.y);}
    if(items.length===500)assert.ok(height/width<2,'disconnected resources formed a tall column');
  }
});
const nested={nodes:[node('root','pulumi:pulumi:Stack'),node('component'),node('nested'),...nodes,node('orphan')],edges:[edge('root','component'),edge('component','nested'),edge('nested','a'),edge('nested','b'),edge('component','c'),edge('missing','orphan'),...edges]};
test('stack and component hierarchy retains every resource, missing parents and supporting branches',()=>{
  const tree=buildHierarchy(nested),root=tree.roots[0];assert.equal(root.members.size,nested.nodes.length);
  assert.equal(tree.resourceItems.get('a').parent.id,'group:nested');
  const orphan=tree.resourceItems.get('orphan');assert.equal(orphan.parent.name,'Test');
  assert.ok(!tree.initialExpanded.has(orphan.parent.id));assert.ok(tree.initialExpanded.has('group:nested'));
  assert.equal(tree.resourceItems.get('root'),root);
  const expanded=new Set(tree.initialExpanded);for(const n of nested.nodes){const id=revealResource(tree,n.id,expanded);assert.ok(projectGraph(tree,'infra',true,expanded).items.has(id));}
});
test('collapsed connections aggregate by kind and retain each original edge and evidence',()=>{
  const graph={nodes:[node('g'),node('a'),node('b'),node('target')],edges:[edge('g','a'),edge('g','b'),edge('a','target','triggers'),edge('b','target','triggers'),edge('a','b','connects_to'),edge('a','target','connects_to')]};
  const tree=buildHierarchy(graph),view=projectGraph(tree,'flow',true,new Set(tree.roots.map(r=>r.id)));
  assert.equal(view.edges.length,2);assert.equal(view.hiddenEdges.length,1);
  const aggregate=view.edges.find(e=>e.kind==='triggers');assert.equal(aggregate.from,'group:g');assert.equal(aggregate.originals.length,2);
  assert.equal(aggregate.originals[0],graph.edges[2]);assert.equal(aggregate.originals[1].evidence[0].property,'b.target');
  assert.equal(view.edges.flatMap(e=>e.originals).length+view.hiddenEdges.length,4);
});
test('active topology controls both parentage and connections; filters do not lose resources',()=>{
  const graph={nodes:[node('old'),node('new'),node('a'),node('b')],edges:[edge('old','a','contains','before'),edge('new','a','contains','after'),edge('a','b','triggers','before'),edge('b','a','depends_on')]};
  for(const state of ['before','after']){const tree=buildHierarchy(graph,state);let parent=tree.resourceItems.get('a').parent;if(parent.support)parent=parent.parent;assert.equal(parent.id,'group:'+(state==='before'?'old':'new'));const v=projectGraph(tree,'flow',true,tree.initialExpanded);assert.equal(v.edges.length,state==='before'?1:0);assert.equal(v.representatives.size,4);assert.equal(projectGraph(tree,'infra',false,tree.initialExpanded).edges.some(e=>e.kind==='depends_on'),false);}
});
test('cyclic ownership, cross-stack and unknown parents cannot hide a resource',()=>{
  const graph={nodes:[node('a'),node('b'),node('c','test','other'),node('d')],edges:[edge('a','b'),edge('b','a'),edge('a','c'),edge('unknown','d')]};
  const tree=buildHierarchy(graph);assert.equal(tree.roots.reduce((n,g)=>n+g.members.size,0),4);for(const n of graph.nodes){const open=new Set(tree.initialExpanded);const id=revealResource(tree,n.id,open);assert.ok(projectGraph(tree,'infra',true,open).items.has(id));}
});
test('compound layout nests children, packs islands and is deterministic',()=>{
  const create=graph=>{const tree=buildHierarchy(graph),expanded=new Set([...tree.items.values()].filter(i=>i.group).map(i=>i.id));return {view:projectGraph(tree,'infra',true,expanded),tree};};
  const {view}=create(nested),layout=layoutGroupedGraph(view);
  for(const [id,p]of layout.positions){const item=view.items.get(id);if(item.parent){const parent=layout.positions.get(item.parent.id);assert.ok(p.x>=parent.x&&p.y>=parent.y+44);assert.ok(p.x+p.width<=parent.x+parent.width&&p.y+p.height<=parent.y+parent.height);}}
  const reversed=create({nodes:[...nested.nodes].reverse(),edges:[...nested.edges].reverse()});assert.deepEqual(layoutGroupedGraph(reversed.view),layout);
});
test('empty graph is valid',()=>{const tree=buildHierarchy({nodes:[],edges:[]});const v=projectGraph(tree,'flow',false,new Set());assert.equal(layoutGroupedGraph(v).positions.size,0);});

test('a supporting card sits below a lone flow resource, leaving its external route clear',()=>{
  const graph={nodes:[node('component'),node('a'),node('support'),node('b','test','other')],edges:[edge('component','a'),edge('component','support'),edge('a','b','triggers')]};
  const tree=buildHierarchy(graph),view=projectGraph(tree,'flow',true,tree.initialExpanded),layout=layoutGroupedGraph(view);
  const a=layout.positions.get('a'),support=layout.positions.get(tree.resourceItems.get('support').parent.id);assert.ok(support.y>=a.y+a.height);
});

test('flow captions preserve distinct routes and filters while deduplicating presentation',async()=>{
  const {flowDescriptions,edgeCaption}=await import('./layout.mjs');
  const a={evidence:[{label:'GET /search',details:'auth: NONE',resource:'a'},{label:'GET /search',details:'auth: NONE',resource:'b'},{label:'GET /search',details:'auth: JWT'},{label:'POST /search'}]};
  const aggregate={originals:[a,a]};
  assert.equal(flowDescriptions([aggregate]).length,3);
  assert.equal(edgeCaption(aggregate),'GET /search +2 · ×2');
  assert.equal(edgeCaption({evidence:[{source:'test'}]}),'');
  assert.equal(edgeCaption({originals:[{evidence:[]},{evidence:[]}]}),'×2');
  assert.equal(Array.from(edgeCaption({evidence:[{label:'界'.repeat(50)}]})).length,40);
  assert.deepEqual(flowDescriptions([a]),flowDescriptions([{evidence:[...a.evidence].reverse()}]));
});

test('descriptions reserve a corridor while unlabelled connections keep their default spacing',()=>{
  const items=[node('source'),node('target')],link=edge('source','target','triggers');
  const unlabelled=arrangeResources(items,[link]),described=arrangeResources(items,[{...link,evidence:[{source:'test',label:'s3:ObjectCreated:*'}]}]);
  assert.equal(unlabelled.positions.get('target').x-unlabelled.positions.get('source').x,CARD.width+64);
  assert.ok(described.positions.get('target').x-described.positions.get('source').x>=CARD.width+18*7+24);
});


test('service classification uses Pulumi types and never guesses from resource names',()=>{
  for(const [type,name,icon] of [
    ['aws:s3/bucket:Bucket','S3','s3'],['aws:lambda/function:Function','Lambda','lambda'],
    ['aws:iam/role:Role','IAM','iam'],['aws:ecs/service:Service','ECS','ecs'],
    ['aws:apigatewayv2/route:Route','API Gateway','api-gateway'],['aws:apigateway/restApi:RestApi','API Gateway','api-gateway'],
    ['aws:ec2/instance:Instance','EC2','ec2'],['aws:cloudwatch/logGroup:LogGroup','CloudWatch','cloudwatch'],
    ['aws:cloudwatch/eventRule:EventRule','EventBridge','eventbridge'],['aws:cloudwatch/eventTarget:EventTarget','EventBridge','eventbridge'],
    ['aws:sqs/queue:Queue','SQS','sqs'],['aws:sns/topic:Topic','SNS','sns'],['aws:dynamodb/table:Table','DynamoDB','dynamodb'],
    ['aws:sfn/stateMachine:StateMachine','Step Functions','step-functions'],['aws:opensearch/domain:Domain','OpenSearch','opensearch'],
    ['random:index/randomId:RandomId','Random',null],['aws:unknown/resource:Resource','unknown',null]
  ]){const service=serviceFor(type);assert.equal(service.name,name);assert.equal(service.icon,icon);}
  assert.equal(serviceFor().name,'Unknown');
});

test('service groups stay inside owners and stacks, collapse by default and retain each resource once',()=>{
  const graph={nodes:[node('root','pulumi:pulumi:Stack'),node('component','pkg:index:Component'),
    node('role','aws:iam/role:Role'),node('policy','aws:iam/policy:Policy'),node('bucket','aws:s3/bucket:Bucket'),
    node('opensearch-on-ec2','aws:ec2/instance:Instance'),node('other-role','aws:iam/role:Role','other'),
    node('component-role','aws:iam/role:Role'),node('lambda','aws:lambda/function:Function')],
    edges:[edge('root','component'),edge('component','component-role'),edge('bucket','lambda','triggers')]};
  const tree=buildHierarchy(graph),groups=[...tree.items.values()].filter(i=>i.support);
  assert.equal(groups.length,4);
  const role=tree.resourceItems.get('role'),policy=tree.resourceItems.get('policy');assert.equal(role.parent,policy.parent);
  assert.equal(role.parent.name,'IAM');assert.notEqual(role.parent,tree.resourceItems.get('other-role').parent);
  assert.equal(tree.resourceItems.get('component-role').parent.parent.id,'group:component');
  assert.equal(tree.resourceItems.get('opensearch-on-ec2').parent.name,'EC2');
  for(const id of ['bucket','lambda'])assert.ok(!tree.resourceItems.get(id).parent.support);
  for(const group of groups){assert.ok(group.children.length);assert.ok(!tree.initialExpanded.has(group.id));}
  const resources=[];function visit(item){if(item.node)resources.push(item.node.id);for(const child of item.children||[])visit(child);}
  for(const root of tree.roots)visit(root);
  assert.deepEqual(resources.sort(),graph.nodes.map(n=>n.id).sort());
  const reverse=buildHierarchy({nodes:[...graph.nodes].reverse(),edges:[...graph.edges].reverse()});
  const structure=t=>[...t.items.values()].filter(i=>i.group).map(i=>[i.id,i.children.map(c=>c.id)]).sort();
  assert.deepEqual(structure(tree),structure(reverse));
});
