import type { TextAlign, TextTransformMode, TextVerticalAlign } from "./elements";

export type TextLayoutOptions = {
  text: string;
  width: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  lineHeight: number;
  letterSpacing: number;
  textTransform: TextTransformMode;
};

export type WrappedTextLine = {
  text: string;
  start: number;
  end: number;
  width: number;
};

export type WrappedTextLayout = {
  lines: WrappedTextLine[];
  lineHeightPx: number;
  width: number;
  height: number;
};

let measureCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function ensureMeasureContext() {
  if (measureCtx) return measureCtx;
  if (typeof OffscreenCanvas !== "undefined") {
    measureCanvas = new OffscreenCanvas(1, 1);
    measureCtx = measureCanvas.getContext("2d");
    return measureCtx;
  }
  if (typeof document !== "undefined") {
    measureCanvas = document.createElement("canvas");
    measureCtx = measureCanvas.getContext("2d");
    return measureCtx;
  }
  return null;
}

export function applyTextTransform(text: string, mode: TextTransformMode) {
  if (mode === "uppercase") return text.toUpperCase();
  if (mode === "capitalize") {
    return text.replace(/\b\p{L}/gu, (char) => char.toUpperCase());
  }
  return text;
}

export function buildTextFont(fontSize: number, fontFamily: string, bold: boolean, italic: boolean) {
  const fontWeight = bold ? 700 : 600;
  const fontStyle = italic ? "italic" : "normal";
  return `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
}

export function measureTextWidth(text: string, font: string, letterSpacing = 0) {
  const ctx = ensureMeasureContext();
  if (!ctx) {
    return text.length * 8 + Math.max(0, text.length - 1) * letterSpacing;
  }
  ctx.font = font;
  const width = ctx.measureText(text).width;
  return width + Math.max(0, text.length - 1) * letterSpacing;
}

export function wrapTextToLines(
  text: string,
  maxWidth: number,
  font: string,
  letterSpacing = 0,
): WrappedTextLine[] {
  const safeText = text ?? "";
  const width = Math.max(8, maxWidth);
  const lines: WrappedTextLine[] = [];
  let offset = 0;

  for (const paragraph of safeText.split("\n")) {
    if (!paragraph) {
      lines.push({ text: "", start: offset, end: offset, width: 0 });
      offset += 1;
      continue;
    }

    const words = paragraph.split(" ");
    let line = "";
    let lineStart = offset;
    let cursor = offset;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (measureTextWidth(testLine, font, letterSpacing) <= width) {
        line = testLine;
        cursor += word.length + (line === word ? 0 : 1);
        continue;
      }

      if (line) {
        lines.push({
          text: line,
          start: lineStart,
          end: lineStart + line.length,
          width: measureTextWidth(line, font, letterSpacing),
        });
        line = "";
        lineStart = cursor;
      }

      if (measureTextWidth(word, font, letterSpacing) <= width) {
        line = word;
        cursor += word.length + 1;
        continue;
      }

      let chunk = "";
      let chunkStart = cursor;
      for (let index = 0; index < word.length; index += 1) {
        const char = word[index] ?? "";
        const testChunk = chunk + char;
        if (measureTextWidth(testChunk, font, letterSpacing) > width && chunk) {
          lines.push({
            text: chunk,
            start: chunkStart,
            end: chunkStart + chunk.length,
            width: measureTextWidth(chunk, font, letterSpacing),
          });
          chunk = char;
          chunkStart += lines[lines.length - 1]?.text.length ?? 0;
        } else {
          chunk = testChunk;
        }
      }
      line = chunk;
      lineStart = chunkStart;
      cursor += word.length + 1;
    }

    lines.push({
      text: line,
      start: lineStart,
      end: lineStart + line.length,
      width: measureTextWidth(line, font, letterSpacing),
    });
    offset += paragraph.length + 1;
  }

  return lines;
}

export function measureWrappedTextLayout(options: TextLayoutOptions): WrappedTextLayout {
  const transformed = applyTextTransform(options.text || "", options.textTransform);
  const font = buildTextFont(options.fontSize, options.fontFamily, options.bold, options.italic);
  const lines = wrapTextToLines(transformed, options.width, font, options.letterSpacing);
  const lineHeightPx = Math.max(1, options.fontSize * options.lineHeight);
  const contentWidth = lines.reduce((max, line) => Math.max(max, line.width), 0);
  return {
    lines,
    lineHeightPx,
    width: Math.max(8, Math.min(options.width, Math.max(contentWidth, 8))),
    height: Math.max(lineHeightPx, lines.length * lineHeightPx),
  };
}

export function getAlignedLineX(line: WrappedTextLine, x: number, maxWidth: number, textAlign: TextAlign) {
  if (textAlign === "center") return x + maxWidth / 2 - line.width / 2;
  if (textAlign === "right") return x + maxWidth - line.width;
  return x;
}

export function getAlignedTextStartY(
  y: number,
  maxHeight: number,
  totalHeight: number,
  textVerticalAlign: TextVerticalAlign,
) {
  if (textVerticalAlign === "middle") return y + Math.max(0, (maxHeight - totalHeight) / 2);
  if (textVerticalAlign === "bottom") return y + Math.max(0, maxHeight - totalHeight);
  return y;
}
