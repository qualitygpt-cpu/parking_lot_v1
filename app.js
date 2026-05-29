const sitePolygon = [
  { x: 0, y: 0 },
  { x: 42, y: 0 },
  { x: 42, y: 22 },
  { x: 30, y: 22 },
  { x: 30, y: 34 },
  { x: 0, y: 34 },
];

let stallWidth = 2.5;
let stallLength = 5.3;
let aisleWidth = 6.0;
let gridStep = 0.5;

const SCALE = 18;
const SVG_PADDING = 28;
const SVG_NS = 'http://www.w3.org/2000/svg';
const CELL_EMPTY = 'empty';
const CELL_STALL = 'stall';
const CELL_AISLE = 'aisle';
const CELL_OUTSIDE = 'outside';

const inputs = {
  stallWidth: document.getElementById('stallWidthInput'),
  stallLength: document.getElementById('stallLengthInput'),
  aisleWidth: document.getElementById('aisleWidthInput'),
  gridStep: document.getElementById('gridStepInput'),
};
const recalculateButton = document.getElementById('recalculateButton');
const svgContainer = document.getElementById('svgContainer');
const statsList = document.getElementById('statsList');

function cellsKey(xIndex, yIndex) {
  return `${xIndex}:${yIndex}`;
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
    const onSegment =
      Math.abs(cross) < 1e-9 &&
      point.x >= Math.min(a.x, b.x) - 1e-9 &&
      point.x <= Math.max(a.x, b.x) + 1e-9 &&
      point.y >= Math.min(a.y, b.y) - 1e-9 &&
      point.y <= Math.max(a.y, b.y) + 1e-9;

    if (onSegment) {
      return true;
    }

    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function rectToPolygon(x, y, width, height, rotationDeg) {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = x + width / 2;
  const cy = y + height / 2;
  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];

  return corners.map((corner) => {
    const dx = corner.x - cx;
    const dy = corner.y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  });
}

