import { describe, expect, it } from 'vitest';
import { parseListForm } from './listForm';

const fd = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('parseListForm', () => {
	it('returns trimmed input with nulls for empty optional fields', () => {
		expect(parseListForm(fd({ title: '  Birthday  ', description: '  ', eventDate: '' }))).toEqual({
			input: { title: 'Birthday', description: null, eventDate: null, visibility: 'private' }
		});
	});

	it('keeps description, date and public visibility', () => {
		expect(parseListForm(fd({ title: 'Xmas', description: 'Things', eventDate: '2026-12-25', visibility: 'public' }))).toEqual({
			input: { title: 'Xmas', description: 'Things', eventDate: '2026-12-25', visibility: 'public' }
		});
	});

	it('treats any visibility other than "public" as private', () => {
		const r = parseListForm(fd({ title: 'X', visibility: 'everyone' }));
		expect('input' in r && r.input.visibility).toBe('private');
	});

	it('requires a title', () => {
		expect(parseListForm(fd({ title: '   ' }))).toMatchObject({ error: 'Give your list a name.' });
		expect(parseListForm(new FormData())).toMatchObject({ error: 'Give your list a name.' });
	});

	it('limits title to 120 characters', () => {
		expect('input' in parseListForm(fd({ title: 'x'.repeat(120) }))).toBe(true);
		expect(parseListForm(fd({ title: 'x'.repeat(121) }))).toMatchObject({ error: 'Keep the name under 120 characters.' });
	});

	it('limits description to 2000 characters', () => {
		expect('input' in parseListForm(fd({ title: 'X', description: 'd'.repeat(2000) }))).toBe(true);
		expect(parseListForm(fd({ title: 'X', description: 'd'.repeat(2001) }))).toMatchObject({
			error: 'Keep the description under 2,000 characters.'
		});
	});

	it.each(['25/12/2026', '2026-1-1', 'tomorrow', '2026-12-25T00:00'])('rejects date %j', (eventDate) => {
		expect(parseListForm(fd({ title: 'X', eventDate }))).toMatchObject({ error: 'Pick a valid date.' });
	});

	it('echoes the submitted values back on error so the form can be refilled', () => {
		expect(parseListForm(fd({ title: '', description: ' hi ', eventDate: 'bad', visibility: 'public' }))).toEqual({
			error: 'Give your list a name.',
			values: { title: '', description: 'hi', eventDate: 'bad', visibility: 'public' }
		});
	});
});
