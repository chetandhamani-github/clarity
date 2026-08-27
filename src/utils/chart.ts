export interface DataPoint {
  value: number;
  date: string;
}

/**
 * Generates an SVG path string (d attribute) from an array of numbers.
 * Scales the points to fit within the given width and height.
 */
export function generateSvgPath(data: number[], width: number, height: number, smooth: boolean = true): string {
  if (!data || data.length === 0) return '';
  if (data.length === 1) return `M 0 ${height / 2} L ${width} ${height / 2}`;

  const min = Math.min(...data);
  const max = Math.max(...data);
  
  // Add some padding to top and bottom (10%)
  const range = max - min;
  const paddedMin = min - (range * 0.1);
  const paddedMax = max + (range * 0.1);
  const scaleY = paddedMax === paddedMin ? 1 : height / (paddedMax - paddedMin);
  
  const stepX = width / (data.length - 1);

  const points = data.map((val, i) => {
    const x = i * stepX;
    // Y is inverted because SVG coordinates go top-down
    let y = height / 2;
    if (paddedMax !== paddedMin) {
      y = height - ((val - paddedMin) * scaleY);
    }
    return { x, y };
  });

  if (!smooth) {
    return points.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(' ');
  }

  // Smooth curve logic
  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    
    // Control points for cubic bezier curve
    const cX = (p1.x + p2.x) / 2;
    path += ` C ${cX},${p1.y} ${cX},${p2.y} ${p2.x},${p2.y}`;
  }

  return path;
}
