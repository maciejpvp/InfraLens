const ROUTE_GAP=8, PORT_LENGTH=14, PORT_SPACING=14, PORT_INSET=12, BEND_COST=24;

function crosses(a,b,box){
  if(a.y===b.y)return a.y>box.y&&a.y<box.y+box.height&&Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.width;
  return a.x>box.x&&a.x<box.x+box.width&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.height;
}
function inside(point,box){return point.x>box.x&&point.x<box.x+box.width&&point.y>box.y&&point.y<box.y+box.height;}
function ancestors(view,id){const result=new Set([id]);for(let p=view.items.get(id).parent;p;p=p.parent)result.add(p.id);return result;}
function obstaclesFor(view,layout,edge){
  const allowed=new Set([...ancestors(view,edge.from),...ancestors(view,edge.to)]),obstacles=[];
  for(const item of view.items.values()){
    let covered=false;
    for(let p=item.parent;p;p=p.parent)if(!allowed.has(p.id)){covered=true;break;}
    if(covered)continue;
    const p=layout.positions.get(item.id),height=item.expanded&&allowed.has(item.id)?44:p.height;
    obstacles.push({id:item.id,x:p.x-ROUTE_GAP,y:p.y-ROUTE_GAP,width:p.width+ROUTE_GAP*2,height:height+ROUTE_GAP*2});
  }
  return obstacles;
}
const portKey=point=>`${point.x},${point.y}`;
function portsFor(view,layout,id,obstacles,occupied,degree){
  const box=layout.positions.get(id),height=view.items.get(id).expanded?44:box.height;
  const sides=[
    {point:{x:box.x+box.width,y:box.y+height/2},dx:1,dy:0,axis:0},
    {point:{x:box.x,y:box.y+height/2},dx:-1,dy:0,axis:0},
    {point:{x:box.x+box.width/2,y:box.y+height},dx:0,dy:1,axis:1},
    {point:{x:box.x+box.width/2,y:box.y},dx:0,dy:-1,axis:1}
  ];
  return sides.map(({point:center,dx,dy,axis})=>{
    const range=Math.max(0,(axis===0?height:box.width)/2-PORT_INSET);
    const steps=range>0?Math.max(Math.floor(range/PORT_SPACING),Math.ceil((degree-1)/2)):0;
    const spacing=steps>0?Math.min(PORT_SPACING,range/steps):0,ports=[];
    for(let slot=0;slot<=steps*2;slot++){
      const offset=Math.ceil(slot/2)*spacing*(slot%2?1:-1);
      const point={x:center.x+Math.abs(dy)*offset,y:center.y+Math.abs(dx)*offset};
      const stub={x:point.x+dx*PORT_LENGTH,y:point.y+dy*PORT_LENGTH};
      if(occupied.has(portKey(point))||obstacles.some(b=>inside(stub,b)||(b.id!==id&&crosses(point,stub,b))))continue;
      ports.push({point,stub,dx,dy,axis});
    }
    return ports;
  });
}

// A small priority queue keeps route searches responsive when infrastructure is expanded.
class RouteQueue{
  values=[];
  push(value){const a=this.values;let i=a.length;a.push(value);while(i){const parent=(i-1)>>1;if(a[parent].score<=value.score)break;a[i]=a[parent];i=parent;}a[i]=value;}
  pop(){const a=this.values,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].score<a[child].score)child++;if(a[child].score>=last.score)break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
function simplify(points){const result=[];for(const p of points){const last=result.at(-1),before=result.at(-2);if(last&&last.x===p.x&&last.y===p.y)continue;if(before&&((before.x===last.x&&last.x===p.x)||(before.y===last.y&&last.y===p.y)))result.pop();result.push(p);}return result;}

