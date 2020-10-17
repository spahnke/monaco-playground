export const noop: monaco.IDisposable = { dispose() { } };

export class Disposable implements monaco.IDisposable {
	private disposables: monaco.IDisposable[] = [];

	/**
	 * Registers one ore more disposable objects that will be disposed when this instance is disposed
	 * and returns the objects again.
	 */
	register(...disposables: monaco.IDisposable[]): monaco.IDisposable[] {
		this.disposables.push(...disposables);
		return disposables;
	}

	dispose() {
		for (const disposable of this.disposables)
			disposable?.dispose(); // be defensive here and use ?.
	}
}