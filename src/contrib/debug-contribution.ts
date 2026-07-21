import { Disposable, toDisposable } from "../common/disposable.js";
import { isComment } from "../common/monaco-utils.js";

const contextMenuGroupId = "8_debug";

/**
 * Adds debug UI capabilities to the editor.
 */
export class DebugContribution extends Disposable {
	private readonly breakpointPreviewDecorations: monaco.editor.IEditorDecorationsCollection;
	private readonly breakpointDecorations: Map<string, monaco.editor.IModelDecoration> = new Map();
	private readonly currentDebugLineDecorations: monaco.editor.IEditorDecorationsCollection;
	private readonly debugActiveContextKey: monaco.editor.IContextKey<boolean>;

	constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
		super();
		this.breakpointPreviewDecorations = editor.createDecorationsCollection();
		this.currentDebugLineDecorations = editor.createDecorationsCollection();
		this.enableGlyphMargin();
		this.debugActiveContextKey = editor.createContextKey("debuggerSessionActive", false);
		this.register(this.editor.onMouseMove(this.onMouseMove));
		this.register(this.editor.onMouseDown(this.onMouseDown));
		this.register(editor.addAction({
			id: "debugger_start_session",
			label: "Start Debugging",
			keybindings: [monaco.KeyCode.F5],
			precondition: "!debuggerSessionActive",
			run: async () => {
				console.log("Start debugging");
				this.debugActiveContextKey.set(true);
			},
		}));
		this.register(editor.addAction({
			id: "debugger_continue",
			label: "Start Debugging",
			keybindings: [monaco.KeyCode.F5],
			precondition: "debuggerSessionActive",
			run: async () => {
				console.log("Continue");
			},
		}));
		this.register(editor.addAction({
			id: "debugger_step_over",
			label: "Start Debugging",
			keybindings: [monaco.KeyCode.F10],
			precondition: "debuggerSessionActive",
			run: async () => {
				console.log("Step over");
			},
		}));
		this.register(editor.addAction({
			id: "debugger_stop_session",
			label: "Start Debugging",
			keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F5],
			precondition: "debuggerSessionActive",
			run: async () => {
				console.log("Stop debugging");
				this.debugActiveContextKey.set(false);
			},
		}));
		this.register(editor.addAction({
			id: "toggle_breakpoint",
			label: "Toggle Breakpoint",
			keybindings: [monaco.KeyCode.F9],
			contextMenuGroupId,
			contextMenuOrder: 0,
			run: () => this.toggleBreakpoint(),
		}));

		const debugOverlay: monaco.editor.IOverlayWidget = {
			getId() {
				return "debugger_overlay_widget";
			},

			getDomNode() {
				const debugWidget = document.createElement("div");
				debugWidget.className = "monaco-editor editor-widget find-widget visible";
				debugWidget.style.display = "flex";
				debugWidget.style.alignItems = "center";
				const startAndContinueButton = document.createElement("div");
				startAndContinueButton.className = "button codicon codicon-debug-start";
				debugWidget.appendChild(startAndContinueButton);
				const continueButton = document.createElement("div");
				continueButton.className = "button codicon codicon-debug-continue";
				debugWidget.appendChild(continueButton);
				const pauseButton = document.createElement("div");
				pauseButton.className = "button codicon codicon-debug-pause";
				debugWidget.appendChild(pauseButton);
				const stepOverButton = document.createElement("div");
				stepOverButton.className = "button codicon codicon-debug-step-over";
				debugWidget.appendChild(stepOverButton);
				const stepIntoButton = document.createElement("div");
				stepIntoButton.className = "button codicon codicon-debug-step-into";
				debugWidget.appendChild(stepIntoButton);
				const stepOutButton = document.createElement("div");
				stepOutButton.className = "button codicon codicon-debug-step-out";
				debugWidget.appendChild(stepOutButton);
				const stopButton = document.createElement("div");
				stopButton.className = "button codicon codicon-debug-stop";
				debugWidget.appendChild(stopButton);
				return debugWidget;
			},

			getPosition() {
				return {
					preference: monaco.editor.OverlayWidgetPositionPreference.TOP_CENTER,
				};
			},
		};
		editor.addOverlayWidget(debugOverlay);
		this.register(toDisposable(() => editor.removeOverlayWidget(debugOverlay)));
	}

	override dispose(): void {
		this.removeDebugLine();
		this.hideBreakpointPreview();
		for (const breakpoint of this.breakpointDecorations.values())
			this.removeBreakpoint(breakpoint);
		super.dispose();
	}

	private displayCurrentlyDebuggedLine(debugPosition: monaco.IRange): void {
		if (debugPosition.startLineNumber < 1) {
			this.removeDebugLine();
			return;
		}
		this.currentDebugLineDecorations.set([
			{
				range: new monaco.Range(debugPosition.startLineNumber, debugPosition.startColumn, debugPosition.endLineNumber, debugPosition.endColumn),
				options: {
					className: "monaco-debug-line",
					glyphMarginClassName: "codicon-debug-stackframe",
				}
			}
		]);

		this.editor.setPosition({ lineNumber: debugPosition.startLineNumber, column: 1 });
		this.editor.revealLineInCenterIfOutsideViewport(debugPosition.startLineNumber);
	}

	private removeDebugLine(): void {
		this.currentDebugLineDecorations.clear();
	}

	private enableGlyphMargin() {
		const editor = this.editor;
		const previousGlyphMarginSetting = editor.getOptions().get(monaco.editor.EditorOption.glyphMargin);
		this.register(toDisposable(() => editor.updateOptions({ glyphMargin: previousGlyphMarginSetting })));
		editor.updateOptions({ glyphMargin: true });
	}

	private onMouseDown = (e: monaco.editor.IEditorMouseEvent) => {
		if (e.event.leftButton && e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position && !e.target.detail?.isAfterLines)
			this.toggleBreakpoint(e.target.position.lineNumber);
	};

	private onMouseMove = (e: monaco.editor.IEditorMouseEvent) => {
		if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position && !e.target.detail?.isAfterLines)
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

		const [decorationId] = model.deltaDecorations([], [
			{
				range: new monaco.Range(line, 1, line, 1),
				options: {
					glyphMarginClassName: "codicon-debug-breakpoint",
					glyphMarginHoverMessage: { value: "Breakpoint", isTrusted: true },
					stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				}
			}
		]);
		const newDecoration = this.editor.getLineDecorations(line)!.find(x => x.id === decorationId)!;
		this.breakpointDecorations.set(decorationId, newDecoration);
	}

	private removeBreakpoint(breakpointDecoration: monaco.editor.IModelDecoration): void {
		const model = this.editor.getModel();
		if (!model)
			return;
		model.deltaDecorations([breakpointDecoration.id], []);
		this.breakpointDecorations.delete(breakpointDecoration.id);
	}

	private showBreakpointPreview(line: number): void {
		const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];
		if (this.getBreakpointDecoration(line) === undefined && this.getDebugLineDecoration(line) === undefined) {
			// only add a preview if the current line does not already have a breakpoint set and is not the currently debugged line
			newDecorations.push({
				range: new monaco.Range(line, 1, line, 1),
				options: {
					glyphMarginClassName: "codicon-debug-hint",
					stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				}
			});
		}
		this.breakpointPreviewDecorations.set(newDecorations);
	}

	private hideBreakpointPreview(): void {
		if (this.breakpointPreviewDecorations.length > 0)
			this.breakpointPreviewDecorations.clear();
	}

	private getBreakpointDecoration(line: number): monaco.editor.IModelDecoration | undefined {
		const lineDecorations = this.editor.getLineDecorations(line);
		return lineDecorations?.find(x => this.breakpointDecorations.has(x.id));
	}

	private getDebugLineDecoration(line: number): monaco.editor.IModelDecoration | undefined {
		const lineDecorations = this.editor.getLineDecorations(line);
		return lineDecorations?.find(x => this.currentDebugLineDecorations.has(x));
	}
}
