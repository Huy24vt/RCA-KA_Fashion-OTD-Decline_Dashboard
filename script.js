const POST_START = '2025-08-16';
const COLORS = {
  text: '#edf2ff',
  muted: '#a8b3cf',
  grid: 'rgba(255,255,255,0.08)',
  accent: '#7dd3fc',
  accent2: '#93c5fd',
  accent3: '#c4b5fd',
  danger: '#fca5a5',
  success: '#86efac',
  warning: '#fcd34d'
};

let shipments = [];
let hubOps = [];
let slaMap = {};

const filters = {
  window: document.getElementById('windowFilter'),
  region: document.getElementById('regionFilter'),
  hub: document.getElementById('hubFilter'),
  district: document.getElementById('districtFilter'),
  service: document.getElementById('serviceFilter')
};

function pct(v) {
  if (Number.isNaN(v) || v == null) return '-';
  return `${(v * 100).toFixed(2)}%`;
}
function pp(v) {
  if (Number.isNaN(v) || v == null) return '-';
  const sign = v > 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(2)} pp`;
}
function num(v) {
  return Intl.NumberFormat('en-US').format(v ?? 0);
}
function dec(v, d=2) {
  if (v == null || Number.isNaN(v)) return '-';
  return v.toFixed(d);
}
function avg(arr, accessor) {
  if (!arr.length) return null;
  return arr.reduce((s, r) => s + accessor(r), 0) / arr.length;
}
function meanOfPositive(arr, accessor) {
  const vals = arr.map(accessor).filter(v => v > 0);
  if (!vals.length) return null;
  return vals.reduce((a,b)=>a+b,0) / vals.length;
}
function weightedSla(rows) {
  if (!rows.length) return null;
  const total = rows.length;
  const weighted = rows.reduce((sum, r) => sum + (slaMap[r.service_type] || 0) , 0);
  return weighted / total;
}
function withinWindow(dateStr, windowChoice) {
  if (windowChoice === 'all') return true;
  if (windowChoice === 'pre') return dateStr < POST_START;
  return dateStr >= POST_START;
}
function setOptions(select, values, includeAll = true, labelAll = 'All') {
  const current = select.value;
  select.innerHTML = '';
  if (includeAll) {
    const opt = document.createElement('option');
    opt.value = 'all';
    opt.textContent = labelAll;
    select.appendChild(opt);
  }
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

function applyFilters() {
  const selected = {
    window: filters.window.value,
    region: filters.region.value,
    hub: filters.hub.value,
    district: filters.district.value,
    service: filters.service.value
  };
  return shipments.filter(r => {
    return withinWindow(r.order_date, selected.window)
      && (selected.region === 'all' || r.region === selected.region)
      && (selected.hub === 'all' || r.hub_id === selected.hub)
      && (selected.district === 'all' || r.district_type === selected.district)
      && (selected.service === 'all' || r.service_type === selected.service);
  });
}

function filteredHubOps() {
  const selected = {
    window: filters.window.value,
    region: filters.region.value,
    hub: filters.hub.value
  };
  return hubOps.filter(r => {
    return withinWindow(r.order_date, selected.window)
      && (selected.region === 'all' || r.region === selected.region)
      && (selected.hub === 'all' || r.hub_id === selected.hub);
  });
}

function baselineRows(currentRows) {
  const selected = {
    region: filters.region.value,
    hub: filters.hub.value,
    district: filters.district.value,
    service: filters.service.value
  };
  return shipments.filter(r => {
    return r.order_date < POST_START
      && (selected.region === 'all' || r.region === selected.region)
      && (selected.hub === 'all' || r.hub_id === selected.hub)
      && (selected.district === 'all' || r.district_type === selected.district)
      && (selected.service === 'all' || r.service_type === selected.service);
  });
}

function groupBy(rows, keyFn) {
  const m = new Map();
  rows.forEach(r => {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  return m;
}

function updateFilterOptions() {
  setOptions(filters.region, [...new Set(shipments.map(r => r.region))].sort());
  const regionFiltered = shipments.filter(r => filters.region.value === 'all' || r.region === filters.region.value);
  setOptions(filters.hub, [...new Set(regionFiltered.map(r => r.hub_id))].sort());
  const hubFiltered = regionFiltered.filter(r => filters.hub.value === 'all' || r.hub_id === filters.hub.value);
  setOptions(filters.district, [...new Set(hubFiltered.map(r => r.district_type))].sort());
  setOptions(filters.service, [...new Set(hubFiltered.map(r => r.service_type))].sort());
}

function updateKpis(rows) {
  const base = baselineRows(rows);
  const orders = rows.length;
  const otd = avg(rows, r => r.on_time_flag);
  const sla = weightedSla(rows);
  const failure = avg(rows, r => r.first_attempt_success_flag ? 0 : 1); // stronger than final_status for ops story
  const complaints = avg(rows, r => r.complaint_flag);
  const delay = meanOfPositive(rows, r => r.delay_days);
  const baselineOtd = avg(base, r => r.on_time_flag);
  const baselineFailure = avg(base, r => r.first_attempt_success_flag ? 0 : 1);
  const baselineComplaint = avg(base, r => r.complaint_flag);

  document.getElementById('kpiOrders').textContent = num(orders);
  document.getElementById('kpiOrdersNote').textContent = `${filters.window.value.toUpperCase()} selection`;

  document.getElementById('kpiOTD').textContent = pct(otd);
  document.getElementById('kpiOTDNote').textContent = base.length ? `${pp(otd - baselineOtd)} vs pre-window baseline` : 'Baseline unavailable';

  document.getElementById('kpiSLAGap').textContent = sla == null || otd == null ? '-' : pp(otd - sla);
  document.getElementById('kpiSLAGapNote').textContent = sla == null ? 'No SLA mapping' : `Weighted SLA ${pct(sla)}`;

  document.getElementById('kpiFailure').textContent = pct(failure);
  document.getElementById('kpiFailureNote').textContent = base.length ? `${pp(failure - baselineFailure)} vs pre-window baseline` : 'Baseline unavailable';

  document.getElementById('kpiComplaint').textContent = pct(complaints);
  document.getElementById('kpiComplaintNote').textContent = base.length ? `${pp(complaints - baselineComplaint)} vs pre-window baseline` : 'Baseline unavailable';

  document.getElementById('kpiDelay').textContent = dec(delay, 2);
}

function plotTrend(rows) {
  const grouped = [...groupBy(rows, r => r.order_date).entries()].sort((a,b) => a[0].localeCompare(b[0]));
  const x = grouped.map(([k]) => k);
  const orders = grouped.map(([,v]) => v.length);
  const otd = grouped.map(([,v]) => v.reduce((s,r)=>s+r.on_time_flag,0)/v.length);

  const data = [
    {
      x, y: otd, type: 'scatter', mode: 'lines+markers', name: 'OTD',
      yaxis: 'y1', line: {color: COLORS.accent, width: 3}, marker: {size: 6}
    },
    {
      x, y: orders, type: 'bar', name: 'Orders',
      yaxis: 'y2', marker: {color: 'rgba(147,197,253,0.45)'}
    }
  ];
  const layout = baseLayout();
  layout.margin = {l: 48, r: 52, t: 16, b: 40};
  layout.yaxis = {title: 'OTD', tickformat: '.0%', gridcolor: COLORS.grid};
  layout.yaxis2 = {title: 'Orders', overlaying: 'y', side: 'right', showgrid: false};
  Plotly.newPlot('trendChart', data, layout, {displayModeBar:false, responsive:true});
}

function plotComparison(rows) {
  const currentFilter = rows.filter(r => r.order_date >= POST_START);
  const baseline = baselineRows(rows);
  const kpis = [
    ['OTD', avg],
    ['First-attempt success', (arr, fn)=>avg(arr, r=>r.first_attempt_success_flag)],
    ['Complaint rate', (arr, fn)=>avg(arr, r=>r.complaint_flag)],
    ['Return rate', (arr, fn)=>avg(arr, r=>r.return_flag)],
    ['Reattempt rate', (arr, fn)=>avg(arr, r=>r.reattempt_flag)]
  ];
  const x = kpis.map(k=>k[0]);
  const preVals = [
    avg(baseline, r=>r.on_time_flag),
    avg(baseline, r=>r.first_attempt_success_flag),
    avg(baseline, r=>r.complaint_flag),
    avg(baseline, r=>r.return_flag),
    avg(baseline, r=>r.reattempt_flag)
  ];
  const postVals = [
    avg(currentFilter, r=>r.on_time_flag),
    avg(currentFilter, r=>r.first_attempt_success_flag),
    avg(currentFilter, r=>r.complaint_flag),
    avg(currentFilter, r=>r.return_flag),
    avg(currentFilter, r=>r.reattempt_flag)
  ];

  const data = [
    {x, y: preVals, type:'bar', name:'Pre', marker:{color:'rgba(134,239,172,0.7)'}},
    {x, y: postVals, type:'bar', name:'Post', marker:{color:'rgba(252,165,165,0.75)'}}
  ];
  const layout = baseLayout();
  layout.barmode = 'group';
  layout.yaxis = {tickformat: '.0%', gridcolor: COLORS.grid};
  layout.margin = {l: 48, r: 16, t: 16, b: 80};
  Plotly.newPlot('comparisonChart', data, layout, {displayModeBar:false, responsive:true});
}

function plotHubContribution(rows) {
  const post = rows.filter(r => r.order_date >= POST_START);
  const grouped = [...groupBy(post, r => r.hub_id).entries()].map(([hub, vals]) => ({
    hub,
    orders: vals.length,
    lateOrders: vals.reduce((s,r)=>s+(r.on_time_flag ? 0 : 1),0),
    lateRate: 1 - vals.reduce((s,r)=>s+r.on_time_flag,0)/vals.length
  })).sort((a,b)=>b.lateOrders-a.lateOrders).slice(0,8);

  const data = [{
    x: grouped.map(d=>d.lateOrders),
    y: grouped.map(d=>d.hub),
    type:'bar',
    orientation:'h',
    marker:{color: grouped.map(d=>d.lateRate), colorscale:'Reds', showscale:false}
  }];
  const layout = baseLayout();
  layout.margin = {l: 100, r: 24, t: 16, b: 40};
  layout.xaxis = {title:'Late orders', gridcolor: COLORS.grid};
  Plotly.newPlot('hubContributionChart', data, layout, {displayModeBar:false, responsive:true});
}

function plotUtilization(opsRows) {
  const data = [{
    x: opsRows.map(r=>r.utilization_ratio),
    y: opsRows.map(r=>r.late_rate),
    text: opsRows.map(r=>`${r.hub_id}<br>${r.order_date}`),
    mode:'markers',
    type:'scatter',
    marker:{
      size: opsRows.map(r=>Math.max(8, Math.sqrt(r.orders)*2)),
      color: opsRows.map(r=>r.orders),
      colorscale:'Blues',
      opacity:0.8,
      line:{width:1, color:'rgba(255,255,255,0.18)'}
    },
    hovertemplate:'%{text}<br>Utilization: %{x:.1%}<br>Late rate: %{y:.1%}<br>Orders: %{marker.color}<extra></extra>'
  }];
  const layout = baseLayout();
  layout.margin = {l: 52, r: 24, t: 16, b: 44};
  layout.xaxis = {title:'Utilization ratio', tickformat:'.0%', gridcolor: COLORS.grid};
  layout.yaxis = {title:'Late rate', tickformat:'.0%', gridcolor: COLORS.grid};
  Plotly.newPlot('utilizationChart', data, layout, {displayModeBar:false, responsive:true});
}

function plotHeatmap(rows) {
  const districts = ['inner','outer'];
  const services = ['same_day','next_day','standard'];
  const z = districts.map(d => services.map(s => {
    const subset = rows.filter(r => r.district_type === d && r.service_type === s);
    return subset.length ? subset.reduce((a,b)=>a+b.on_time_flag,0)/subset.length : null;
  }));
  const data = [{
    x: services,
    y: districts,
    z,
    type:'heatmap',
    colorscale:'RdYlGn',
    reversescale:false,
    zmin:0.55,
    zmax:1,
    text: z.map(row=>row.map(v => v == null ? '-' : pct(v))),
    texttemplate:'%{text}',
    hovertemplate:'District: %{y}<br>Service: %{x}<br>OTD: %{z:.1%}<extra></extra>'
  }];
  const layout = baseLayout();
  layout.margin = {l: 70, r: 16, t: 16, b: 50};
  Plotly.newPlot('segmentHeatmap', data, layout, {displayModeBar:false, responsive:true});
}

function plotCycle(rows) {
  const pre = baselineRows(rows);
  const post = rows.filter(r => r.order_date >= POST_START);
  const metrics = ['pickup_hours','sort_hours','linehaul_hours','last_mile_hours'];
  const names = ['Pickup','Sort','Linehaul','Last mile'];

  const data = [
    {
      x: names,
      y: metrics.map(m => avg(pre, r=>r[m])),
      type:'bar',
      name:'Pre',
      marker:{color:'rgba(134,239,172,0.7)'}
    },
    {
      x: names,
      y: metrics.map(m => avg(post, r=>r[m])),
      type:'bar',
      name:'Post',
      marker:{color:'rgba(196,181,253,0.75)'}
    }
  ];
  const layout = baseLayout();
  layout.barmode = 'group';
  layout.margin = {l: 48, r: 16, t: 16, b: 54};
  layout.yaxis = {title:'Hours', gridcolor: COLORS.grid};
  Plotly.newPlot('cycleChart', data, layout, {displayModeBar:false, responsive:true});
}

function updateDriverTable(rows) {
  const post = rows.filter(r => r.order_date >= POST_START);
  const grouped = [...groupBy(post, r => r.hub_id).entries()].map(([hub, vals]) => ({
    hub,
    orders: vals.length,
    lateOrders: vals.reduce((s,r)=>s+(r.on_time_flag ? 0 : 1),0),
    lateRate: 1 - vals.reduce((s,r)=>s+r.on_time_flag,0)/vals.length,
    complaintRate: vals.reduce((s,r)=>s+r.complaint_flag,0)/vals.length,
    returnRate: vals.reduce((s,r)=>s+r.return_flag,0)/vals.length
  })).sort((a,b)=>b.lateOrders-a.lateOrders).slice(0,8);

  const tbody = document.querySelector('#driverTable tbody');
  tbody.innerHTML = grouped.map(r => `
    <tr>
      <td>${r.hub}</td>
      <td>${num(r.orders)}</td>
      <td>${num(r.lateOrders)}</td>
      <td>${pct(r.lateRate)}</td>
      <td>${pct(r.complaintRate)}</td>
      <td>${pct(r.returnRate)}</td>
    </tr>
  `).join('');
}

function baseLayout() {
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {color: COLORS.text, family: 'Inter, sans-serif'},
    xaxis: {gridcolor: COLORS.grid, zerolinecolor: COLORS.grid},
    yaxis: {gridcolor: COLORS.grid, zerolinecolor: COLORS.grid},
    legend: {orientation:'h', y:1.12},
    hoverlabel: {bgcolor:'#0f1734', bordercolor:'rgba(255,255,255,0.1)', font:{color:COLORS.text}}
  };
}

function refresh() {
  updateFilterOptions();
  const rows = applyFilters();
  const opsRows = filteredHubOps();
  updateKpis(rows);
  plotTrend(rows);
  plotComparison(rows);
  plotHubContribution(rows);
  plotUtilization(opsRows);
  plotHeatmap(rows);
  plotCycle(rows);
  updateDriverTable(rows);
}

async function init() {
  const [shipRes, hubRes, slaRes] = await Promise.all([
    fetch('data/ka_fashion_shipments.json'),
    fetch('data/ka_fashion_hub_ops.json'),
    fetch('data/ka_fashion_sla.json')
  ]);
  shipments = await shipRes.json();
  hubOps = await hubRes.json();
  slaMap = await slaRes.json();

  Object.values(filters).forEach(el => el.addEventListener('change', refresh));
  document.getElementById('resetFilters').addEventListener('click', () => {
    filters.window.value = 'post';
    filters.region.value = 'all';
    filters.hub.value = 'all';
    filters.district.value = 'all';
    filters.service.value = 'all';
    refresh();
  });

  updateFilterOptions();
  refresh();
}

init();
