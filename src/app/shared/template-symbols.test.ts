import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from '@zxing/library';
import { encodeSymbol, type SymbolImage } from './template-symbols.ts';

/** Rasterize the returned SVG rect commands and feed an independent reader.
 * A decorative collection of bars or a QR-looking placeholder cannot pass.
 */
function decode(symbol: SymbolImage, format: BarcodeFormat): string {
  const scaleX=4,scaleY=symbol.height===1?64:4,quiet=40;
  const width=symbol.width*scaleX+quiet*2,height=symbol.height*scaleY+quiet*2;
  const pixels=new Uint8ClampedArray(width*height).fill(255);
  const matches=[...symbol.path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)];
  assert.equal(matches.map(match=>match[0]).join(''),symbol.path);
  for (const match of matches) {
    const x=Number(match[1])*scaleX+quiet,y=Number(match[2])*scaleY+quiet,w=Number(match[3])*scaleX;
    for(let row=y;row<y+scaleY;row++) pixels.fill(0,row*width+x,row*width+x+w);
  }
  const image=new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,width,height)));
  const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[format]]]);
  return new MultiFormatReader().decode(image,hints).getText();
}
test('Code 128 SVG decodes to the exact mixed and numeric values',()=>{
  for(const value of ['DM-0001','123456789012','LOT-26/104']) assert.equal(decode(encodeSymbol('barcode',value),BarcodeFormat.CODE_128),value);
});
test('QR SVG decodes Greek text and URLs exactly',()=>{
  for(const value of ['Label Ninja · Παρτίδα 123','https://label.ninja/test?id=42']) assert.equal(decode(encodeSymbol('qrcode',value),BarcodeFormat.QR_CODE),value);
});
test('invalid or excessively large symbol values fail explicitly',()=>{
  assert.throws(()=>encodeSymbol('barcode','Καφές'));
  assert.throws(()=>encodeSymbol('qrcode',''));
  assert.throws(()=>encodeSymbol('qrcode','a'.repeat(513)));
});
