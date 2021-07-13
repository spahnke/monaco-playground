export class Disposable implements monaco.IDisposable {
	private disposables = new Set<monaco.IDisposable>();

	/**
	 * Registers a disposable object that will be disposed when this instance is disposed
	 * and returns the object again.
	 */
	register<T extends monaco.IDisposable>(disposable: T): T {
		this.disposables.add(disposable);
		return disposable;
	}

	registerAll(...disposables: monaco.IDisposable[]): void {
		for (const disposable of disposables)
			this.disposables.add(disposable);
	}

	dispose(): void {
		for (const disposable of this.disposables)
			disposable.dispose();
		this.disposables.clear();
	}
}