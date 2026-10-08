/** Preserve compatible draft values across catalog refreshes. Template identity
 * alone is not enough: layout, size or printer changes require another review
 * before sending. A removed selection stays visible as a draft, never printable.
 */
import type { TemplateInput } from './template-inputs';

interface PrintableTemplate {
  id: number;
  code: string;
  layoutJson: string;
  width: number;
  height: number;
  printerName: string;
  isActive: boolean;
}

export function findActiveSelection<T extends PrintableTemplate>(selected: T, templates: T[]): T | undefined {
  return templates.find(t => t.id === selected.id && t.code === selected.code && t.isActive !== false);
}

export function templatePrintChanged(before: PrintableTemplate, after: PrintableTemplate): boolean {
  return before.layoutJson !== after.layoutJson || before.width !== after.width ||
    before.height !== after.height || before.printerName !== after.printerName;
}

export function preserveTemplateValues(
  before: TemplateInput[], after: TemplateInput[], values: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(after.map(field => {
    const previous = before.find(f => f.key.toLowerCase() === field.key.toLowerCase() && f.type === field.type);
    return [field.key, previous && Object.hasOwn(values, previous.key) ? values[previous.key] : field.defaultValue ?? ''];
  }));
}
