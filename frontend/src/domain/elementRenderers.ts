import type {
  CanvasElement,
  ImageElement,
  LineElement,
  NoteElement,
  RectangleElement,
  ShadowType,
  StrokeStyle,
  TextTransformMode,
  TextAlign,
  TextVerticalAlign,
  TextElement,
} from "./elements";
import { getLineDirectionsFromPoints, type Point } from "./lineGeometry";

type DrawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => void;

type DrawWrappedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  lineHeight: number,
  textAlign: TextAlign,
  textVerticalAlign: TextVerticalAlign,
  underline: boolean,
  letterSpacing: number,
  textTransform: TextTransformMode,
) => void;

type RenderHelpers = {
  getNoteFontSize: (side: number) => number;
  drawRoundedRect: DrawRoundedRect;
  drawWrappedText: DrawWrappedText;
  drawImageElement: (ctx: CanvasRenderingContext2D, element: ImageElement) => void;
  getLinePathPoints: (element: LineElement) => Point[];
};

type ElementRenderer<T extends CanvasElement> = (
  ctx: CanvasRenderingContext2D,
  element: T,
  helpers: RenderHelpers,
) => void;

function applyShadowPreset(ctx: CanvasRenderingContext2D, shadowType: ShadowType | undefined) {
  if (!shadowType || shadowType === "none") return;

  if (shadowType === "soft") {
    ctx.shadowColor = "rgba(15, 23, 42, 0.22)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    return;
  }

  if (shadowType === "offset") {
    ctx.shadowColor = "rgba(15, 23, 42, 0.28)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 8;
    ctx.shadowOffsetY = 8;
    return;
  }

  ctx.shadowColor = "rgba(59, 130, 246, 0.65)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function applyStrokeDash(ctx: CanvasRenderingContext2D, strokeStyle: StrokeStyle | undefined) {
  if (strokeStyle === "dashed") {
    ctx.setLineDash([10, 6]);
    return;
  }
  if (strokeStyle === "dotted") {
    ctx.setLineDash([2, 5]);
    return;
  }
  ctx.setLineDash([]);
}

const renderRectangle: ElementRenderer<RectangleElement> = (ctx, element) => {
  // Fill with shadow, then stroke without shadow to avoid shadow bleeding inside.
  ctx.save();
  applyShadowPreset(ctx, element.shadowType);
  ctx.fillStyle = element.fill;
  ctx.beginPath();
  ctx.rect(element.x, element.y, element.width, element.height);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = element.stroke;
  ctx.lineWidth = 2;
  applyStrokeDash(ctx, element.strokeStyle);
  ctx.beginPath();
  ctx.rect(element.x, element.y, element.width, element.height);
  ctx.stroke();
  ctx.restore();
};

const renderNote: ElementRenderer<NoteElement> = (ctx, element, helpers) => {
  // Fill with shadow, then stroke without shadow to avoid shadow bleeding inside.
  ctx.save();
  applyShadowPreset(ctx, element.shadowType);
  ctx.fillStyle = element.fill;
  helpers.drawRoundedRect(ctx, element.x, element.y, element.width, element.height, 14);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = element.stroke;
  ctx.lineWidth = 2;
  applyStrokeDash(ctx, element.strokeStyle);
  helpers.drawRoundedRect(ctx, element.x, element.y, element.width, element.height, 14);
  ctx.stroke();
  ctx.restore();

  const padding = 12;
  const fontWeight = element.bold ? 700 : 500;
  const fontStyle = element.italic ? "italic" : "normal";
  const fontFamily = element.fontFamily ?? "system-ui";
  const fontSize = element.fontSize ?? helpers.getNoteFontSize(element.width);
  ctx.fillStyle = element.textColor ?? "#1f2937";
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";
  helpers.drawWrappedText(
    ctx,
    element.text ?? "",
    element.x + padding,
    element.y + padding,
    Math.max(10, element.width - padding * 2),
    Math.max(10, element.height - padding * 2),
    fontSize * (element.lineHeight ?? 1.3),
    element.textAlign ?? "left",
    element.textVerticalAlign ?? "top",
    element.underline ?? false,
    element.letterSpacing ?? 0,
    element.textTransform ?? "none",
  );
};

