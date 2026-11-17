/** Character-level provenance survives recursive template/fragment expansion. */
export interface Origin {
  file: string;
  source: string;
  offset: number;
}
export interface MappedText {
  text: string;
  origins: (Origin | null)[];
}
export function originalText(text: string, file: string): MappedText {
  return {
    text,
    origins: Array.from({ length: text.length }, (_, offset) => ({ file, source: text, offset })),
  };
}
export function generatedText(text: string): MappedText {
  return { text, origins: Array(text.length).fill(null) };
}
export function sliceText(text: MappedText, start: number, end = text.text.length): MappedText {
  return { text: text.text.slice(start, end), origins: text.origins.slice(start, end) };
}
export function joinText(...parts: MappedText[]): MappedText {
  return {
    text: parts.map((part) => part.text).join(''),
    origins: parts.flatMap((part) => part.origins),
  };
}
export function replaceText(
  text: MappedText,
  start: number,
  end: number,
  replacement: MappedText
): MappedText {
  return joinText(sliceText(text, 0, start), replacement, sliceText(text, end));
}
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vlq(value: number): string {
  let n = value < 0 ? -value * 2 + 1 : value * 2;
  let out = '';
  do {
    const digit = n % 32;
    n = Math.floor(n / 32);
    out += BASE64[digit + (n ? 32 : 0)];
  } while (n);
  return out;
}
export function sourceMap(mapped: MappedText): object {
  const sources: string[] = [];
  const sourcesContent: string[] = [];
  const positions = new Map<string, { lines: number[]; columns: number[] }>();
  for (const origin of mapped.origins)
    if (origin && !positions.has(origin.file)) {
      sources.push(origin.file);
      sourcesContent.push(origin.source);
      const lines: number[] = [],
        columns: number[] = [];
      let line = 0,
        column = 0;
      for (let i = 0; i < origin.source.length; i++) {
        lines.push(line);
        columns.push(column);
        if (origin.source[i] === '\n') {
          line++;
          column = 0;
        } else column++;
      }
      positions.set(origin.file, { lines, columns });
    }
  let prevSource = 0,
    prevLine = 0,
    prevColumn = 0,
    column = 0,
    prevGenerated = 0;
  const lines: string[] = [];
  let segments: string[] = [];
  let wasMapped = false;
  for (let i = 0; i < mapped.text.length; i++) {
    const origin = mapped.origins[i];
    if (origin) {
      const index = sources.indexOf(origin.file);
      const position = positions.get(origin.file)!;
      const line = position.lines[origin.offset]!,
        originalColumn = position.columns[origin.offset]!;
      segments.push(
        vlq(column - prevGenerated) +
          vlq(index - prevSource) +
          vlq(line - prevLine) +
          vlq(originalColumn - prevColumn)
      );
      prevGenerated = column;
      prevSource = index;
      prevLine = line;
      prevColumn = originalColumn;
      wasMapped = true;
    } else if (wasMapped) {
      segments.push(vlq(column - prevGenerated));
      prevGenerated = column;
      wasMapped = false;
    }
    if (mapped.text[i] === '\n') {
      lines.push(segments.join(','));
      segments = [];
      column = 0;
      prevGenerated = 0;
      wasMapped = false;
    } else column++;
  }
  lines.push(segments.join(','));
  return { version: 3, sources, sourcesContent, names: [], mappings: lines.join(';') };
}
