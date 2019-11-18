/*---------------------------------------------------------------------------------------------
 *  Adopted partly from https://github.com/microsoft/monaco-typescript/blob/master/src/languageFeatures.ts
 *--------------------------------------------------------------------------------------------*/

export abstract class DiagnosticsAdapter {
	protected disposables: monaco.IDisposable[] = [];
	private listeners = new Map<string, monaco.IDisposable>();

	constructor(protected languageId: string, protected owner: string = languageId) {
		const onModelAdd = (model: monaco.editor.IModel): void => {
			if (model.getModeId() !== languageId)
				return;

			let handle: number;
			const changeSubscription = model.onDidChangeContent(() => {
				clearTimeout(handle);
				handle = setTimeout(() => this.doValidate(model.uri), 500);
			});

			this.listeners.set(model.uri.toString(), {
				dispose() {
					changeSubscription.dispose();
					clearTimeout(handle);
				}
			});

			this.doValidate(model.uri);
		};

		const onModelRemoved = (model: monaco.editor.IModel): void => {
			monaco.editor.setModelMarkers(model, this.owner, []);
			const key = model.uri.toString();
			if (this.listeners.has(key)) {
				this.listeners.get(key)?.dispose();
				this.listeners.delete(key);
			}
		};

		this.disposables.push(monaco.editor.onDidCreateModel(onModelAdd));
		this.disposables.push(monaco.editor.onWillDisposeModel(onModelRemoved));
		this.disposables.push(monaco.editor.onDidChangeModelLanguage(event => {
			onModelRemoved(event.model);
			onModelAdd(event.model);
		}));

		this.disposables.push({
			dispose() {
				monaco.editor.getModels().forEach(onModelRemoved);
			}
		});

		monaco.editor.getModels().forEach(onModelAdd);
	}

	public dispose(): void {
		this.disposables.forEach(d => d?.dispose());
		this.disposables = [];
	}

	protected abstract doValidate(resource: monaco.Uri): Promise<void>;
}