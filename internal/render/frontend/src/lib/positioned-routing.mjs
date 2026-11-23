const ROUTE_GAP = 8, PORT_LENGTH = 14, PORT_SPACING = 14, PORT_INSET = 12, BEND_COST = 24;
function crosses(a, b, box) {
    if (a.y === b.y)
        return a.y > box.y && a.y < box.y + box.height && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width;
    return a.x > box.x && a.x < box.x + box.width && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height;
}
function inside(point, box) { return point.x > box.x && point.x < box.x + box.width && point.y > box.y && point.y < box.y + box.height; }
function routingGroups(view, id) {
    const item = view.items.get(id), result = item.expanded ? [id] : [];
    for (let parent = item.parent; parent; parent = parent.parent)
        result.push(parent.id);
    return result;
}
function obstacleGeometry(view, layout) {
    return [...view.items.values()].map(item => {
        const { x, y, width, height } = layout.positions.get(item.id);
        const box = { id: item.id, x: x - ROUTE_GAP, y: y - ROUTE_GAP, width: width + ROUTE_GAP * 2, height: height + ROUTE_GAP * 2 };
        const header = item.expanded ? { ...box, height: 44 + ROUTE_GAP * 2 } : box;
        return { box, header, parent: item.parent?.id };
    });
}
function routingObstacles(geometry, groups) {
    const allowed = new Set(groups), boxes = [];
    for (const { box, header, parent } of geometry) {
        // The allowed set already includes every ancestor of an allowed parent.
        if (parent !== undefined && !allowed.has(parent))
            continue;
        boxes.push(allowed.has(box.id) ? header : box);
    }
    const lines = { x: new Map(), y: new Map() }, axes = {};
    function crossesSegment(p, q) {
        const axis = p.y === q.y ? 'y' : 'x', span = axis === 'x' ? 'width' : 'height';
        const coordinate = p[axis], cache = lines[axis];
        if (!cache.has(coordinate)) {
            cache.set(coordinate, boxes.filter(box => coordinate > box[axis] && coordinate < box[axis] + box[span]));
        }
        return cache.get(coordinate).some(box => crosses(p, q, box));
    }
    function coordinates(axis) {
        if (!axes[axis]) {
            const span = axis === 'x' ? 'width' : 'height';
            const values = [...new Set(boxes.flatMap(box => [box[axis], box[axis] + box[span]]))].sort((a, b) => a - b);
            axes[axis] = [values[0] - 16, ...values, values.at(-1) + 16];
        }
        return axes[axis];
    }
    return { boxes, crossesSegment, coordinates };
}
const portKey = point => `${point.x},${point.y}`;
function portsFor(view, layout, id, obstacles, occupied, degree) {
    const box = layout.positions.get(id), height = view.items.get(id).expanded ? 44 : box.height;
    const sides = [
        { point: { x: box.x + box.width, y: box.y + height / 2 }, dx: 1, dy: 0, axis: 0 },
        { point: { x: box.x, y: box.y + height / 2 }, dx: -1, dy: 0, axis: 0 },
        { point: { x: box.x + box.width / 2, y: box.y + height }, dx: 0, dy: 1, axis: 1 },
        { point: { x: box.x + box.width / 2, y: box.y }, dx: 0, dy: -1, axis: 1 }
    ];
    return sides.map(function* ({ point: center, dx, dy, axis }) {
        const range = Math.max(0, (axis === 0 ? height : box.width) / 2 - PORT_INSET);
        const steps = range > 0 ? Math.max(Math.floor(range / PORT_SPACING), Math.ceil((degree - 1) / 2)) : 0;
        const spacing = steps > 0 ? Math.min(PORT_SPACING, range / steps) : 0;
        for (let slot = 0; slot <= steps * 2; slot++) {
            const offset = Math.ceil(slot / 2) * spacing * (slot % 2 ? 1 : -1);
            const point = { x: center.x + Math.abs(dy) * offset, y: center.y + Math.abs(dx) * offset };
            const stub = { x: point.x + dx * PORT_LENGTH, y: point.y + dy * PORT_LENGTH };
            if (occupied.has(portKey(point)) || obstacles.some(b => inside(stub, b) || (b.id !== id && crosses(point, stub, b))))
                continue;
            yield { point, stub, dx, dy, axis };
        }
    });
}
// A small priority queue keeps route searches responsive when infrastructure is expanded.
class RouteQueue {
    values = [];
    push(value) { const a = this.values; let i = a.length; a.push(value); while (i) {
        const parent = (i - 1) >> 1;
        if (a[parent].score <= value.score)
            break;
        a[i] = a[parent];
        i = parent;
    } a[i] = value; }
    pop() { const a = this.values, first = a[0], last = a.pop(); if (a.length) {
        let i = 0;
        while (i * 2 + 1 < a.length) {
            let child = i * 2 + 1;
            if (child + 1 < a.length && a[child + 1].score < a[child].score)
                child++;
            if (a[child].score >= last.score)
                break;
            a[i] = a[child];
            i = child;
        }
        a[i] = last;
    } return first; }
}
function simplify(points) { const result = []; for (const p of points) {
    const last = result.at(-1), before = result.at(-2);
    if (last && last.x === p.x && last.y === p.y)
        continue;
    if (before && ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y)))
        result.pop();
    result.push(p);
} return result; }
function svgRoute(points) {
    return { points, d: points.map((p, i) => i === 0 ? `M${p.x} ${p.y}` : p.x === points[i - 1].x ? `V${p.y}` : `H${p.x}`).join(' ') };
}
function straightRoute(obstacles, starts, goals) {
    let lowerBound = Infinity;
    const straight = [];
    for (const start of starts)
        for (const goal of goals) {
            const dx = goal.stub.x - start.stub.x, dy = goal.stub.y - start.stub.y;
            const distance = Math.abs(dx) + Math.abs(dy);
            lowerBound = Math.min(lowerBound, distance);
            if (start.dx !== -goal.dx || start.dy !== -goal.dy)
                continue;
            if ((start.dx && dy !== 0) || (start.dy && dx !== 0) || dx * start.dx + dy * start.dy < 0)
                continue;
            straight.push({ start, goal, distance });
        }
    for (const { start, goal, distance } of straight) {
        if (distance === lowerBound && !obstacles.some(box => crosses(start.stub, goal.stub, box))) {
            return svgRoute([start.point, goal.point]);
        }
    }
    return null;
}
function routeEdge(obstacles, starts, goals) {
    if (!starts.length || !goals.length)
        return null;
    const coordinates = axis => [...new Set([
            ...obstacles.coordinates(axis), ...starts.map(port => port.stub[axis]), ...goals.map(port => port.stub[axis]),
        ])].sort((a, b) => a - b);
    const xs = coordinates('x'), ys = coordinates('y'), width = xs.length;
    const index = p => ys.indexOf(p.y) * width + xs.indexOf(p.x), point = i => ({ x: xs[i % width], y: ys[Math.floor(i / width)] });
    const goalAt = new Map(goals.map(p => [index(p.stub), p])), size = xs.length * ys.length * 2;
    const distance = new Float64Array(size).fill(Infinity), parent = new Int32Array(size).fill(-1), roots = new Map(), queue = new RouteQueue(), visibility = new Map();
    function heuristic(p) {
        let min = Infinity;
        for (const { stub } of goals)
            min = Math.min(min, Math.abs(p.x - stub.x) + Math.abs(p.y - stub.y));
        return min + PORT_LENGTH;
    }
    for (const port of starts) {
        const state = index(port.stub) * 2 + port.axis;
        distance[state] = PORT_LENGTH;
        roots.set(state, port);
        queue.push({ state, cost: PORT_LENGTH, score: PORT_LENGTH + heuristic(port.stub) });
    }
    let best = null, bestCost = Infinity;
    while (queue.values.length) {
        const entry = queue.pop();
        if (entry.score >= bestCost)
            break;
        if (entry.cost !== distance[entry.state])
            continue;
        const state = entry.state, i = state >> 1, axis = state % 2, p = point(i), goal = goalAt.get(i);
        if (goal) {
            const cost = entry.cost + PORT_LENGTH + (axis === goal.axis ? 0 : BEND_COST);
            if (cost < bestCost) {
                best = { state, goal };
                bestCost = cost;
            }
        }
        const col = i % width, row = Math.floor(i / width);
        for (const next of [col > 0 ? i - 1 : -1, col + 1 < width ? i + 1 : -1, row > 0 ? i - width : -1, row + 1 < ys.length ? i + width : -1]) {
            if (next < 0)
                continue;
            const q = point(next), nextAxis = p.y === q.y ? 0 : 1, nextState = next * 2 + nextAxis, end = goalAt.get(next);
            if (end && nextAxis === end.axis && (p.x - q.x) * end.dx + (p.y - q.y) * end.dy < 0)
                continue;
            const key = Math.min(i, next) * size + Math.max(i, next);
            if (!visibility.has(key))
                visibility.set(key, !obstacles.crossesSegment(p, q));
            if (!visibility.get(key))
                continue;
            const cost = entry.cost + Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + (axis === nextAxis ? 0 : BEND_COST);
            if (cost >= distance[nextState])
                continue;
            distance[nextState] = cost;
            parent[nextState] = state;
            queue.push({ state: nextState, cost, score: cost + heuristic(q) });
        }
    }
    if (!best)
        return null;
    const reverse = [];
    let state = best.state;
    while (parent[state] !== -1) {
        reverse.push(point(state >> 1));
        state = parent[state];
    }
    const start = roots.get(state);
    reverse.push(start.stub);
    return svgRoute(simplify([start.point, ...reverse.reverse(), best.goal.point]));
}
// Reserve both ends so arrowheads never share a landing point with another wire.
export function routeEdges(view, layout) {
    if (!view.edges.length)
        return [];
    const geometry = obstacleGeometry(view, layout), endpoints = new Map();
    for (const { from, to } of view.edges)
        for (const id of [from, to]) {
            if (!endpoints.has(id))
                endpoints.set(id, { degree: 0, occupied: new Set(), groups: routingGroups(view, id) });
            endpoints.get(id).degree++;
        }
    // Reuse the last geometry without retaining a cache for every pair of groups.
    let obstacles, previousGroupKey;
    return view.edges.map(edge => {
        const from = endpoints.get(edge.from), to = endpoints.get(edge.to);
        const groups = [...new Set([...from.groups, ...to.groups])].sort();
        const groupKey = JSON.stringify(groups);
        if (groupKey !== previousGroupKey) {
            obstacles = routingObstacles(geometry, groups);
            previousGroupKey = groupKey;
        }
        const startSides = portsFor(view, layout, edge.from, obstacles.boxes, from.occupied, from.degree);
        const goalSides = portsFor(view, layout, edge.to, obstacles.boxes, to.occupied, to.degree);
        const firstStarts = startSides.map(side => side.next().value), firstGoals = goalSides.map(side => side.next().value);
        const starts = firstStarts.filter(Boolean), goals = firstGoals.filter(Boolean);
        const remaining = (sides, first) => sides.flatMap((side, i) => first[i] ? [first[i], ...side] : []);
        const route = straightRoute(obstacles.boxes, starts, goals) || routeEdge(obstacles, starts, goals)
            || routeEdge(obstacles, remaining(startSides, firstStarts), remaining(goalSides, firstGoals));
        if (route) {
            from.occupied.add(portKey(route.points[0]));
            to.occupied.add(portKey(route.points.at(-1)));
        }
        return route;
    });
}
function labelIntersects(a, b) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
// Measure the whole text box, including its halo, rather than just the route midpoint.
export function placeEdgeLabel(points, width, height, obstacles) {
    const segments = points.slice(1).map((b, i) => { const a = points[i]; return { a, b, horizontal: a.y === b.y, length: Math.abs(a.x - b.x) + Math.abs(a.y - b.y) }; }).sort((a, b) => b.length - a.length);
    for (const fallback of [false, true])
        for (const segment of segments) {
            const { a, b, horizontal } = segment, axis = horizontal ? 'x' : 'y', normal = horizontal ? 'y' : 'x', size = horizontal ? width : height, other = horizontal ? height : width;
            const low = Math.min(a[axis], b[axis]), high = Math.max(a[axis], b[axis]), middle = (low + high) / 2;
            const locations = [middle, ...obstacles.flatMap(box => [box[axis] - size / 2 - 4, box[axis] + (horizontal ? box.width : box.height) + size / 2 + 4])]
                .filter(value => segment.length < size ? value === middle : value >= low + size / 2 && value <= high - size / 2).sort((x, y) => Math.abs(x - middle) - Math.abs(y - middle));
            const gaps = fallback ? [...new Set(obstacles.flatMap(box => [a[normal] - box[normal] + 4, box[normal] + (horizontal ? box.height : box.width) - a[normal] + 4]).filter(gap => gap > 4))].sort((x, y) => x - y) : [4];
            for (const gap of gaps)
                for (const location of locations)
                    for (const side of [-1, 1]) {
                        const near = a[normal] + (side < 0 ? -gap - other : gap);
                        const box = horizontal ? { x: location - width / 2, y: near, width, height } : { x: near, y: location - height / 2, width, height };
                        if (!obstacles.some(obstacle => labelIntersects(box, obstacle)))
                            return box;
                    }
        }
    return null;
}
