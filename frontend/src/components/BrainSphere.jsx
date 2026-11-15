import { useEffect, useRef, useState, useMemo } from "react";

/**
 * BrainSphere — 3D rotating brain-like sphere of dots.
 * Each dot represents a memory item. Pure SVG + requestAnimationFrame, no deps.
 * Props:
 *  - items: [{ id, title, kind, color? }]
 *  - onItemHover(item)
 *  - onItemClick(item)
 *  - height (px)
 */
export default function BrainSphere({ items = [], onItemHover, onItemClick, height = 380 }) {
  const [rot, setRot] = useState({ x: 0.35, y: 0 });
  const [dragging, setDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Auto-rotate when not dragging
  useEffect(() => {
    let raf;
    const tick = () => {
      if (!dragging) setRot((r) => ({ ...r, y: r.y + 0.003 }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragging]);

  // Fibonacci lattice on a sphere → dot positions
  const dots = useMemo(() => {
    const N = Math.max(60, items.length + 40); // more density for brain feel
    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
    }
    // Add a bit of noise to feel brain-y
    return pts.map((p, i) => {
      const jitter = 0.06 * Math.sin(i * 3.71);
      const s = 1 + jitter;
      return { ...p, x: p.x * s, y: p.y * s, z: p.z * s, item: items[i] || null };
    });
  }, [items]);

  const rotate = (p) => {
    const { x: rx, y: ry } = rot;
    let { x, y, z } = p;
    // Y rotation
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    // X rotation
    const cx = Math.cos(rx), sx = Math.sin(rx);
    const y2 = y * cx - z1 * sx;
    const z2 = y * sx + z1 * cx;
    return { x: x1, y: y2, z: z2 };
  };

  const size = height;
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.36;

  // Project + sort by depth
  const projected = dots.map((d, i) => {
    const r = rotate(d);
    const depth = (r.z + 1.4) / 2.8; // 0..1
    return {
      idx: i,
      px: cx + r.x * radius,
      py: cy + r.y * radius,
      depth,
      item: d.item,
    };
  }).sort((a, b) => a.depth - b.depth);

  const onMouseDown = (e) => {
    setDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setRot((r) => ({ x: Math.max(-1.3, Math.min(1.3, r.x + dy * 0.005)), y: r.y + dx * 0.005 }));
  };
  const onMouseUp = () => setDragging(false);
  const onTouchStart = (e) => { setDragging(true); const t = e.touches[0]; lastPos.current = { x: t.clientX, y: t.clientY }; };
  const onTouchMove = (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - lastPos.current.x;
    const dy = t.clientY - lastPos.current.y;
    lastPos.current = { x: t.clientX, y: t.clientY };
    setRot((r) => ({ x: Math.max(-1.3, Math.min(1.3, r.x + dy * 0.005)), y: r.y + dx * 0.005 }));
  };
  const onTouchEnd = () => setDragging(false);

  const hoveredItem = hoveredIdx != null ? projected.find((p) => p.idx === hoveredIdx)?.item : null;

  return (
    <div className="relative w-full flex items-center justify-center select-none" style={{ height }}>
      <svg
        width={size}
        height={size}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ cursor: dragging ? "grabbing" : "grab" }}
      >
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={radius * 1.15} fill="url(#glow)" />

        {/* Connection lines between nearby dots for brain-like network */}
        {projected.map((p, i) => {
          if (i % 2 !== 0) return null;
          const next = projected[i + 3];
          if (!next) return null;
          const dist = Math.hypot(p.px - next.px, p.py - next.py);
          if (dist > radius * 0.35) return null;
          const opacity = 0.06 + p.depth * 0.14;
          return (
            <line
              key={`l-${i}`}
              x1={p.px} y1={p.py} x2={next.px} y2={next.py}
              stroke="hsl(var(--primary))"
              strokeWidth={0.5}
              opacity={opacity}
            />
          );
        })}

        {projected.map((p) => {
          const isFilled = !!p.item;
          const r = isFilled ? 4 + p.depth * 3 : 1.4 + p.depth * 1.4;
          const opacity = 0.25 + p.depth * 0.75;
          const color = p.item?.color || "hsl(var(--primary))";
          return (
            <g key={p.idx}>
              <circle
                cx={p.px} cy={p.py} r={r}
                fill={isFilled ? color : "hsl(var(--foreground))"}
                opacity={isFilled ? opacity : opacity * 0.35}
                style={{ cursor: isFilled ? "pointer" : "default" }}
                onMouseEnter={() => { if (isFilled) { setHoveredIdx(p.idx); onItemHover?.(p.item); } }}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => isFilled && onItemClick?.(p.item)}
              />
              {isFilled && hoveredIdx === p.idx && (
                <circle cx={p.px} cy={p.py} r={r + 4} fill="none" stroke={color} strokeWidth={1.2} opacity={0.8} />
              )}
            </g>
          );
        })}
      </svg>

      {hoveredItem && (
        <div className="absolute top-2 left-2 max-w-[240px] bg-neutral-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none">
          <div className="text-[10px] font-mono uppercase tracking-widest opacity-60 mb-0.5">
            {hoveredItem.kind}
          </div>
          <div className="font-medium">{hoveredItem.title}</div>
        </div>
      )}

      <div className="absolute bottom-2 right-2 text-[10px] font-mono text-muted-foreground">
        {items.length} memórias · arraste para girar
      </div>
    </div>
  );
}
