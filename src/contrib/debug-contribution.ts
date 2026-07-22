import { Disposable, toDisposable } from "../common/disposable.js";
import { isComment } from "../common/monaco-utils.js";
import { DebugProtocol, WebsocketTransport } from "../debug/debug-protocol.js";
import { CodeEditorTextInput } from "../code-editor-text-input.js";

const contextMenuGroupId = "8_debug";

class DebugWidget implements monaco.editor.IOverlayWidget {
	private domNode: HTMLElement;
	private startButton: HTMLElement;
	private continueButton: HTMLElement;
	private pauseButton: HTMLElement;
	private stepOverButton: HTMLElement;
	private stepIntoButton: HTMLElement;
	private stepOutButton: HTMLElement;
	private stopButton: HTMLElement;

	constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
		// TODO(seb) Hook up all buttons with corresponding actions and react to state changes
		// TODO(seb) Vendor the styles from the find widget classes as styles for the debug widget
		this.domNode                  = document.createElement("div");
		this.domNode.className        = "monaco-editor editor-widget find-widget";
		this.domNode.style.display    = "flex";
		this.domNode.style.alignItems = "center";
		this.startButton              = this.createAndAddButton("Start Debugging (F5)", "debug-start", "debugger_start_session");
		this.continueButton           = this.createAndAddButton("Continue (F5)", "debug-continue", "debugger_continue");
		this.pauseButton              = this.createAndAddButton("Pause (F6)", "debug-pause", "debugger_pause");
		this.stepOverButton           = this.createAndAddButton("Step Over (F10)", "debug-step-over", "debugger_step_over");
		this.stepIntoButton           = this.createAndAddButton("Step Into (F11)", "debug-step-into", "debugger_step_into");
		this.stepOutButton            = this.createAndAddButton("Step Out (Shift+F11)", "debug-step-out", "debugger_step_out");
		this.stopButton               = this.createAndAddButton("Stop (Shift+F5)", "debug-stop", "debugger_stop_session");
		this.setButtonEnabled(this.stepOutButton, false);
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

	private createAndAddButton(label: string, icon: string, action: string): HTMLElement {
		// TODO(seb) How do we want to handle this in general? Like monaco with aria roles/disabled/classes? Or
		// do we use a button element and do more styling? We don't need any special handling in the click
		// handler because we trigger actions that have preconditions anyway.
		const button        = document.createElement("div");
		button.title        = label;
		button.ariaLabel    = label;
		button.ariaDisabled = "false";
		button.role         = "button";
		button.tabIndex     = 0;
		button.className    = `button codicon codicon-${icon}`;
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
}

// TODO(seb) State for a single debug session; keep this free from UI stuff. To be moved to the debug folder.
class DebugSession extends Disposable {
	private protocol: DebugProtocol | undefined;
	private readonly connectedEvent = this.register(new monaco.Emitter<boolean>());
	private readonly pausedEvent = this.register(new monaco.Emitter<boolean>());

	readonly onDidConnectedChange = this.connectedEvent.event;
	readonly onDidPausedStateChange = this.pausedEvent.event;

