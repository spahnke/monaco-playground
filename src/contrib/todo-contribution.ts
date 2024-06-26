import { allLanguages, DiagnosticsAdapter } from "../common/diagnostics-adapter.js";
import { isInComment, waitForTokenization } from "../common/monaco-utils.js";

export class TodoContribution extends DiagnosticsAdapter {
	private readonly currentDecorations: Map<string, string[]>;

	constructor() {
		super(allLanguages, "todo");
		this.currentDecorations = new Map();
		this.startValidation();
	}

	protected async doValidate(resource: monaco.Uri): Promise<void> {
		const model = monaco.editor.getModel(resource);
		if (!model)
			return;

		const decorations: monaco.editor.IModelDeltaDecoration[] = [];
		const todos = model.findMatches("\\bTODO\\b", false, true, true, null, true);
		if (todos.length > 0)
			await waitForTokenization(model);

		for (const todo of todos) {
			if (!isInComment(model, todo.range))
				continue;

			const range = todo.range.setStartPosition(todo.range.startLineNumber, todo.range.startColumn);
			decorations.push({
				range,
				options: {
					className: "monaco-todo-line",
					inlineClassName: "monaco-todo-line",
					overviewRuler: {
						color: "hsl(100, 75%, 30%)",
						position: monaco.editor.OverviewRulerLane.Center
					},
					stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
				}
			});
		}

		if (decorations.length === 0 && !this.currentDecorations.has(resource.toString()))
			return;
		this.currentDecorations.set(resource.toString(), model.deltaDecorations(this.currentDecorations.get(resource.toString()) ?? [], decorations));
	}
}