function applyTextTransform(text: string, mode: TextTransformMode) {
  if (mode === "uppercase") return text.toUpperCase();
  if (mode === "capitalize") {
    return text.replace(/\b\p{L}/gu, (char) => char.toUpperCase());
  }
  return text;
}

function drawTextWithLetterSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
) {
  if (!text || letterSpacing <= 0) {
    ctx.fillText(text, x, y);
    return;
  }
  let cursorX = x;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
    ctx.fillText(char, cursorX, y);
    cursorX += ctx.measureText(char).width + letterSpacing;
  }
}

const renderText: ElementRenderer<TextElement> = (ctx, element) => {
  ctx.save();
  applyShadowPreset(ctx, element.shadowType);
  const fontWeight = element.bold ? 700 : 600;
  const fontStyle = element.italic ? "italic" : "normal";
  const fontFamily = element.fontFamily ?? "system-ui";
  const textAlign = element.textAlign ?? "left";
  const letterSpacing = element.letterSpacing ?? 0;
  const transformed = applyTextTransform(element.text ?? "Note", element.textTransform ?? "none");
  const lines = transformed.split("\n");
  const lineHeight = (element.fontSize ?? 20) * (element.lineHeight ?? 1.2);
  const totalHeight = lines.length * lineHeight;
  const verticalAlign = element.textVerticalAlign ?? "top";
  const startY =
    verticalAlign === "middle"
      ? element.y + Math.max(0, (element.height - totalHeight) / 2)
      : verticalAlign === "bottom"
        ? element.y + Math.max(0, element.height - totalHeight)
        : element.y;
  ctx.fillStyle = element.fill;
  ctx.font = `${fontStyle} ${fontWeight} ${element.fontSize ?? 20}px ${fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const y = startY + index * lineHeight;
    const rawWidth = ctx.measureText(line).width;
    const lineWidth = rawWidth + Math.max(0, line.length - 1) * letterSpacing;
    const startX =
      textAlign === "left"
        ? element.x
        : textAlign === "center"
          ? element.x + element.width / 2 - lineWidth / 2
          : element.x + element.width - lineWidth;
    drawTextWithLetterSpacing(ctx, line, startX, y, letterSpacing);
    if (!element.underline || !line) continue;
    const underlineY = y + (element.fontSize ?? 20) * 1.05;
    ctx.beginPath();
    ctx.moveTo(startX, underlineY);
    ctx.lineTo(startX + lineWidth, underlineY);
    ctx.lineWidth = Math.max(1, Math.round((element.fontSize ?? 20) * 0.06));
    ctx.strokeStyle = element.fill;
    ctx.stroke();
  }
  ctx.restore();
};

const renderLine: ElementRenderer<LineElement> = (ctx, element, helpers) => {
  const pathPoints = helpers.getLinePathPoints(element);
  const { startDir, endDir } = getLineDirectionsFromPoints(pathPoints);

  const trimPathForArrows = (points: Point[]) => {
    if (points.length < 2) return points;
    const next = points.map((point) => ({ ...point }));
    const arrowLength = Math.max(14, (element.strokeWidth ?? 2) * 5.2);
    const trim = Math.max(6, arrowLength * 0.78);

    if ((element.lineArrow === "start" || element.lineArrow === "both") && next[0]) {
      next[0].x += startDir.x * trim;
      next[0].y += startDir.y * trim;
    }
    if ((element.lineArrow === "end" || element.lineArrow === "both") && next[next.length - 1]) {
      const last = next[next.length - 1]!;
      last.x -= endDir.x * trim;
      last.y -= endDir.y * trim;
    }
    return next;
  };

  const drawArrow = (x: number, y: number, directionX: number, directionY: number) => {
    const arrowLength = Math.max(14, (element.strokeWidth ?? 2) * 5.2);
    const arrowWidth = Math.max(9, (element.strokeWidth ?? 2) * 3.4);
    const ux = directionX;
    const uy = directionY;
    const px = -uy;
    const py = ux;

    const tipX = x;
    const tipY = y;
    const baseX = tipX - ux * arrowLength;
    const baseY = tipY - uy * arrowLength;

    if (element.lineArrowStyle === "open") {
      ctx.beginPath();
      ctx.moveTo(baseX + px * arrowWidth * 0.55, baseY + py * arrowWidth * 0.55);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(baseX - px * arrowWidth * 0.55, baseY - py * arrowWidth * 0.55);
      ctx.lineWidth = Math.max(2, (element.strokeWidth ?? 2) * 0.95);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + px * arrowWidth * 0.5, baseY + py * arrowWidth * 0.5);
    ctx.lineTo(baseX - px * arrowWidth * 0.5, baseY - py * arrowWidth * 0.5);
    ctx.closePath();
    ctx.fill();
  };

  ctx.save();
  ctx.strokeStyle = element.stroke;
  ctx.fillStyle = element.stroke;
  ctx.lineWidth = element.strokeWidth ?? 2;
  if (element.lineStyle === "dashed") {
    ctx.setLineDash([12, 8]);
  } else if (element.lineStyle === "dotted") {
    ctx.setLineDash([2, 6]);
  } else {
    ctx.setLineDash([]);
  }
  const drawPath = trimPathForArrows(pathPoints);
  ctx.beginPath();
  const firstPoint = drawPath[0] ?? { x: element.x, y: element.y };
  ctx.moveTo(firstPoint.x, firstPoint.y);
  for (let i = 1; i < drawPath.length; i += 1) {
    const point = drawPath[i];
    if (!point) continue;
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();

  ctx.setLineDash([]);
  if (element.lineArrow === "start" || element.lineArrow === "both") {
    drawArrow(element.x, element.y, -startDir.x, -startDir.y);
  }
  if (element.lineArrow === "end" || element.lineArrow === "both") {
    drawArrow(element.x2, element.y2, endDir.x, endDir.y);
  }

  if (element.label.trim()) {
    let totalLength = 0;
    for (let i = 0; i < pathPoints.length - 1; i += 1) {
      const a = pathPoints[i];
      const b = pathPoints[i + 1];
      if (!a || !b) continue;
      totalLength += Math.hypot(b.x - a.x, b.y - a.y);
    }
    let cursor = totalLength / 2;
    let labelX = element.x;
    let labelY = element.y;
    for (let i = 0; i < pathPoints.length - 1; i += 1) {
      const a = pathPoints[i];
      const b = pathPoints[i + 1];
      if (!a || !b) continue;
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (cursor <= seg) {
        const t = seg <= 1e-7 ? 0 : cursor / seg;
        labelX = a.x + (b.x - a.x) * t;
        labelY = a.y + (b.y - a.y) * t;
        break;
      }
      cursor -= seg;
    }

    const labelSize = element.labelSize ?? 12;
    ctx.font = `600 ${labelSize}px system-ui`;
    const textWidth = ctx.measureText(element.label).width;
    const padX = 8;
    const padY = 4;
    const boxW = textWidth + padX * 2;
    const boxH = labelSize + padY * 2;
    helpers.drawRoundedRect(
      ctx,
      labelX - boxW / 2,
      labelY - boxH / 2,
      boxW,
      boxH,
      6,
    );
    ctx.fillStyle = element.labelBg;
    ctx.fill();
    ctx.strokeStyle = element.stroke;
    ctx.lineWidth = 1;
    helpers.drawRoundedRect(
      ctx,
      labelX - boxW / 2,
      labelY - boxH / 2,
      boxW,
      boxH,
      6,
    );
    ctx.stroke();

    ctx.fillStyle = element.labelColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(element.label, labelX, labelY + 0.5);
  }
  ctx.restore();
};

const renderImage: ElementRenderer<ImageElement> = (ctx, element, helpers) => {
  helpers.drawImageElement(ctx, element);
  if (element.stroke === "transparent") return;
  ctx.save();
  ctx.strokeStyle = element.stroke;
  ctx.lineWidth = 2;
  applyStrokeDash(ctx, element.strokeStyle);
  ctx.strokeRect(element.x, element.y, element.width, element.height);
  ctx.restore();
};

export function renderCanvasElement(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
  helpers: RenderHelpers,
) {
  if (element.type === "rectangle") {
    renderRectangle(ctx, element, helpers);
    return;
  }

  if (element.type === "note") {
    renderNote(ctx, element, helpers);
    return;
  }

  if (element.type === "text") {
    renderText(ctx, element, helpers);
    return;
  }

  if (element.type === "line") {
    renderLine(ctx, element, helpers);
    return;
  }

  if (element.type === "image") {
    renderImage(ctx, element, helpers);
  }
}
