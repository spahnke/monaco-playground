/*---------------------------------------------------------------------------------------------
 *  Adopted partly from https://github.com/microsoft/monaco-typescript/blob/master/src/languageFeatures.ts
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from "./disposable.js";

export const allLanguages = "all_languages";

export abstract class DiagnosticsAdapter extends Disposable {
	private readonly listeners = new Map<string, monaco.IDisposable>();

	constructor(protected readonly languageId: string, protected readonly owner: string = languageId) {
		super();
	}

	/**
	 * Registers necessary event listeners for created/changed/disposed models and validates all relevant existing models.
	 *
	 * Call this in the constructor of any derived class after its own initialization steps.
	 */
	protected startValidation(): void {
		const onModelAdd = (model: monaco.editor.IModel): void => {
			if (this.languageId !== allLanguages && model.getLanguageId() !== this.languageId)
				return;

			let handle: number;
			const changeSubscription = model.onDidChangeContent(() => {
				clearTimeout(handle);
				handle = setTimeout(() => this.doValidate(model.uri), 500);
			});

			this.listeners.set(model.uri.toString(), toDisposable(() => {
				changeSubscription.dispose();
				clearTimeout(handle);
			}));

			this.doValidate(model.uri);
		};

		const onModelRemoved = (model: monaco.editor.IModel): void => {
			monaco.editor.setModelMarkers(model, this.owner, []);
			const key = model.uri.toString();
			if (this.listeners.has(key)) {
				this.listeners.get(key)!.dispose();
				this.listeners.delete(key);
			}
		};

		this.register(monaco.editor.onDidCreateModel(onModelAdd));
		this.register(monaco.editor.onWillDisposeModel(onModelRemoved));
		this.register(monaco.editor.onDidChangeModelLanguage(event => {
			onModelRemoved(event.model);
			onModelAdd(event.model);
		}));

		this.register(toDisposable(() => monaco.editor.getModels().forEach(onModelRemoved)));

		monaco.editor.getModels().forEach(onModelAdd);
	}

	protected abstract doValidate(resource: monaco.Uri): Promise<void>;
}