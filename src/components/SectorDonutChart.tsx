const SERIES_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

export type SectorSlice = {
  sector: string;
  value: number;
};

function buildArcs(slices: SectorSlice[]) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return [];

  const gapDeg = 2; // 세그먼트 사이 시각적 간격
  let cursor = -90; // 12시 방향부터 시작
  return slices.map((slice, i) => {
    const fraction = slice.value / total;
    const sweep = fraction * 360 - gapDeg;
    const start = cursor;
    const end = cursor + Math.max(sweep, 0);
    cursor += fraction * 360;
    return {
      ...slice,
      fraction,
      start,
      end,
      color: SERIES_VARS[i % SERIES_VARS.length],
    };
  });
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number) {
  const outerStart = polarToCartesian(cx, cy, rOuter, start);
  const outerEnd = polarToCartesian(cx, cy, rOuter, end);
  const innerStart = polarToCartesian(cx, cy, rInner, end);
  const innerEnd = polarToCartesian(cx, cy, rInner, start);
  const largeArc = end - start > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

export function SectorDonutChart({ slices, title }: { slices: SectorSlice[]; title: string }) {
  const arcs = buildArcs(slices);
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 90;
  const rInner = 55;

  if (arcs.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <h3 className="mb-2 font-semibold">{title}</h3>
        <p className="text-sm text-gray-500">데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          role="img"
          aria-label={`${title} 섹터 비중 도넛 차트`}
        >
          {arcs.map((arc) => (
            <path
              key={arc.sector}
              d={arcPath(cx, cy, rOuter, rInner, arc.start, arc.end)}
              style={{ fill: arc.color, stroke: "var(--chart-surface)" }}
              strokeWidth={2}
            />
          ))}
        </svg>
        <ul className="w-full space-y-1 text-sm">
          {arcs.map((arc) => (
            <li key={arc.sector} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: arc.color }}
              />
              <span className="flex-1 text-gray-700 dark:text-gray-300">{arc.sector}</span>
              <span className="tabular-nums text-gray-500">
                {(arc.fraction * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
