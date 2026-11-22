import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeEdges,placeEdgeLabel} from './routing.mjs';
import {buildHierarchy,projectGraph,layoutGroupedGraph} from './layout.mjs';
const box=(x,y,width=244,height=94)=>({x,y,width,height});
function scene(boxes,edges=[{from:'a',to:'b'}]){return {view:{items:new Map(Object.keys(boxes).map(id=>[id,{id,expanded:false,parent:null}])),edges},layout:{positions:new Map(Object.entries(boxes))}};}
function intersects(a,b,r){return a.y===b.y?a.y>r.y&&a.y<r.y+r.height&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.width:a.x>r.x&&a.x<r.x+r.width&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.height;}
function assertClear(route,edge,obstacles){
  assert.ok(route,'no route');assert.ok(route.points.length>=2);
  const end=route.points.at(-1),lead=route.points.at(-2),target=obstacles.get(edge.to);
  assert.ok(Math.abs(end.x-lead.x)+Math.abs(end.y-lead.y)>=14,'arrow has no room before its tip');
  assert.ok(
    end.y===lead.y&&(end.x===target.x||end.x===target.x+target.width)
    ||end.x===lead.x&&(end.y===target.y||end.y===target.y+target.height),
    'final segment must enter perpendicular to the target'
  );
  for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i];assert.ok(a.x===b.x||a.y===b.y,'diagonal segment');assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));
    for(const [id,r]of obstacles){if(id===edge.from&&i===1||id===edge.to&&i===route.points.length-1)continue;assert.ok(!intersects(a,b,r),`route crossed ${id}`);}
  }
  assert.ok(!/[CQ]/.test(route.d),'curved path');
}
test('aligned resources connect directly, perpendicular to their boundaries',()=>{
  const {view,layout}=scene({a:box(0,0),b:box(400,0)}),[route]=routeEdges(view,layout);
  assert.deepEqual(route.points,[{x:244,y:47},{x:400,y:47}]);assertClear(route,view.edges[0],layout.positions);
});
test('parallel arrows have separate landing points and straight leads even in a narrow gap',()=>{
  const edges=['triggers','connects_to','depends_on'].map(kind=>({from:'a',to:'b',kind}));
  const {view,layout}=scene({a:box(0,0),b:box(272,0)},edges);
  const routes=routeEdges(view,layout);
  routes.forEach((route,i)=>assertClear(route,edges[i],layout.positions));
  const ends=routes.map(route=>route.points.at(-1));
  assert.ok(ends.every(end=>end.x===272),'all arrows should land on the facing side');
  assert.deepEqual(ends.map(end=>end.y).sort((a,b)=>a-b),[33,47,61]);
});
test('a fan-in keeps separate tips and clear leads when a nearby card forces turns',()=>{
  const edges=['a','b','c'].map(from=>({from,to:'target'}));
  const {view,layout}=scene({a:box(0,0),b:box(0,135),c:box(0,270),blocker:box(360,100),target:box(760,135)},edges);
  const routes=routeEdges(view,layout);
  routes.forEach((route,i)=>assertClear(route,edges[i],layout.positions));
  assert.equal(new Set(routes.map(route=>JSON.stringify(route.points.at(-1)))).size,edges.length);
});
test('routes take an empty corridor around a blocking card with clearance',()=>{
  const {view,layout}=scene({a:box(0,0),b:box(700,0),blocker:box(350,-60,244,214)}),[route]=routeEdges(view,layout);
  assertClear(route,view.edges[0],layout.positions);assert.ok(route.points.some(p=>p.y<=-68||p.y>=162));
});
test('backwards, vertical and cyclic connections avoid multiple obstacles',()=>{
  const {view,layout}=scene({a:box(0,0),b:box(700,350),one:box(300,-30),two:box(350,220),three:box(0,200)},[{from:'a',to:'b'},{from:'b',to:'a'},{from:'three',to:'a'}]);
  routeEdges(view,layout).forEach((route,i)=>assertClear(route,view.edges[i],layout.positions));
});
test('expanded ancestors allow passage through their content but protect headers and unrelated groups',()=>{
  const root={id:'root',expanded:true,parent:null},other={id:'other',expanded:true,parent:null};
  const view={items:new Map([['root',root],['a',{id:'a',expanded:false,parent:root}],['b',{id:'b',expanded:false,parent:null}],['other',other],['child',{id:'child',expanded:false,parent:other}]]),edges:[{from:'a',to:'b'},{from:'root',to:'b'}]};
  const layout={positions:new Map([['root',box(0,0,400,250)],['a',box(20,80)],['other',box(440,0,280,250)],['child',box(460,60)],['b',box(800,80)]])};
  const obstacles=new Map(layout.positions);obstacles.set('root',box(0,0,400,44));
  routeEdges(view,layout).forEach((route,i)=>assertClear(route,view.edges[i],obstacles));
});
test('group expansion and collapse reroute all connections without losing any',()=>{
  const nodes=['root','component','a','b','support','target'].map(id=>({id,name:id,type:id==='root'?'pulumi:pulumi:Stack':'test',stack:'stack'}));
  const link=(from,to,kind='contains')=>({from,to,kind,evidence:[{source:'test'}]});
  const graph={nodes,edges:[link('root','component'),link('component','a'),link('component','b'),link('component','support'),link('a','target','triggers'),link('b','target','triggers'),link('support','target','depends_on')]},tree=buildHierarchy(graph);
  for(const expanded of [new Set(tree.roots.map(r=>r.id)),tree.initialExpanded,new Set([...tree.items.keys()])]){
    const view=projectGraph(tree,'infra',true,expanded),layout=layoutGroupedGraph(view),routes=routeEdges(view,layout);
    assert.equal(routes.length,view.edges.length);assert.ok(routes.every(Boolean));
    const obstacles=new Map([...layout.positions].map(([id,p])=>[id,{...p,height:view.items.get(id).expanded?44:p.height}]));
    routes.forEach((route,i)=>assertClear(route,view.edges[i],obstacles));
  }
});
test('routing is deterministic regardless of item insertion order',()=>{
  const {view,layout}=scene({a:box(0,0),b:box(700,0),blocker:box(350,-60)}),first=routeEdges(view,layout);
  view.items=new Map([...view.items].reverse());layout.positions=new Map([...layout.positions].reverse());assert.deepEqual(routeEdges(view,layout),first);
});
test('an enclosed endpoint never falls back to drawing through another element',()=>{
  const {view,layout}=scene({a:box(0,0),b:box(700,0),cover:box(-20,-20,284,134)});assert.equal(routeEdges(view,layout)[0],null);
  assert.deepEqual(routeEdges({items:new Map(),edges:[]},{positions:new Map()}),[]);
});

