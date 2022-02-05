import { isTableOrViewIdentifier, LinqCompletionProvider } from "./linq-completion-provider.js";

export class LinqHoverProvider implements monaco.languages.HoverProvider {

	async provideHover(model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken): Promise<monaco.languages.Hover | undefined> {
		if (!isTableOrViewIdentifier(model, position))
			return undefined;

		const tableOrViewName = model.getWordAtPosition(position);
		if (!tableOrViewName)
			return undefined;
		const documentation = await LinqCompletionProvider.getDocumentationByName(tableOrViewName.word);
		if (!documentation)
			return undefined;

		return {
			contents: [documentation]
		};
	}
}