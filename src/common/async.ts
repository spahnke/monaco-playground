// NOTE(seb) This mimics how monaco handles promise cancellations internally (we do not want to depend on that).

const canceledName = "Canceled";

function isPromiseCanceledError(error: unknown): boolean {
	if (error instanceof CancellationError) {
		return true;
	}
	return error instanceof Error && error.name === canceledName && error.message === canceledName;
}

class CancellationError extends Error {
	constructor() {
		super(canceledName);
		this.name = this.message;
	}
}

export interface CancellablePromise<T> extends PromiseWithResolvers<T> {
	cancel(): void;
}

export function createCancellablePromise<T>(): CancellablePromise<T> {
	const result: CancellablePromise<T> = {
		...Promise.withResolvers<T>(),
		cancel() {
			result.reject(new CancellationError());
		},
	};
	return result;
}

export function registerPromiseCanceledErrorHandler(): void {
	window.addEventListener("unhandledrejection", event => {
		if (isPromiseCanceledError(event.reason)) {
			event.preventDefault();
		}
	});
}