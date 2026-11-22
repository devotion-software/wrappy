/**
 * In-page confirmations, in place of window.confirm(). iOS Safari can skip a page's
 * dialogs and treat them as "Cancel", which made buttons like "Delete this item
 * everywhere" silently do nothing. <ConfirmDialog /> in the root layout shows these.
 */

export type ConfirmOptions = { yes?: string; no?: string };
type Pending = { message: string; yes: string; no: string; answer: (ok: boolean) => void };

class Confirmation {
	// Raw, so `current === pending` compares the object we stored, not a reactive copy.
	current = $state.raw<Pending | null>(null);
}
export const confirmation = new Confirmation();

/** Ask a yes/no question on the page; resolves true only when the yes button is pressed. */
export function ask(message: string, { yes = 'Yes', no = 'Cancel' }: ConfirmOptions = {}): Promise<boolean> {
	confirmation.current?.answer(false);
	return new Promise((resolve) => {
		const pending: Pending = {
			message,
			yes,
			no,
			answer: (ok) => {
				if (confirmation.current === pending) confirmation.current = null;
				resolve(ok);
			}
		};
		confirmation.current = pending;
	});
}

/**
 * `onsubmit` handler for a plain (not enhanced) form: holds the submit, asks, and
 * resubmits the form if the answer is yes. Without JavaScript the form just submits.
 */
export function confirmSubmit(message: string | (() => string), opts?: ConfirmOptions) {
	return (e: SubmitEvent) => {
		const form = e.currentTarget as HTMLFormElement;
		if (form.dataset.confirmed) {
			delete form.dataset.confirmed;
			return;
		}
		e.preventDefault();
		const submitter = e.submitter as HTMLButtonElement | null;
		ask(typeof message === 'function' ? message() : message, opts).then((ok) => {
			if (!ok) return;
			form.dataset.confirmed = '1';
			form.requestSubmit(submitter ?? undefined);
		});
	};
}
