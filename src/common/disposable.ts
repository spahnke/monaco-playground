export class Disposable implements monaco.IDisposable {
	static readonly None = Object.freeze<monaco.IDisposable>({ dispose() { } });

	private disposables = new Set<monaco.IDisposable>();

	/**
	 * Registers a disposable object that will be disposed when this instance is disposed
	 * and returns the object again.
	 */
	register<T extends monaco.IDisposable>(disposable: T): T {
		this.disposables.add(disposable);
		return disposable;
	}

	dispose(): void {
		for (const disposable of this.disposables)
			disposable.dispose();
		this.disposables.clear();
	}
}

export function toDisposable(f: () => void): monaco.IDisposable {
	let didCall = false;
	return {
		dispose() {
			if (didCall)
				return;
			didCall = true;
			f();
		}
	};
}