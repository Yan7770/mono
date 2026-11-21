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
  window.trendChange = (period, net = demoNet) =>
    Math.round((net - demoBalances[730 - spanFor(period)]) * 100) / 100;

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

  function paint(plot, options) {
    const width = Math.max(180, plot.clientWidth || 640);
    const height = Math.max(104, plot.clientHeight || 198);
    const { period = "1Y", hidden = false, date = "2026-11-21" } = options;
    const net = Number.isFinite(Number(options.net)) ? Number(options.net) : demoNet;
    const endDate = Date.parse(date);
    const endTime = Number.isFinite(endDate) ? endDate : Date.UTC(2026, 10, 21);
    const span = spanFor(period);
    const values = demoBalances.slice(-span - 1);
    values[span] = net;
    const { low, high, step } = axisFor(Math.min(...values), Math.max(...values));
    const left = 2;
    const right = width - Math.max(44, axisLabel(high, step).length * 7.2 + 13);
    const top = 8;
    const bottom = height - 26;
    const x = i => left + i / span * (right - left);
    const y = value => bottom - (value - low) / (high - low) * (bottom - top);
    const dateAt = i => new Date(endTime + (i - span) * day);
    const xTicks = Math.min(width < 400 ? 4 : 7, Math.floor((right - left) / 49) + 1);
    const tickText = i => {
      const d = dateAt(i);
      if (span <= 91) return String(d.getUTCMonth() + 1).padStart(2, "0") +
        "." + String(d.getUTCDate()).padStart(2, "0");
      if (span === 730) return String(d.getUTCFullYear()).slice(-2) + "." +
        String(d.getUTCMonth() + 1).padStart(2, "0");
      return (d.getUTCMonth() + 1) + "月";
    };

    const pieces = [];
    for (let tick = low; tick <= high + step / 100; tick += step) {
      const level = y(tick).toFixed(2);
      pieces.push(`<line x1="${left}" x2="${right}" y1="${level}" y2="${level}" stroke="#343630" stroke-dasharray="3 5"/>`);
      pieces.push(`<text x="${width - 1}" y="${level}" text-anchor="end" dominant-baseline="middle">${hidden ? "•••" : axisLabel(tick, step)}</text>`);
    }
    for (let k = 0; k < xTicks; k++) {
      const i = Math.round(k / (xTicks - 1) * span);
      const anchor = k === 0 ? "start" : k === xTicks - 1 ? "end" : "middle";
      pieces.push(`<text x="${x(i)}" y="${height - 3}" text-anchor="${anchor}">${tickText(i)}</text>`);
    }
    const coords = values.map((value, i) => x(i).toFixed(2) + " " + y(value).toFixed(2));
    const path = "M" + coords.join("L");
    const endY = y(net).toFixed(2);
    plot.style.position = "relative";
    plot.innerHTML = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}"
        tabindex="0" role="img" aria-label="净资产趋势图，可使用左右方向键查看每日数值"
        style="display:block;outline-offset:4px;touch-action:pan-y">
        <defs><linearGradient id="monoTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#d6ba78" stop-opacity=".16"/>
          <stop offset="100%" stop-color="#d6ba78" stop-opacity="0"/>
        </linearGradient></defs>
        <g fill="#93958d" font-family="'IBM Plex Mono',Consolas,'Microsoft YaHei',monospace"
          font-size="11">${pieces.join("")}</g>
        <path d="${path}L${right} ${bottom}L${left} ${bottom}Z" fill="url(#monoTrendFill)"/>
        <path d="${path}" fill="none" stroke="#dabe80" stroke-width="1.8"
          stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${right}" cy="${endY}" r="6" fill="#dabe80" opacity=".13"/>
        <circle cx="${right}" cy="${endY}" r="3.15" fill="#e3c991"/>
        <g data-cursor visibility="hidden" pointer-events="none">
          <line y1="${top}" y2="${bottom}" stroke="#a09271" stroke-dasharray="3 4"/>
          <circle r="4" fill="#e7c989" stroke="#20211f" stroke-width="1.5"/>
        </g>
      </svg><div data-tip role="status" hidden style="position:absolute;z-index:2;pointer-events:none;
        box-sizing:border-box;white-space:nowrap;border:1px solid #504b3e;border-radius:5px;
        background:#20211f;color:#eeeae1;padding:7px 10px;line-height:1.55;font-family:inherit;
        font-size:12px;font-variant-numeric:tabular-nums;box-shadow:0 4px 14px #0004"></div>`;

    const svg = plot.firstElementChild;
    const cursor = svg.querySelector("[data-cursor]");
    const tooltip = plot.querySelector("[data-tip]");
    let index = span;
    function show(i) {
      index = Math.max(0, Math.min(span, i));
      const px = x(index), py = y(values[index]);
      const [line, circle] = cursor.children;
      line.setAttribute("x1", px);
      line.setAttribute("x2", px);
      circle.setAttribute("cx", px);
      circle.setAttribute("cy", py);
      cursor.setAttribute("visibility", "visible");
      tooltip.innerHTML = `<span style="color:#a6a79e">${dateAt(index).toISOString().slice(0, 10)}</span><br>
        <strong>${hidden ? "••••••" : "¥ " + money.format(values[index])}</strong>`;
      tooltip.hidden = false;
      const tipWidth = tooltip.offsetWidth;
      tooltip.style.left = Math.max(0, Math.min(width - tipWidth, px + tipWidth + 12 < right ? px + 12 : px - tipWidth - 12)) + "px";
      tooltip.style.top = Math.max(0, Math.min(height - tooltip.offsetHeight, py - 25)) + "px";
    }
    function hide() {
      cursor.setAttribute("visibility", "hidden");
      tooltip.hidden = true;
    }
    function track(event) {
      const rect = svg.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width * width;
      show(Math.round((px - left) / (right - left) * span));
    }
    svg.onpointermove = svg.onpointerdown = track;
    svg.onpointerleave = svg.onblur = hide;
    svg.onfocus = () => show(span);
    svg.onkeydown = event => {
      const moves = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: span };
      if (event.key === "Escape") hide();
      if (Object.hasOwn(moves, event.key)) {
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
