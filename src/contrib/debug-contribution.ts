import { Disposable, toDisposable } from "../common/disposable.js";
import { isComment } from "../common/monaco-utils.js";
import { WebsocketTransport } from "../debug/debug-protocol.js";
import { DebugSession } from "../debug/debug-session.js";
import { CodeEditorTextInput } from "../code-editor-text-input.js";

const contextMenuGroupId = "8_debug";

class DebugWidget extends Disposable implements monaco.editor.IOverlayWidget {
	private domNode: HTMLElement;

	constructor(private editor: monaco.editor.IStandaloneCodeEditor, debugSession: DebugSession) {
		super();
		// TODO(seb) Vendor the styles from the find widget classes as styles for the debug widget
		this.domNode                  = document.createElement("div");
		this.domNode.className        = "monaco-editor editor-widget find-widget";
		this.domNode.style.display    = "flex";
		this.domNode.style.alignItems = "center";
		const startButton             = this.createAndAddButton("Start Debugging (F5)", "debug-start", "debugger_start_session", true);
		const continueButton          = this.createAndAddButton("Continue (F5)", "debug-continue", "debugger_continue", false, false);
		const pauseButton             = this.createAndAddButton("Pause (F6)", "debug-pause", "debugger_pause");
		const stepOverButton          = this.createAndAddButton("Step Over (F10)", "debug-step-over", "debugger_step_over");
		const stepIntoButton          = this.createAndAddButton("Step Into (F11)", "debug-step-into", "debugger_step_into");
		const stepOutButton           = this.createAndAddButton("Step Out (Shift+F11)", "debug-step-out", "debugger_step_out");
		const stopButton              = this.createAndAddButton("Stop (Shift+F5)", "debug-stop", "debugger_stop_session");

		this.register(debugSession.onDidConnectedChange(connected => {
			this.setButtonEnabled(startButton, !connected);
			this.setButtonVisible(startButton, !connected);
			this.setButtonVisible(continueButton, connected);
			if (!connected) {
				this.setButtonEnabled(continueButton, false);
				this.setButtonEnabled(pauseButton, false);
				this.setButtonEnabled(stepOverButton, false);
				this.setButtonEnabled(stepIntoButton, false);
				this.setButtonEnabled(stepOutButton, false);
				this.setButtonEnabled(stopButton, false);
			}
		}));
		this.register(debugSession.onDidPausedStateChange(paused => {
			this.setButtonEnabled(continueButton, paused);
			this.setButtonEnabled(pauseButton, !paused);
			this.setButtonEnabled(stepOverButton, paused);
			this.setButtonEnabled(stepIntoButton, paused);
			this.setButtonEnabled(stepOutButton, paused);
			this.setButtonEnabled(stopButton, paused);
		}));
	}

	getId(): string {
		return "debugger_overlay_widget";
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): monaco.editor.IOverlayWidgetPosition | null {
		return {
			preference: monaco.editor.OverlayWidgetPositionPreference.TOP_CENTER,
		};
	}

	setVisible(visible: boolean): void {
		if (visible) {
			this.domNode.classList.add("visible");
			this.domNode.inert = false;
		} else {
			this.domNode.classList.remove("visible");
			this.domNode.inert = true;
		}
	}

	private createAndAddButton(label: string, icon: string, action: string, enabled = false, visible = true): HTMLElement {
		const button     = document.createElement("div");
		button.title     = label;
		button.ariaLabel = label;
		button.role      = "button";
		button.className = `button codicon codicon-${icon}`;
		this.setButtonEnabled(button, enabled);
		this.setButtonVisible(button, visible);
		button.addEventListener("click", () => this.editor.trigger("debugger", action, null));
		this.domNode.appendChild(button);
		return button;
	}

	private setButtonEnabled(button: HTMLElement, enable: boolean): void {
		if (enable) {
			button.classList.remove("disabled");
			button.ariaDisabled = "false";
			button.tabIndex = 0;
		} else {
			button.classList.add("disabled");
			button.ariaDisabled = "true";
			button.tabIndex = -1;
		}
	}

	private setButtonVisible(button: HTMLElement, visible: boolean): void {
		if (visible) {
			button.classList.remove("hidden");
		} else {
			button.classList.add("hidden");
		}
	}
}

/**
 * Adds debug UI capabilities to the editor.
 */
