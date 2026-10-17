import type { PageLayout } from './layout'

export type Template = { id: string; name: string; layout: PageLayout }

// Task 12 adds the real set.
export const templates: Template[] = [
  { id: 'blank', name: 'Blank', layout: { background: 'paper-cream', elements: [] } },
]

export function instantiateTemplate(id: string, newId: () => string): PageLayout {
  const t = templates.find((x) => x.id === id)
  if (!t) throw new Error(`unknown template: ${id}`)
  return { ...t.layout, elements: t.layout.elements.map((e) => ({ ...e, id: newId() })) }
}