function polygonBoundingBox(polygon) {
  return polygon.reduce(
    (box, point) => ({
      minX: Math.min(box.minX, point.x),
      minY: Math.min(box.minY, point.y),
      maxX: Math.max(box.maxX, point.x),
      maxY: Math.max(box.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function polygonArea(polygon) {
  let sum = 0;

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum) / 2;
}

function samplePolygonToGrid(polygon, step) {
  const box = polygonBoundingBox(polygon);
  const startX = Math.floor(box.minX / step);
  const endX = Math.ceil(box.maxX / step) - 1;
  const startY = Math.floor(box.minY / step);
  const endY = Math.ceil(box.maxY / step) - 1;
  const cells = [];

  for (let yIndex = startY; yIndex <= endY; yIndex += 1) {
    for (let xIndex = startX; xIndex <= endX; xIndex += 1) {
      const center = {
        x: (xIndex + 0.5) * step,
        y: (yIndex + 0.5) * step,
      };

      if (pointInPolygon(center, polygon)) {
        cells.push({ xIndex, yIndex, key: cellsKey(xIndex, yIndex), center });
      }
    }
  }

  return cells;
}

function buildRasterModel(polygon, step) {
  const box = polygonBoundingBox(polygon);
  const minXIndex = Math.floor(box.minX / step);
  const maxXIndex = Math.ceil(box.maxX / step) - 1;
  const minYIndex = Math.floor(box.minY / step);
  const maxYIndex = Math.ceil(box.maxY / step) - 1;
  const cells = new Map();
  const insideKeys = new Set();

  for (let yIndex = minYIndex; yIndex <= maxYIndex; yIndex += 1) {
    for (let xIndex = minXIndex; xIndex <= maxXIndex; xIndex += 1) {
      const center = {
        x: (xIndex + 0.5) * step,
        y: (yIndex + 0.5) * step,
      };
      const key = cellsKey(xIndex, yIndex);
      const state = pointInPolygon(center, polygon) ? CELL_EMPTY : CELL_OUTSIDE;
      cells.set(key, { xIndex, yIndex, state });

      if (state !== CELL_OUTSIDE) {
        insideKeys.add(key);
      }
    }
  }

  return { cells, insideKeys, box, minXIndex, maxXIndex, minYIndex, maxYIndex };
}

function polygonToPoints(polygon) {
  return polygon.map((point) => `${toSvgX(point.x)},${toSvgY(point.y)}`).join(' ');
}

function uniqueCellsForPolygons(polygons, step) {
  const cells = new Map();

  polygons.forEach((polygon) => {
    samplePolygonToGrid(polygon, step).forEach((cell) => {
      cells.set(cell.key, cell);
    });
  });

  return Array.from(cells.values());
}

function makeModule(x, y, type) {
  const stalls = [];
  let aisle;
  let totalHeight;

  if (type === 'double') {
    stalls.push(rectToPolygon(x, y, stallWidth, stallLength, 0));
    aisle = rectToPolygon(x, y + stallLength, stallWidth, aisleWidth, 0);
    stalls.push(rectToPolygon(x, y + stallLength + aisleWidth, stallWidth, stallLength, 0));
    totalHeight = stallLength * 2 + aisleWidth;
  } else {
    stalls.push(rectToPolygon(x, y, stallWidth, stallLength, 0));
    aisle = rectToPolygon(x, y + stallLength, stallWidth, aisleWidth, 0);
    totalHeight = stallLength + aisleWidth;
  }

  return {
    type,
    stalls,
    aisle,
    footprint: rectToPolygon(x, y, stallWidth, totalHeight, 0),
  };
}

function moduleCanBePlaced(module, raster, step) {
  const footprintCells = samplePolygonToGrid(module.footprint, step);
  const stallCells = uniqueCellsForPolygons(module.stalls, step);
  const aisleCells = samplePolygonToGrid(module.aisle, step);

  if (footprintCells.length === 0 || stallCells.length === 0 || aisleCells.length === 0) {
    return { ok: false };
  }

  const allModuleCells = new Set([...footprintCells, ...stallCells, ...aisleCells].map((cell) => cell.key));
  for (const key of allModuleCells) {
    if (!raster.insideKeys.has(key)) {
      return { ok: false };
    }
  }

  for (const cell of stallCells) {
    const existing = raster.cells.get(cell.key);
    if (!existing || existing.state === CELL_STALL || existing.state === CELL_AISLE || existing.state === CELL_OUTSIDE) {
      return { ok: false };
    }
  }

  for (const cell of aisleCells) {
    const existing = raster.cells.get(cell.key);
    if (!existing || existing.state === CELL_STALL || existing.state === CELL_OUTSIDE) {
      return { ok: false };
    }
  }

  return { ok: true, stallCells, aisleCells };
}

function placeModule(module, placement, raster, result) {
  placement.aisleCells.forEach((cell) => {
    const existing = raster.cells.get(cell.key);
    if (existing && existing.state !== CELL_STALL) {
      existing.state = CELL_AISLE;
    }
    result.aisleCellKeys.add(cell.key);
  });

  placement.stallCells.forEach((cell) => {
    const existing = raster.cells.get(cell.key);
    if (existing) {
      existing.state = CELL_STALL;
    }
    result.stallCellKeys.add(cell.key);
  });

  result.stalls.push(...module.stalls);
  result.aisles.push(module.aisle);
}

function layoutParking() {
  const raster = buildRasterModel(sitePolygon, gridStep);
  const result = {
    raster,
    stalls: [],
    aisles: [],
    stallCellKeys: new Set(),
    aisleCellKeys: new Set(),
  };
  const box = raster.box;
  const xStep = Math.max(stallWidth, gridStep);
  const doubleHeight = stallLength * 2 + aisleWidth;
  const singleHeight = stallLength + aisleWidth;

  for (let y = box.minY; y + singleHeight <= box.maxY + 1e-9; y += doubleHeight) {
    for (let x = box.minX; x + stallWidth <= box.maxX + 1e-9; x += xStep) {
      const doubleModule = makeModule(x, y, 'double');
      const doublePlacement = moduleCanBePlaced(doubleModule, raster, gridStep);

      if (doublePlacement.ok) {
        placeModule(doubleModule, doublePlacement, raster, result);
        continue;
      }

      const singleModule = makeModule(x, y, 'single');
      const singlePlacement = moduleCanBePlaced(singleModule, raster, gridStep);
      if (singlePlacement.ok) {
        placeModule(singleModule, singlePlacement, raster, result);
      }
    }
  }

  return result;
}

function toSvgX(x) {
  return SVG_PADDING + x * SCALE;
}

function toSvgY(y) {
  return SVG_PADDING + y * SCALE;
}

function createSvgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });
  return element;
}

function polygonCenter(polygon) {
  const box = polygonBoundingBox(polygon);
  return {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2,
  };
}

function appendLabel(svg, text, point, className) {
  const label = createSvgElement('text', {
    x: toSvgX(point.x),
    y: toSvgY(point.y),
    class: className,
  });
  label.textContent = text;
  svg.appendChild(label);
}

function renderGrid(svg, box) {
  for (let x = Math.ceil(box.minX); x <= Math.floor(box.maxX); x += 1) {
    svg.appendChild(
      createSvgElement('line', {
        x1: toSvgX(x),
        y1: toSvgY(box.minY),
        x2: toSvgX(x),
        y2: toSvgY(box.maxY),
        class: 'grid-line',
      }),
    );
  }

  for (let y = Math.ceil(box.minY); y <= Math.floor(box.maxY); y += 1) {
    svg.appendChild(
      createSvgElement('line', {
        x1: toSvgX(box.minX),
        y1: toSvgY(y),
        x2: toSvgX(box.maxX),
        y2: toSvgY(y),
        class: 'grid-line',
      }),
    );
  }
}

function renderSvg(layout) {
  const box = polygonBoundingBox(sitePolygon);
  const width = (box.maxX - box.minX) * SCALE + SVG_PADDING * 2;
  const height = (box.maxY - box.minY) * SCALE + SVG_PADDING * 2;
  const svg = createSvgElement('svg', {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': 'План парковочного участка',
  });

  renderGrid(svg, box);

  layout.aisles.forEach((aisle) => {
    svg.appendChild(createSvgElement('polygon', { points: polygonToPoints(aisle), class: 'aisle' }));
    appendLabel(svg, 'проезд', polygonCenter(aisle), 'label aisle-label');
  });

  layout.stalls.forEach((stall) => {
    svg.appendChild(createSvgElement('polygon', { points: polygonToPoints(stall), class: 'stall' }));
    appendLabel(svg, 'М', polygonCenter(stall), 'label');
  });

  svg.appendChild(createSvgElement('polygon', { points: polygonToPoints(sitePolygon), class: 'site-boundary' }));
  svgContainer.replaceChildren(svg);
}

function formatArea(value) {
  return `${value.toFixed(1)} м²`;
}

function renderStats(layout) {
  const siteArea = polygonArea(sitePolygon);
  const stallArea = layout.stalls.length * stallWidth * stallLength;
  const aisleArea = layout.aisleCellKeys.size * gridStep * gridStep;
  const unusedArea = Math.max(0, siteArea - stallArea - aisleArea);
  const utilization = siteArea > 0 ? stallArea / siteArea : 0;
  const rows = [
    ['Количество машино-мест', layout.stalls.length.toString()],
    ['Площадь участка', formatArea(siteArea)],
    ['Площадь машино-мест', formatArea(stallArea)],
    ['Площадь проездов', formatArea(aisleArea)],
    ['Неиспользованная площадь', formatArea(unusedArea)],
    ['Коэффициент использования', utilization.toFixed(3)],
  ];

  statsList.replaceChildren(
    ...rows.map(([term, value]) => {
      const wrapper = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = value;
      wrapper.append(dt, dd);
      return wrapper;
    }),
  );
}

function readPositiveNumber(input, fallback) {
  const value = Number.parseFloat(input.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function recalculate() {
  stallWidth = readPositiveNumber(inputs.stallWidth, 2.5);
  stallLength = readPositiveNumber(inputs.stallLength, 5.3);
  aisleWidth = readPositiveNumber(inputs.aisleWidth, 6.0);
  gridStep = readPositiveNumber(inputs.gridStep, 0.5);

  inputs.stallWidth.value = stallWidth;
  inputs.stallLength.value = stallLength;
  inputs.aisleWidth.value = aisleWidth;
  inputs.gridStep.value = gridStep;

  const layout = layoutParking();
  renderSvg(layout);
  renderStats(layout);
}

recalculateButton.addEventListener('click', recalculate);
recalculate();
