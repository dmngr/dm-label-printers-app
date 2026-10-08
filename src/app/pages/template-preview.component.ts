import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { canvasTransform, elementValue, parseLayout, sampleInputs, visualElements } from '../shared/template-layout';
import { encodeSymbol, type SymbolImage } from '../shared/template-symbols';
import { designerCopy } from '../shared/template-designer.copy';

/** Shared visual surface for gallery thumbnails and the designer. Label units
 * stay millimetres inside the SVG; text fonts convert from the Windows pt unit.
 * Synthetic values are local preview data and never enqueue a print job.
 */
@Component({
  selector: 'app-template-preview', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rendered(); as view) {
      @if (view.error) { <span class="unavailable">{{ view.error }}</span> }
      @else if (!view.elements.length) { <span class="unavailable">{{ copy.legacyLayout }}</span> }
      @else {
        <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" role="img" [attr.aria-label]="copy.preview" preserveAspectRatio="xMidYMid meet">
          <rect x="0" y="0" [attr.width]="width()" [attr.height]="height()" fill="white" />
          <g [attr.transform]="view.transform">
            @for (item of view.elements; track item.element.index) {
              @let e = item.element;
              @switch (e.type) {
                @case ('text') {
                  <foreignObject [attr.x]="e.x" [attr.y]="e.y" [attr.width]="e.width" [attr.height]="e.height">
                    <div xmlns="http://www.w3.org/1999/xhtml" class="label-text" [style.font-family]="e.fontFamily" [style.font-size.px]="e.fontSize * 25.4 / 72" [style.font-weight]="e.bold ? 700 : 400" [style.text-align]="e.align" [style.white-space]="e.wrap ? 'pre-wrap' : 'pre'" [style.color]="e.foregroundColor" [style.background]="e.backgroundColor">{{ item.value }}</div>
                  </foreignObject>
                }
                @case ('line') { <line [attr.x1]="e.x" [attr.y1]="e.y" [attr.x2]="e.x + e.width" [attr.y2]="e.y + e.height" [attr.stroke]="e.foregroundColor" [attr.stroke-width]="e.borderWidth > 0 ? e.borderWidth : .3" stroke-linecap="round" /> }
                @case ('box') { <rect [attr.x]="e.x" [attr.y]="e.y" [attr.width]="e.width" [attr.height]="e.height" [attr.rx]="e.cornerRadius" [attr.fill]="e.backgroundColor" [attr.stroke]="e.foregroundColor" [attr.stroke-width]="e.borderWidth" /> }
                @case ('ellipse') { <ellipse [attr.cx]="e.x + e.width / 2" [attr.cy]="e.y + e.height / 2" [attr.rx]="e.width / 2" [attr.ry]="e.height / 2" [attr.fill]="e.backgroundColor" [attr.stroke]="e.foregroundColor" [attr.stroke-width]="e.borderWidth" /> }
                @case ('barcode') {
                  <rect [attr.x]="e.x" [attr.y]="e.y" [attr.width]="e.width" [attr.height]="e.height" [attr.fill]="e.backgroundColor" />
                  @if (item.symbol; as symbol) {
                    <svg [attr.x]="e.x + item.insetX" [attr.y]="e.y + item.insetY" [attr.width]="item.symbolWidth" [attr.height]="item.symbolHeight" [attr.viewBox]="'0 0 ' + symbol.width + ' ' + symbol.height" preserveAspectRatio="none"><rect width="100%" height="100%" fill="white" /><path [attr.d]="symbol.path" [attr.fill]="e.foregroundColor" shape-rendering="crispEdges" /></svg>
                    @if (e.humanReadable) { <text [attr.x]="e.x + e.width / 2" [attr.y]="e.y + e.height - .6" text-anchor="middle" font-family="Arial" [attr.font-size]="7 * 25.4 / 72" [attr.fill]="e.foregroundColor">{{ item.value }}</text> }
                  } @else { <text [attr.x]="e.x" [attr.y]="e.y + 3" font-size="2.5" fill="#b91c1c">{{ copy.symbolError }}</text> }
                }
                @case ('qrcode') {
                  <rect [attr.x]="e.x" [attr.y]="e.y" [attr.width]="e.width" [attr.height]="e.height" [attr.fill]="e.backgroundColor" />
                  @if (item.symbol; as symbol) {
                    <svg [attr.x]="e.x + item.insetX" [attr.y]="e.y + item.insetY" [attr.width]="item.symbolWidth" [attr.height]="item.symbolHeight" [attr.viewBox]="'0 0 ' + symbol.width + ' ' + symbol.height" preserveAspectRatio="xMidYMid meet"><rect width="100%" height="100%" fill="white" /><path [attr.d]="symbol.path" [attr.fill]="e.foregroundColor" shape-rendering="crispEdges" /></svg>
                  } @else { <text [attr.x]="e.x" [attr.y]="e.y + 3" font-size="2.5" fill="#b91c1c">{{ copy.symbolError }}</text> }
                }
              }
            }
          </g>
        </svg>
      }
    }
  `,
  styles: [`:host{display:block;width:100%;height:100%;min-width:0;min-height:0}svg{display:block;width:100%;height:100%;overflow:hidden}.label-text{height:100%;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;line-height:1.15;padding:0 .16em;overflow-wrap:break-word}.unavailable{display:grid;place-items:center;height:100%;font-size:12px;color:#64748b;padding:12px;text-align:center}`]
})
export class TemplatePreviewComponent {
  readonly layoutJson = input.required<string>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  readonly values = input<Record<string, string>>({});
  readonly copy = designerCopy;
  private readonly symbols = new Map<string, SymbolImage | null>();
  readonly rendered = computed(() => {
    try {
      const doc = parseLayout(this.layoutJson());
      const size = {width: this.width(), height: this.height()};
      const values = {...sampleInputs(doc), ...this.values()};
      const elements = visualElements(doc, size).map(element => {
        const value = elementValue(element, values, size);
        let symbol: SymbolImage | null = null;
        if ((element.type === 'barcode' || element.type === 'qrcode') && value) {
          const key = element.type + ':' + value;
          if (!this.symbols.has(key)) {
            try { this.symbols.set(key, encodeSymbol(element.type, value)); } catch { this.symbols.set(key, null); }
            if (this.symbols.size > 64) this.symbols.delete(this.symbols.keys().next().value!);
          }
          symbol = this.symbols.get(key) ?? null;
        }
        const symbolAreaHeight = element.type === 'barcode' && element.humanReadable ? Math.max(1.524, element.height - 7 * 25.4 / 72 * 1.2 - .508) : element.height;
        const insetX = Math.max(1.016, element.width / 40), insetY = Math.max(.508, symbolAreaHeight / 12);
        return {element, value, symbol, insetX, insetY, symbolWidth: Math.max(0, element.width - 2 * insetX), symbolHeight: Math.max(0, symbolAreaHeight - 2 * insetY)};
      });
      return {elements, transform: canvasTransform(doc, size), error: ''};
    } catch { return {elements: [], transform: '', error: this.copy.thumbnailFailed}; }
  });
}
