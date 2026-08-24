#!/usr/bin/env node
const { campaignMapEdges, campaignNodePoint, campaignNodeStatus } = await import('../frontend/src/campaignMapVisual.js');
function assert(value, message) { if (!value) throw new Error(message); }
const start = { id:'start', stage:0, lane:1, type:'start', connections:['s1-a','s1-b'] };
const s1a = { id:'s1-a', stage:1, lane:0, type:'battle', connections:['s2-a','s2-b'] };
const s1b = { id:'s1-b', stage:1, lane:2, type:'battle', connections:['s2-b','s2-c'] };
const s2a = { id:'s2-a', stage:2, lane:0, type:'event', connections:[] };
const s2b = { id:'s2-b', stage:2, lane:1, type:'battle', connections:[] };
const s2c = { id:'s2-c', stage:2, lane:2, type:'camp', connections:[] };
const map = { start, stages:[[s1a,s1b],[s2a,s2b,s2c]], nodes:[start,s1a,s1b,s2a,s2b,s2c] };
const campaign = { currentNodeId:'start', selectedNodeId:null, clearedNodeIds:[], route:['start'] };
const available = [s1a,s1b];
const edges = campaignMapEdges(map, campaign, available);
assert(edges.filter((edge)=>edge.fromId==='start' && edge.status==='available').length === 2, 'las rutas iniciales no aparecen activas');
assert(campaignNodeStatus(s1a, campaign, new Set(available.map((n)=>n.id))) === 'available', 'el primer sector no aparece seleccionable');
const desktop = campaignNodePoint({stage:7,lane:1}, 'desktop');
const mobile = campaignNodePoint({stage:7,lane:1}, 'mobile');
assert(desktop.x > desktop.y, 'la geometría desktop no avanza horizontalmente');
assert(mobile.y > mobile.x, 'la geometría móvil no avanza verticalmente');
const routed = { currentNodeId:s1a.id, selectedNodeId:null, clearedNodeIds:[s1a.id], route:['start',s1a.id] };
const nextAvailable = [s2a,s2b];
const routedEdges = campaignMapEdges(map, routed, nextAvailable);
assert(routedEdges.some((edge)=>edge.fromId==='start' && edge.toId===s1a.id && edge.status==='traversed'), 'la ruta recorrida no queda marcada');
assert(routedEdges.filter((edge)=>edge.fromId===s1a.id && edge.status==='available').length === 2, 'las bifurcaciones desde la posición actual no resaltan');
assert(campaignNodeStatus(s1a, routed, new Set(nextAvailable.map((n)=>n.id))) === 'current', 'la posición actual debe prevalecer sobre superado');
console.log('campaign-map-check OK · rutas/estado · desktop/mobile');
