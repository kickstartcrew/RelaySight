import { measureTextWrap } from '@evenrealities/pretext';
import {
  G2_TEXT_LINE_HEIGHT,
  GLASSES_BODY_INNER_HEIGHT,
  GLASSES_BODY_INNER_WIDTH,
} from './glasses-layout';

export interface GlassPage {
  index: number;
  total: number;
  lines: string[];
}

export interface PaginationOptions {
  width?: number;
  height?: number;
  maxPages?: number;
  overflowDirection?: 'start' | 'end';
}

export function plainTextForGlasses(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/```[^\n]*\n?/g, '')
    .replace(/\[([^\]]+)]\((?:https?:\/\/)?[^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function measuredLines(text: string, width: number): number {
  return measureTextWrap(text, width).lineCount;
}

function splitOversizedText(text: string, width: number, maxLines: number): string[] {
  const chunks: string[] = [];
  let remaining = Array.from(text.trim());

  while (remaining.length > 0) {
    let low = 1;
    let high = remaining.length;
    let fitted = 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (measuredLines(remaining.slice(0, middle).join(''), width) <= maxLines) {
        fitted = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    chunks.push(remaining.slice(0, fitted).join('').trim());
    remaining = remaining.slice(fitted);
  }

  return chunks.filter(Boolean);
}

function splitParagraph(text: string, width: number, maxLines: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const token of text.split(/(\s+)/)) {
    const candidate = current + token;
    if (measuredLines(candidate, width) <= maxLines) {
      current = candidate;
      continue;
    }
    if (current.trim()) chunks.push(current.trim());
    const oversized = splitOversizedText(token, width, maxLines);
    chunks.push(...oversized.slice(0, -1));
    current = oversized.at(-1) ?? '';
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function pageSizedChunks(text: string, width: number, maxLines: number): string[] {
  const pages: string[] = [];
  let paragraphs: string[] = [];
  let occupiedLines = 0;

  const flush = () => {
    if (paragraphs.length === 0) return;
    pages.push(paragraphs.join('\n\n'));
    paragraphs = [];
    occupiedLines = 0;
  };

  for (const paragraph of text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
    const chunks = measuredLines(paragraph, width) > maxLines
      ? splitParagraph(paragraph, width, maxLines)
      : [paragraph];
    for (const chunk of chunks) {
      const lineCount = measuredLines(chunk, width);
      const separatorLines = paragraphs.length > 0 ? 1 : 0;
      if (occupiedLines + separatorLines + lineCount > maxLines) flush();
      const nextSeparatorLines = paragraphs.length > 0 ? 1 : 0;
      paragraphs.push(chunk);
      occupiedLines += nextSeparatorLines + lineCount;
    }
  }
  flush();
  return pages;
}

export function paginateForGlasses(text: string, options: PaginationOptions = {}): GlassPage[] {
  const width = options.width ?? GLASSES_BODY_INNER_WIDTH;
  const height = options.height ?? GLASSES_BODY_INNER_HEIGHT;
  const linesPerPage = Math.floor(height / G2_TEXT_LINE_HEIGHT);
  const maxPages = options.maxPages ?? 100;
  const overflowDirection = options.overflowDirection ?? 'start';
  if (width < 1 || linesPerPage < 1 || maxPages < 1) throw new Error('Invalid pagination limits');

  const cleaned = plainTextForGlasses(text) || '(empty reply)';
  const allPages = pageSizedChunks(cleaned, width, linesPerPage);
  const overflowed = allPages.length > maxPages;
  const pages = overflowDirection === 'end' ? allPages.slice(-maxPages) : allPages.slice(0, maxPages);
  if (overflowed && pages.length > 0) {
    const notice = overflowDirection === 'end'
      ? 'Earlier history is available on phone'
      : 'More history is available on phone';
    if (overflowDirection === 'end') pages[0] = notice;
    else pages[pages.length - 1] = notice;
  }
  const total = Math.max(1, pages.length);
  return Array.from({ length: total }, (_, index) => ({
    index,
    total,
    lines: (pages[index] ?? '(empty reply)').split('\n'),
  }));
}
