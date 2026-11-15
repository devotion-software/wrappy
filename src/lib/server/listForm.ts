/** Validate the list settings form (title, description, event date, visibility). */
export function parseListForm(fd: FormData):
	| { error: string; values: Record<string, string> }
	| { input: { title: string; description: string | null; eventDate: string | null; visibility: 'public' | 'private' } } {
	const values = {
		title: String(fd.get('title') ?? '').trim(),
		description: String(fd.get('description') ?? '').trim(),
		eventDate: String(fd.get('eventDate') ?? '').trim(),
		visibility: String(fd.get('visibility') ?? 'private')
	};
	if (!values.title) return { error: 'Give your list a name.', values };
	if (values.title.length > 120) return { error: 'Keep the name under 120 characters.', values };
	if (values.description.length > 2000) return { error: 'Keep the description under 2,000 characters.', values };
	if (values.eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.eventDate)) return { error: 'Pick a valid date.', values };
	return {
		input: {
			title: values.title,
			description: values.description || null,
			eventDate: values.eventDate || null,
			visibility: values.visibility === 'public' ? 'public' : 'private'
		}
	};
}
