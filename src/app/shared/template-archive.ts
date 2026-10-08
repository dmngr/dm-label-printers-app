import type {AssignmentEntry, TemplateAssignment, TemplateHead} from '../services/customer-api.service';

/** Archived references already saved on this target remain visible/removable.
 * Re-checking an unsaved removal restores its pinned version, never the newest.
 * The backend makes the final atomic authorization/revision decision.
 */
export function archiveChoices(heads: TemplateHead[], draft: TemplateAssignment | null, saved: TemplateAssignment | null): TemplateHead[] {
  return heads.filter(head => !head.archived || draft?.entries.some(entry => entry.templateId === head.id) || saved?.entries.some(entry => entry.templateId === head.id));
}
export function choiceEntry(head: TemplateHead, saved: TemplateAssignment | null): AssignmentEntry | undefined {
  return head.archived ? saved?.entries.find(entry => entry.templateId === head.id) : {templateId: head.id, version: head.version};
}
