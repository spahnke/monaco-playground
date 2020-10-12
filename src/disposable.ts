export class Disposable implements monaco.IDisposable {
	private disposables: monaco.IDisposable[] = [];

	/**
	 * Registers one ore more disposable objects that will be disposed when this instance is disposed.
	 */
	register(...disposables: monaco.IDisposable[]) {
		this.disposables.push(...disposables);
	}

	dispose() {
		for (const disposable of this.disposables)
			disposable.dispose();
	}
}