function routeEdge(obstacles,starts,goals){
  if(!starts.length||!goals.length)return null;
  const coordinates=axis=>{
    const size=axis==='x'?'width':'height',values=obstacles.flatMap(b=>[b[axis],b[axis]+b[size]]);
    values.push(Math.min(...values)-16,Math.max(...values)+16,...starts.map(p=>p.stub[axis]),...goals.map(p=>p.stub[axis]));
    return [...new Set(values)].sort((a,b)=>a-b);
  };
  const xs=coordinates('x'),ys=coordinates('y'),width=xs.length;
  const index=p=>ys.indexOf(p.y)*width+xs.indexOf(p.x),point=i=>({x:xs[i%width],y:ys[Math.floor(i/width)]});
  const goalAt=new Map(goals.map(p=>[index(p.stub),p])),size=xs.length*ys.length*2;
  const distance=new Float64Array(size).fill(Infinity),parent=new Int32Array(size).fill(-1),roots=new Map(),queue=new RouteQueue(),visibility=new Map();
  const heuristic=p=>Math.min(...goals.map(g=>Math.abs(p.x-g.stub.x)+Math.abs(p.y-g.stub.y)))+PORT_LENGTH;
  for(const port of starts){const state=index(port.stub)*2+port.axis;distance[state]=PORT_LENGTH;roots.set(state,port);queue.push({state,cost:PORT_LENGTH,score:PORT_LENGTH+heuristic(port.stub)});}
  let best=null,bestCost=Infinity;
  while(queue.values.length){
    const entry=queue.pop();if(entry.score>=bestCost)break;if(entry.cost!==distance[entry.state])continue;
    const state=entry.state,i=state>>1,axis=state%2,p=point(i),goal=goalAt.get(i);
    if(goal){const cost=entry.cost+PORT_LENGTH+(axis===goal.axis?0:BEND_COST);if(cost<bestCost){best={state,goal};bestCost=cost;}}
    const col=i%width,row=Math.floor(i/width);
    for(const next of [col>0?i-1:-1,col+1<width?i+1:-1,row>0?i-width:-1,row+1<ys.length?i+width:-1]){
      if(next<0)continue;
      const q=point(next),nextAxis=p.y===q.y?0:1,nextState=next*2+nextAxis,end=goalAt.get(next);
      if(end&&nextAxis===end.axis&&(p.x-q.x)*end.dx+(p.y-q.y)*end.dy<0)continue;
      const key=Math.min(i,next)*size+Math.max(i,next);
      if(!visibility.has(key))visibility.set(key,!obstacles.some(b=>crosses(p,q,b)));
      if(!visibility.get(key))continue;
      const cost=entry.cost+Math.abs(p.x-q.x)+Math.abs(p.y-q.y)+(axis===nextAxis?0:BEND_COST);
      if(cost>=distance[nextState])continue;
      distance[nextState]=cost;parent[nextState]=state;queue.push({state:nextState,cost,score:cost+heuristic(q)});
    }
  }
  if(!best)return null;
  const reverse=[];let state=best.state;
  while(parent[state]!==-1){reverse.push(point(state>>1));state=parent[state];}
  const start=roots.get(state);reverse.push(start.stub);
  const points=simplify([start.point,...reverse.reverse(),best.goal.point]);
  return {points,d:points.map((p,i)=>i===0?`M${p.x} ${p.y}`:p.x===points[i-1].x?`V${p.y}`:`H${p.x}`).join(' ')};
}

// Reserve both ends so arrowheads never share a landing point with another wire.
export function routeEdges(view,layout){
  const endpoints=new Map();
  for(const {from,to} of view.edges)for(const id of [from,to]){
    if(!endpoints.has(id))endpoints.set(id,{degree:0,occupied:new Set()});
    endpoints.get(id).degree++;
  }
  return view.edges.map(edge=>{
    const obstacles=obstaclesFor(view,layout,edge),from=endpoints.get(edge.from),to=endpoints.get(edge.to);
    const starts=portsFor(view,layout,edge.from,obstacles,from.occupied,from.degree);
    const goals=portsFor(view,layout,edge.to,obstacles,to.occupied,to.degree);
    const route=routeEdge(obstacles,starts.map(side=>side[0]).filter(Boolean),goals.map(side=>side[0]).filter(Boolean))
      ||routeEdge(obstacles,starts.flat(),goals.flat());
    if(route){
      from.occupied.add(portKey(route.points[0]));
      to.occupied.add(portKey(route.points.at(-1)));
    }
    return route;
  });
}

function labelIntersects(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}

// Measure the whole text box, including its halo, rather than just the route midpoint.
export function placeEdgeLabel(points,width,height,obstacles){
  const segments=points.slice(1).map((b,i)=>{const a=points[i];return {a,b,horizontal:a.y===b.y,length:Math.abs(a.x-b.x)+Math.abs(a.y-b.y)};}).sort((a,b)=>b.length-a.length);
  for(const fallback of [false,true])for(const segment of segments){
    const {a,b,horizontal}=segment,axis=horizontal?'x':'y',normal=horizontal?'y':'x',size=horizontal?width:height,other=horizontal?height:width;
    const low=Math.min(a[axis],b[axis]),high=Math.max(a[axis],b[axis]),middle=(low+high)/2;
    const locations=[middle,...obstacles.flatMap(box=>[box[axis]-size/2-4,box[axis]+(horizontal?box.width:box.height)+size/2+4])]
      .filter(value=>segment.length<size?value===middle:value>=low+size/2&&value<=high-size/2).sort((x,y)=>Math.abs(x-middle)-Math.abs(y-middle));
    const gaps=fallback?[...new Set(obstacles.flatMap(box=>[a[normal]-box[normal]+4,box[normal]+(horizontal?box.height:box.width)-a[normal]+4]).filter(gap=>gap>4))].sort((x,y)=>x-y):[4];
    for(const gap of gaps)for(const location of locations)for(const side of [-1,1]){
      const near=a[normal]+(side<0?-gap-other:gap);
      const box=horizontal?{x:location-width/2,y:near,width,height}:{x:near,y:location-height/2,width,height};
      if(!obstacles.some(obstacle=>labelIntersects(box,obstacle)))return box;
    }
  }
  return null;
}