const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
test('the full count label stays clear when a route passes just below a blocking card',()=>{
  const {view,layout}=scene({a:box(0,0),b:box(700,0),blocker:box(350,-100,244,260)}),[route]=routeEdges(view,layout);
  const obstacles=[...layout.positions.values()],label=placeEdgeLabel(route.points,24,28,obstacles);
  assert.ok(label);assert.ok(obstacles.every(obstacle=>!overlap(label,obstacle)));
  assert.ok(label.y>=layout.positions.get('blocker').y+layout.positions.get('blocker').height);
});
test('vertical route labels avoid both cards and previously placed labels',()=>{
  const points=[{x:252,y:0},{x:252,y:300}],obstacles=[box(0,60,244,180)];
  const first=placeEdgeLabel(points,32,28,obstacles);assert.ok(first);assert.ok(first.x>=244);
  const second=placeEdgeLabel(points,32,28,[...obstacles,first]);assert.ok(second);
  assert.ok(!overlap(first,second));assert.ok(obstacles.every(box=>!overlap(first,box)&&!overlap(second,box)));
});
test('short routes still place long counts outside the endpoint cards',()=>{
  const points=[{x:244,y:47},{x:272,y:47}],obstacles=[box(0,0),box(272,0)];
  const label=placeEdgeLabel(points,64,28,obstacles);assert.ok(label);assert.ok(obstacles.every(obstacle=>!overlap(label,obstacle)));
});
