/** Real Code 128/QR encoders; return numeric SVG paths, never injected markup. */
import JsBarcode from 'jsbarcode';
import { BarcodeFormat, EncodeHintType, QRCodeWriter } from '@zxing/library';
import { designerCopy as copy } from './template-designer.copy.ts';

export interface SymbolImage { path: string; width: number; height: number; }
export function encodeSymbol(type: 'barcode' | 'qrcode', value: string): SymbolImage {
  if (!value || value.length > 512) throw new Error(value ? copy.symbolTooLong : copy.symbolError);
  let rows: boolean[][];
  if (type === 'barcode') {
    const target: {encodings?: {data: string}[]} = {};
    JsBarcode(target, value, {format: 'CODE128', margin: 0, displayValue: false});
    const bits = target.encodings?.map(encoding => encoding.data).join('');
    if (!bits || !/^[01]+$/.test(bits)) throw new Error(copy.symbolError);
    rows = [[...bits].map(bit => bit === '1')];
  } else {
    const hints = new Map<EncodeHintType, unknown>([[EncodeHintType.MARGIN, 0], [EncodeHintType.CHARACTER_SET, 'UTF-8']]);
    const matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 0, 0, hints);
    rows = Array.from({length: matrix.getHeight()}, (_, y) => Array.from({length: matrix.getWidth()}, (_, x) => matrix.get(x, y)));
  }
  const commands: string[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      if (!row[x]) { x++; continue; }
      const start = x;
      while (x < row.length && row[x]) x++;
      commands.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return {path: commands.join(''), width: rows[0].length, height: rows.length};
}
