(() => {
  "use strict";

  const demoNet = 8426580;
  const spans = { "1M": 30, "3M": 91, "6M": 183, "1Y": 365, ALL: 730 };
  const day = 86400000;
  const money = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  // Demo history is shared across all ranges. Account edits only affect the latest balance.
  const history = [
    [-730, .742], [-692, .749], [-658, .776], [-625, .768], [-595, .786],
    [-569, .783], [-544, .818], [-510, .825], [-485, .811], [-453, .849],
    [-419, .854], [-398, .882], [-380, .871], [-365, 1 - 934956 / demoNet],
    [-352, .884], [-342, .896], [-331, .892], [-316, .912], [-306, .905],
    [-296, .918], [-285, .902], [-278, .901], [-266, .912], [-252, .907],
    [-245, .922], [-235, .923], [-221, .937], [-212, .934], [-201, .943],
    [-191, .932], [-183, .936], [-173, .931], [-161, .944], [-147, .939],
    [-136, .955], [-125, .957], [-116, .968], [-104, .962], [-97, .969],
    [-91, .959], [-80, .965], [-69, .955], [-62, .963], [-54, .961],
    [-43, .979], [-35, .975], [-30, .981], [-22, .985], [-18, .981],
    [-12, .992], [-7, .987], [-3, .996], [0, 1]
  ];

  function buildHistory() {
    const values = [];
    let segment = 0;
    for (let i = -730; i <= 0; i++) {
      while (history[segment + 1][0] < i) segment++;
      const [a, start] = history[segment];
      const [b, end] = history[segment + 1];
      const t = (i - a) / (b - a);
      const detail = Math.sin(i * .81) * .0017 + Math.cos(i * 2.19) * .0013;
      values.push(start + (end - start) * t + detail * Math.sin(Math.PI * t));
    }
    return values;
  }

  const demoBalances = buildHistory().map(factor => demoNet * factor);
  const spanFor = period => spans[period] || spans["1Y"];

  function timeline(period, net, snapshots, date) {
    const live = Array.isArray(snapshots);
    const today = new Date();
    const localToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const asOf = Date.parse(date);
    const end = Number.isFinite(asOf) ? Math.floor(asOf / day) * day
      : live ? localToday : Date.UTC(2026, 10, 21);
    if (!live) {
      const span = spanFor(period);
      const points = demoBalances.slice(-span - 1).map((value, offset) => ({ value, offset }));
      points[span].value = Number.isFinite(net) ? net : demoNet;
      return { start: end - span * day, span, points };
    }

    const daily = new Map();
    for (const entry of snapshots) {
      if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) continue;
      const stamp = Date.parse(entry.date);
      if (stamp <= end && Number.isFinite(entry.net)) daily.set(stamp, entry.net);
    }
    const dates = Array.from(daily.keys()).sort((a, b) => a - b);
    if (!dates.length) return { points: [] };
    const latest = Number.isFinite(net) ? net : daily.get(dates[dates.length - 1]);
    if (dates.length === 1) return { start: dates[0], span: 0, points: [{ offset: 0, value: latest }] };

    const cutoff = period === "ALL" ? dates[0] : end - spanFor(period) * day;
    const visible = dates.filter(stamp => stamp >= cutoff);
    const start = Math.max(dates[0], cutoff);
    const span = (end - start) / day;
    const points = visible.map(stamp => ({ offset: (stamp - start) / day, value: daily.get(stamp) }));
    if (!points.length || points[0].offset > 0) {
      const previous = dates.filter(stamp => stamp < start).pop();
      points.unshift({ offset: 0, value: daily.get(previous) });
    }
    const last = points[points.length - 1];
    if (last.offset === span) last.value = latest;
    else points.push({ offset: span, value: latest });
    return { start, span, points };
  }

  window.trendChange = (period, net, snapshots, date) => {
    const { points } = timeline(period, net, snapshots, date);
    return points.length ? Math.round((points[points.length - 1].value - points[0].value) * 100) / 100 : 0;
  };

  function axisFor(min, max) {
    const rough = (max - min || Math.max(Math.abs(max) * .1, 30000)) / 3;
    const unit = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = ([1, 2, 2.5, 5, 10].find(s => s * unit >= rough) || 10) * unit;
    let low = Math.floor(min / step) * step;
    let high = Math.ceil(max / step) * step;
    if (low === high) { low -= step; high += step; }
    return { low, high, step };
  }

  function axisLabel(value, step) {
    if (Math.abs(step) >= 1000) {
      return Number((value / 10000).toFixed(2)).toLocaleString("zh-CN") + "万";
    }
    return Number(value.toFixed(2)).toLocaleString("zh-CN");
  }

  let observer;
  let activeHost;
  let activeOptions;
  let frame;
  let dismissProbe;

  document.addEventListener("pointerdown", event => {
    if (activeHost && !activeHost.contains(event.target)) dismissProbe?.();
  });

  function paint(plot, options) {
    const width = Math.max(180, plot.clientWidth || 640);
    const height = Math.max(104, plot.clientHeight || 198);
    const { period = "1Y", hidden = false, snapshots, date } = options;
    const { points, start, span } = timeline(period, options.net, snapshots, date);
    dismissProbe = undefined;
    if (!points.length) {
      plot.innerHTML = '<div role="status" style="display:grid;place-items:center;min-height:116px;height:100%;font-size:14px;color:var(--muted,#707070)">记录资产后即可查看走势</div>';
      return;
    }
    const net = points[points.length - 1].value;
    const min = points.reduce((amount, point) => Math.min(amount, point.value), net);
    const max = points.reduce((amount, point) => Math.max(amount, point.value), net);
    const { low, high, step } = axisFor(min, max);
    const left = 2;
    const labelLength = Math.max(axisLabel(low, step).length, axisLabel(high, step).length);
    const right = width - Math.max(42, labelLength * 7.5 + 11);
    const top = 11;
    const bottom = height - 24;
    const x = i => span ? left + i / span * (right - left) : right;
    const y = value => bottom - (value - low) / (high - low) * (bottom - top);
    const dateAt = i => new Date(start + i * day);
    const xTicks = Math.min(span + 1, width < 380 ? 4 : 7, Math.floor((right - left) / 52) + 1);
    const tickText = i => {
      const d = dateAt(i);
      if (!span) return d.toISOString().slice(0, 10);
      if (span <= 91) return String(d.getUTCMonth() + 1).padStart(2, "0") +
        "." + String(d.getUTCDate()).padStart(2, "0");
      if (span > 365) return String(d.getUTCFullYear()).slice(-2) + "." +
        String(d.getUTCMonth() + 1).padStart(2, "0");
      return (d.getUTCMonth() + 1) + "月";
    };

    const pieces = [];
    for (let tick = low; tick <= high + step / 100; tick += step) {
      const level = y(tick).toFixed(2);
      pieces.push(`<line x1="${left}" x2="${right}" y1="${level}" y2="${level}" stroke="var(--line,#e5e5e5)"/>`);
      pieces.push(`<text x="${width - 1}" y="${level}" dy=".35em" text-anchor="end">${hidden ? "•••" : axisLabel(tick, step)}</text>`);
    }
    for (let k = 0; k < xTicks; k++) {
      const i = xTicks === 1 ? 0 : Math.round(k / (xTicks - 1) * span);
      const anchor = k === xTicks - 1 ? "end" : k === 0 ? "start" : "middle";
      pieces.push(`<text x="${x(i)}" y="${height - 4}" text-anchor="${anchor}">${tickText(i)}</text>`);
    }
    const path = points.map(({ value, offset }, i) => {
      const px = x(offset).toFixed(2), py = y(value).toFixed(2);
      if (i === 0) return "M" + px + " " + py;
      return Array.isArray(snapshots) ? "H" + px + "V" + py : "L" + px + " " + py;
    }).join("");
    const seriesPaths = span ? `<path d="${path}L${right} ${bottom}L${left} ${bottom}Z" fill="url(#monoTrendFill)"/>
        <path d="${path}" fill="none" stroke="var(--ink,#242424)" stroke-width="1.7"
          stroke-linejoin="round" stroke-linecap="round"/>` : "";
    const endY = y(net).toFixed(2);
    plot.style.position = "relative";
    plot.innerHTML = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}"
        tabindex="0" role="img" aria-label="净资产趋势图，可使用左右方向键查看每日数值"
        style="display:block;outline-offset:4px;touch-action:pan-y pinch-zoom;font-variant-numeric:tabular-nums">
        <defs><linearGradient id="monoTrendFill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="var(--ink,#242424)" stop-opacity=".12"/>
          <stop offset="100%" stop-color="var(--ink,#242424)" stop-opacity=".015"/>
        </linearGradient></defs>
        <g fill="var(--muted,#707070)" font-family="inherit" font-size="11.5">${pieces.join("")}</g>
        ${seriesPaths}
        <circle cx="${right}" cy="${endY}" r="5.7" fill="var(--ink,#242424)" opacity=".1"/>
        <circle cx="${right}" cy="${endY}" r="3.1" fill="var(--ink,#242424)"/>
        <g data-cursor visibility="hidden" pointer-events="none">
          <line y1="${top}" y2="${bottom}" stroke="var(--muted,#707070)" stroke-opacity=".55" stroke-dasharray="3 4"/>
          <circle r="4.4" fill="var(--ink,#242424)" stroke="var(--surface,#fff)" stroke-width="1.8"/>
        </g>
      </svg><div data-tip role="status" hidden style="position:absolute;z-index:2;pointer-events:none;
        box-sizing:border-box;white-space:nowrap;border:1px solid var(--line,#e5e5e5);border-radius:12px;
        background:var(--surface,#fff);color:var(--ink,#242424);padding:8px 11px;line-height:1.55;
        font:inherit;font-size:13px;font-variant-numeric:tabular-nums;box-shadow:0 5px 18px #00000012"></div>`;

    const svg = plot.firstElementChild;
    const cursor = svg.querySelector("[data-cursor]");
    const tooltip = plot.querySelector("[data-tip]");
    let index = span;
    function show(i) {
      index = Math.max(0, Math.min(span, i));
      let pointIndex = points.length - 1;
      while (points[pointIndex].offset > index) pointIndex--;
      const value = points[pointIndex].value;
      const px = x(index), py = y(value);
      const [line, circle] = cursor.children;
      line.setAttribute("x1", px);
      line.setAttribute("x2", px);
      circle.setAttribute("cx", px);
      circle.setAttribute("cy", py);
      cursor.setAttribute("visibility", "visible");
      tooltip.innerHTML = `<span style="color:var(--muted,#707070);font-size:12px">${dateAt(index).toISOString().slice(0, 10)}</span><br>
        <strong style="font-weight:550">${hidden ? "••••••" : "¥ " + money.format(value)}</strong>`;
      tooltip.hidden = false;
      const tipWidth = tooltip.offsetWidth;
      tooltip.style.left = Math.max(0, Math.min(width - tipWidth, px + tipWidth + 12 < right ? px + 12 : px - tipWidth - 12)) + "px";
      tooltip.style.top = Math.max(0, Math.min(height - tooltip.offsetHeight, py - 25)) + "px";
    }
    function hide() {
      cursor.setAttribute("visibility", "hidden");
      tooltip.hidden = true;
    }
    dismissProbe = hide;
    function track(event) {
      const rect = svg.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width * width;
      show(Math.round((px - left) / (right - left) * span));
    }
    svg.onpointermove = svg.onpointerdown = track;
    svg.onpointerleave = event => { if (event.pointerType !== "touch") hide(); };
    svg.onpointercancel = svg.onblur = hide;
    svg.onfocus = () => { if (tooltip.hidden) show(index); };
    svg.onkeydown = event => {
      const moves = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: span };
      if (event.key === "Escape") hide();
      if (Object.prototype.hasOwnProperty.call(moves, event.key)) {
        event.preventDefault();
        show(moves[event.key]);
      }
    };
  }

  window.renderTrend = (options = {}) => {
    const plot = document.getElementById("trendPlot");
    if (!plot) return;
    activeOptions = options;
    if (activeHost !== plot) {
      observer?.disconnect();
      activeHost = plot;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => paint(activeHost, activeOptions));
        });
        observer.observe(plot);
      }
    }
    paint(plot, options);
  };
})();