export class DebugContribution extends Disposable {
	private readonly debugSession = this.register(new DebugSession());
	private readonly breakpointPreviewDecorations: monaco.editor.IEditorDecorationsCollection;
	private readonly breakpointDecorations: Map<string, monaco.editor.IModelDecoration> = new Map();
	private readonly currentDebugLineDecorations: monaco.editor.IEditorDecorationsCollection;

	constructor(private readonly editor: monaco.editor.IStandaloneCodeEditor, debugRemoteAddressInput: CodeEditorTextInput) {
		super();
		this.breakpointPreviewDecorations = editor.createDecorationsCollection();
		this.currentDebugLineDecorations = editor.createDecorationsCollection();
		this.enableGlyphMargin();
		this.register(this.editor.onMouseMove(this.onMouseMove));
		this.register(this.editor.onMouseDown(this.onMouseDown));

		const isValidRemoteAddress = (maybeUrl: string) => {
			const url = monaco.Uri.parse(maybeUrl);
			return url.scheme === "ws" || url.scheme === "wss";
		};

		const debugWidget = this.register(new DebugWidget(editor, this.debugSession));
		debugWidget.setVisible(isValidRemoteAddress(debugRemoteAddressInput.getText()));
		this.register(debugRemoteAddressInput.onDidChangeText(maybeUrl => debugWidget.setVisible(isValidRemoteAddress(maybeUrl))));
		editor.addOverlayWidget(debugWidget);
		this.register(toDisposable(() => editor.removeOverlayWidget(debugWidget)));

		const debugActiveContextKey = editor.createContextKey<boolean>("debuggerSessionActive", false);
		const debugPausedContextKey = editor.createContextKey<boolean>("debuggerSessionPaused", false);
		this.register(this.debugSession.onDidConnectedChange(connected => {
			debugActiveContextKey.set(connected);
			debugRemoteAddressInput.setDisabled(connected);
		}));
		this.register(this.debugSession.onDidPausedStateChange(paused => {
			debugPausedContextKey.set(paused);
		}));
		this.register(editor.addAction({
			id: "debugger_start_session",
			label: "Start Debugging",
			keybindings: [monaco.KeyCode.F5],
			precondition: "!debuggerSessionActive",
			run: () => {
				const remoteAddress = debugRemoteAddressInput.getText();
				if (!isValidRemoteAddress(remoteAddress))
					return;
				this.debugSession.connect(() => new WebsocketTransport(remoteAddress), true);
			}
		}));
		this.register(editor.addAction({
			id: "debugger_continue",
			label: "Continue",
			keybindings: [monaco.KeyCode.F5],
			precondition: "debuggerSessionActive && debuggerSessionPaused",
			run: () => this.debugSession.continue(),
		}));
		this.register(editor.addAction({
			id: "debugger_pause",
			label: "Pause",
			keybindings: [monaco.KeyCode.F6],
			precondition: "debuggerSessionActive && !debuggerSessionPaused",
			run: () => this.debugSession.pause(),
		}));
		this.register(editor.addAction({
			id: "debugger_step_over",
			label: "Step Over",
			keybindings: [monaco.KeyCode.F10],
			precondition: "debuggerSessionActive && debuggerSessionPaused",
			run: () => this.debugSession.stepOver(),
		}));
		this.register(editor.addAction({
			id: "debugger_step_into",
			label: "Step Into",
			keybindings: [monaco.KeyCode.F11],
			precondition: "debuggerSessionActive && debuggerSessionPaused",
			run: () => this.debugSession.stepInto(),
		}));
		this.register(editor.addAction({
			id: "debugger_step_out",
			label: "Step Out",
			keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F11],
			precondition: "debuggerSessionActive && debuggerSessionPaused",
			run: () => this.debugSession.stepOut(),
		}));
		this.register(editor.addAction({
			id: "debugger_stop_session",
			label: "Stop Debugging",
			keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F5],
			precondition: "debuggerSessionActive",
			run: () => this.debugSession.stop(),
		}));
		this.register(editor.addAction({
			id: "toggle_breakpoint",
			label: "Toggle Breakpoint",
			keybindings: [monaco.KeyCode.F9],
			contextMenuGroupId,
			run: () => this.toggleBreakpoint(),
		}));
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
