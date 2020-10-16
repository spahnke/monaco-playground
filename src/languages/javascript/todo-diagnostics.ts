import { isInComment } from "../../monaco-utils.js";
import { DiagnosticsAdapter } from "../diagnostics-adapter.js";

export class TodoDiagnostics extends DiagnosticsAdapter {

	private currentDecorations: Map<monaco.Uri, string[]> = new Map();

	constructor() {
		super("javascript", "todo");
	}

	protected async doValidate(resource: monaco.Uri): Promise<void> {
		const model = monaco.editor.getModel(resource);
		if (!model)
			return;

		const decorations: monaco.editor.IModelDeltaDecoration[] = [];
		const todos = model.findMatches("\\bTODO\\b", false, true, true, null, true);
		for (const todo of todos) {
			if (!(await isInComment(model, todo.range)))
				continue;

			const range = todo.range.setStartPosition(todo.range.startLineNumber, todo.range.startColumn);
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

		this.currentDecorations.set(resource, model.deltaDecorations(this.currentDecorations.get(resource) ?? [], decorations));
	}
}