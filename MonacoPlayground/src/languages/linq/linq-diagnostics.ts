import { DiagnosticsAdapter } from "../diagnostics-adapter.js";
import { LinqCompletionProvider } from "./linq-completion-provider.js";

export class LinqDiagnostics extends DiagnosticsAdapter {

	private static tableAndViewNames: string[] | null = null;

	protected async doValidate(resource: monaco.Uri): Promise<void> {
		try {
			const tableAndViewNames = await this.getTableAndViewNames();
			const model = monaco.editor.getModel(resource);
			if (!model) {
				return;
			}
			monaco.editor.setModelMarkers(model, this.languageId, this.getDiagnostics(model, tableAndViewNames));
		} catch (e) {
			console.error(e);
		}
	}

	private async getTableAndViewNames(): Promise<string[]> {
		if (LinqDiagnostics.tableAndViewNames === null) {
			const linqInformation = await LinqCompletionProvider.getLinqInformation();
			LinqDiagnostics.tableAndViewNames = linqInformation.map(x => x.tableOrViewName);
		}
		return LinqDiagnostics.tableAndViewNames;
	}

	private getDiagnostics(model: monaco.editor.ITextModel, tableAndViewNames: string[]): monaco.editor.IMarkerData[] {
		const diagnostics: monaco.editor.IMarkerData[] = [];
		const matches = model.findMatches("@(\\w+)", true, true, false, null, true);
		for (const match of matches) {
			const tableOrViewName = match.matches![1]; // first group of regex
			if (!tableAndViewNames.includes(tableOrViewName)) {
				diagnostics.push({
					message: `Unknown table or view name '${tableOrViewName}'`,
					severity: monaco.MarkerSeverity.Error,
					startLineNumber: match.range.startLineNumber,
					startColumn: match.range.startColumn,
					endLineNumber: match.range.endLineNumber,
					endColumn: match.range.endColumn,
				});
			}
		}
		return diagnostics;
	}
}