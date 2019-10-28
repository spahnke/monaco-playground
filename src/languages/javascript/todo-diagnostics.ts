import { DiagnosticsAdapter } from "../diagnostics-adapter.js";

export class TodoDiagnostics extends DiagnosticsAdapter {

	private currentDecorations: string[] = [];

	constructor() {
		super("javascript", "todo");
	}

	protected async doValidate(resource: monaco.Uri): Promise<void> {
		const model = monaco.editor.getModel(resource);
		if (!model)
			return;

		const decorations: monaco.editor.IModelDeltaDecoration[] = [];
		const todos = model.findMatches("(?://|\\*)\\s*TODO\\b", false, true, true, null, true);
		for (const todo of todos) {
			// e.g. todo.matches === ["// TODO"] | ["* TODO"]
			const offset = todo.matches![0].indexOf("TODO");
			const range = todo.range.setStartPosition(todo.range.startLineNumber, todo.range.startColumn + offset);
			decorations.push({
				range,
				options: {
					className: "monacoTodo",
					inlineClassName: "monacoTodo",
					overviewRuler: {
						color: "hsl(100, 75%, 30%)",
						position: monaco.editor.OverviewRulerLane.Center
					},
					stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
				}
			})
		}

		this.currentDecorations = model.deltaDecorations(this.currentDecorations, decorations);
	}
}