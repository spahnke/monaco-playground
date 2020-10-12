import { Disposable } from "./disposable.js";
import { isComment } from "./monaco-helper.js";

const breakPointMarginClassName = "codicon-debug-breakpoint monacoBreakpointMargin";
const debugLineMarginClassName = "codicon-debug-stackframe monacoDebugLineMargin";
const debugLineAndBreakpointMarginClassName = "codicon-debug-stackframe monacoDebugLineAndBreakpointMargin";
const debugLineClassName = "monacoDebugLine";
const contextMenuGroupId = "8_debug";

/**
 * Adds debug UI capabilities to the editor.
 */
export class DebugContribution extends Disposable {
	private breakpointPreviewDecorations: string[] = [];
	private breakpointDecorations: Map<string, monaco.editor.IModelDecoration> = new Map();
	private currentDebugLineDecorations: string[] = [];

	constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
		super();
		this.enableGlyphMargin();
		this.register(this.editor.onMouseMove(this.onMouseMove));
		this.register(this.editor.onMouseDown(this.onMouseDown));
		this.register(editor.addAction({
			id: "toggle_breakpoint",
			label: "Toggle Breakpoint",
			keybindings: [monaco.KeyCode.F9],
			contextMenuGroupId,
			contextMenuOrder: 0,
			run: () => this.toggleBreakpoint(),
		}));
	}

	simulateDebugging() {
		let currentLine = 1;
		this.register(this.editor.addAction({
			id: "debug_step",
			label: "Step",
			keybindings: [monaco.KeyCode.F10],
			contextMenuGroupId,
			contextMenuOrder: 1,
			run: (editor) => {
				const model = editor.getModel();
				if (!model)
					return;

				this.displayCurrentlyDebuggedLine({
					startLineNumber: currentLine,
					endLineNumber: currentLine,
					startColumn: model.getLineFirstNonWhitespaceColumn(currentLine),
					endColumn: model.getLineLastNonWhitespaceColumn(currentLine)
				});

				currentLine++;
				if (currentLine > model.getLineCount())
					currentLine = 1;
			},
		}));
		this.register(this.editor.addAction({
			id: "debug_stop",
			label: "Reset Debugger",
			keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F10],
			contextMenuGroupId,
			contextMenuOrder: 2,
			run: () => {
				this.removeDebugLine();
				currentLine = 1;
			},
		}));
	}

	displayCurrentlyDebuggedLine(debugPosition: monaco.IRange) {
		if (debugPosition.startLineNumber < 1) {
			this.removeDebugLine();
			return;
		}

		const hasBreakpointOnCurrentLine = this.getBreakpointDecoration(debugPosition.startLineNumber) !== undefined;
		this.currentDebugLineDecorations = this.editor.deltaDecorations(this.currentDebugLineDecorations, [
			{
				range: new monaco.Range(debugPosition.startLineNumber, debugPosition.startColumn, debugPosition.endLineNumber, debugPosition.endColumn),
				options: {
					className: debugLineClassName,
					glyphMarginClassName: hasBreakpointOnCurrentLine ? debugLineAndBreakpointMarginClassName : debugLineMarginClassName,
				}
			}
		]);

		this.editor.setPosition({ lineNumber: debugPosition.startLineNumber, column: 1 });
		this.editor.revealLineInCenterIfOutsideViewport(debugPosition.startLineNumber);
	}

	removeDebugLine() {
		this.editor.deltaDecorations(this.currentDebugLineDecorations, []);
		this.currentDebugLineDecorations = [];
	}

	dispose() {
		this.removeDebugLine();
		this.hideBreakpointPreview();
		for (const breakpoint of this.breakpointDecorations.values())
			this.removeBreakpoint(breakpoint);
		super.dispose();
	}

	private enableGlyphMargin() {
		const editor = this.editor;
		const previousGlyphMarginSetting = editor.getOptions().get(monaco.editor.EditorOption.glyphMargin);
		this.register({ dispose() { editor.updateOptions({ glyphMargin: previousGlyphMarginSetting }) } });
		editor.updateOptions({ glyphMargin: true });
	}

	private onMouseDown = (e: monaco.editor.IEditorMouseEvent) => {
		if (e.event.leftButton && e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position)
			this.toggleBreakpoint(e.target.position.lineNumber);
	};

	private onMouseMove = (e: monaco.editor.IEditorMouseEvent) => {
		if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position)
			this.showBreakpointPreview(e.target.position.lineNumber);
		else
			this.hideBreakpointPreview();
	};

	private toggleBreakpoint(line?: number): void {
		line ??= this.editor.getPosition()?.lineNumber;
		if (line === undefined)
			return;

		const currentBreakpointDecoration = this.getBreakpointDecoration(line);
		if (currentBreakpointDecoration === undefined) {
			this.hideBreakpointPreview();
			this.addBreakpoint(line);
		} else {
			this.removeBreakpoint(currentBreakpointDecoration);
		}
		this.updateCurrentDebugLineDecoration(line);
	}

	private addBreakpoint(line: number): void {
		const model = this.editor.getModel();
		if (!model)
			return;

		const lineContent = model.getLineContent(line);
		if (!lineContent || !lineContent.trim())
			return; // do not set breakpoints on empty lines

		if (isComment(model, line))
			return;

		const decorationId = this.editor.deltaDecorations([], [
			{
				range: new monaco.Range(line, 1, line, 1),
				options: {
					glyphMarginClassName: breakPointMarginClassName,
					stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				}
			}
		])[0]; // there is only one new decoration
		const newDecoration = this.editor.getLineDecorations(line)!.find(x => x.id === decorationId)!;
		this.breakpointDecorations.set(decorationId, newDecoration);
	}

	private removeBreakpoint(breakpointDecoration: monaco.editor.IModelDecoration): void {
		this.editor.deltaDecorations([breakpointDecoration.id], []);
		this.breakpointDecorations.delete(breakpointDecoration.id);
	}

	private updateCurrentDebugLineDecoration(line: number): void {
		const currentDebugLineDecoration = this.getDebugLineDecoration(line);
		if (currentDebugLineDecoration !== undefined) {
			const currentClassName = currentDebugLineDecoration.options.glyphMarginClassName;
			const newClassName = currentClassName === debugLineAndBreakpointMarginClassName ? debugLineMarginClassName : debugLineAndBreakpointMarginClassName;
			currentDebugLineDecoration.options.glyphMarginClassName = newClassName;
		}
	}

	private showBreakpointPreview(line: number): void {
		const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];
		if (this.getBreakpointDecoration(line) === undefined && this.getDebugLineDecoration(line) === undefined) {
			// only add a preview if the current line does not already have a breakpoint set and is not the currently debugged line
			newDecorations.push({
				range: new monaco.Range(line, 1, line, 1),
				options: {
					glyphMarginClassName: `${breakPointMarginClassName} monacoBreakpointMarginPreview`,
					stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				}
			});
		}
		this.breakpointPreviewDecorations = this.editor.deltaDecorations(this.breakpointPreviewDecorations, newDecorations);
	}

	private hideBreakpointPreview(): void {
		if (this.breakpointPreviewDecorations.length > 0) {
			this.editor.deltaDecorations(this.breakpointPreviewDecorations, []);
			this.breakpointPreviewDecorations = [];
		}
	}

	private getBreakpointDecoration(line: number): monaco.editor.IModelDecoration | undefined {
		const lineDecorations = this.editor.getLineDecorations(line);
		return lineDecorations?.find(x => this.breakpointDecorations.has(x.id));
	}

	private getDebugLineDecoration(line: number): monaco.editor.IModelDecoration | undefined {
		const lineDecorations = this.editor.getLineDecorations(line);
		return lineDecorations?.find(x => this.currentDebugLineDecorations.includes(x.id));
	}
}