	async connect(remoteAddress: string, pauseOnFirstStatement: boolean): Promise<void> {
		this.protocol = new DebugProtocol(new WebsocketTransport(remoteAddress));
		this.protocol.transport.onDidTerminate((reason, error) => {
			if (reason === "close") {
				console.log("Transport connection was closed");
			} else {
				console.error("Transport connection was closed unexpectedly", error);
			}
			this.connectedEvent.fire(false);
		});
		this.protocol.runtime.on("executionContextCreated", params => {
			console.log("Debugging session started", params);
		});
		this.protocol.runtime.on("executionContextDestroyed", params => {
			console.log("Debugging session finished", params);
			this.disconnect();
		});
		this.protocol.runtime.on("consoleAPICalled", params => {
			const args = params.args.map(arg => {
				switch (arg.type) {
					case "bigint": return BigInt(arg.unserializableValue!.slice(0, -1));
					case "function": return arg.description ?? "<function>";
					case "object": {
						if (arg.subtype === "null") {
							return null;
						} else if (arg.preview) {
							if (arg.subtype) {
								return arg.description;
							} else {
								const obj = Object.create(null);
								for (const prop of arg.preview.properties) {
									let value;
									switch (prop.type) {
										case "bigint": value = BigInt(prop.value!.slice(0, -1)); break;
										case "boolean": value = Boolean(prop.value); break;
										case "number": value = Number(prop.value); break;
										default: value = prop.value; break;
									}
									obj[prop.name] = value;
								}
								return obj;
							}
						} else {
							return "<object>";
						}
					}
					case "symbol": return arg.description ?? "<symbol>";
					default: return arg.value;
				}
			});
			switch (params.type) {
				case "assert": console.assert(...args); break;
				case "warning": console.warn(...args); break;
				case "startGroup": console.group(...args); break;
				case "startGroupCollapsed": console.groupCollapsed(...args); break;
				case "endGroup": console.groupEnd(); break;
				case "profile": console.time(...args); break;
				case "profileEnd": console.timeEnd(...args); break;
				default: console[params.type](...args); break;
			}
		});
		this.protocol.debugger.on("scriptParsed", async params => {
			console.log("scriptParsed notification", params);
			const source = await this.protocol?.debugger.getScriptSource({ scriptId: params.scriptId });
			console.log("script src result", source);
		});
		this.protocol.debugger.on("paused", params => {
			console.log("paused notification", params);
			this.pausedEvent.fire(true);
		});
		this.protocol.debugger.on("resumed", () => {
			console.log("resumed notification");
			this.pausedEvent.fire(false);
		});
		await this.protocol.runtime.enable();
		console.log("Runtime.enable done");
		const enableResult = await this.protocol.debugger.enable({});
		console.log("Debugger.enable response", enableResult);
		if (pauseOnFirstStatement) {
			await this.protocol.debugger.pause();
			console.log("Scheduled pause on first statement");
		}
		await this.protocol.runtime.runIfWaitingForDebugger();
		this.connectedEvent.fire(true);
	}

	continue(): void {
		this.protocol?.debugger.resume({});
	}

	pause(): void {
		this.protocol?.debugger.pause();
	}

	stepOver(): void {
		this.protocol?.debugger.stepOver({});
	}

	stepInto(): void {
		this.protocol?.debugger.stepInto({});
	}

	stepOut(): void {
		this.protocol?.debugger.stepOut();
	}

	stop(): void {
		this.protocol?.debugger.resume({ terminateOnResume: true });
	}

	disconnect(): void {
		this.protocol?.transport.disconnect();
		this.protocol = undefined;
	}

	override dispose(): void {
		this.disconnect();
		super.dispose();
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

		const debugWidget = new DebugWidget(editor);
		debugWidget.setVisible(isValidRemoteAddress(debugRemoteAddressInput.getText()));
		this.register(debugRemoteAddressInput.onDidChangeText(maybeUrl => debugWidget.setVisible(isValidRemoteAddress(maybeUrl))));
		editor.addOverlayWidget(debugWidget);
		this.register(toDisposable(() => editor.removeOverlayWidget(debugWidget)));

		const debugActiveContextKey = editor.createContextKey<boolean>("debuggerSessionActive", false);
		this.register(editor.addAction({
			id: "debugger_start_session",
			label: "Start Debugging",
			keybindings: [monaco.KeyCode.F5],
			precondition: "!debuggerSessionActive",
			run: () => {
				const remoteAddress = debugRemoteAddressInput.getText();
				if (!isValidRemoteAddress(remoteAddress))
					return;

				let connectedEvent = this.debugSession.onDidConnectedChange(connected => {
					debugActiveContextKey.set(connected);
					debugRemoteAddressInput.setDisabled(connected);
					if (!connected) {
						connectedEvent.dispose();
						connectedEvent = null!;
					}
				});
				this.debugSession.connect(remoteAddress, true);
			}
		}));
		this.register(editor.addAction({
			id: "debugger_continue",
			label: "Continue",
			keybindings: [monaco.KeyCode.F5],
			precondition: "debuggerSessionActive",
			run: () => this.debugSession.continue(),
		}));
		this.register(editor.addAction({
			id: "debugger_pause",
			label: "Pause",
			keybindings: [monaco.KeyCode.F6],
			precondition: "debuggerSessionActive",
			run: () => this.debugSession.pause(),
		}));
		this.register(editor.addAction({
			id: "debugger_step_over",
			label: "Step Over",
			keybindings: [monaco.KeyCode.F10],
			precondition: "debuggerSessionActive",
			run: () => this.debugSession.stepOver(),
		}));
		this.register(editor.addAction({
			id: "debugger_step_into",
			label: "Step Into",
			keybindings: [monaco.KeyCode.F11],
			precondition: "debuggerSessionActive",
			run: () => this.debugSession.stepInto(),
		}));
		this.register(editor.addAction({
			id: "debugger_step_out",
			label: "Step Out",
			keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F11],
			precondition: "debuggerSessionActive",
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
