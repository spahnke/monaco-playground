import { Disposable, toDisposable } from "../common/disposable.js";
import { isComment } from "../common/monaco-utils.js";
import { DebugProtocol, WebsocketTransport } from "../debug/debug-protocol.js";
import { CodeEditorTextInput } from "../code-editor-text-input.js";

const contextMenuGroupId = "8_debug";

/**
 * Adds debug UI capabilities to the editor.
 */
export class DebugContribution extends Disposable {
	private readonly breakpointPreviewDecorations: monaco.editor.IEditorDecorationsCollection;
	private readonly breakpointDecorations: Map<string, monaco.editor.IModelDecoration> = new Map();
	private readonly currentDebugLineDecorations: monaco.editor.IEditorDecorationsCollection;
	private readonly debugActiveContextKey: monaco.editor.IContextKey<boolean>;

	constructor(private readonly editor: monaco.editor.IStandaloneCodeEditor, debugRemoteAddressInput: CodeEditorTextInput) {
		super();
		this.breakpointPreviewDecorations = editor.createDecorationsCollection();
		this.currentDebugLineDecorations = editor.createDecorationsCollection();
		this.enableGlyphMargin();
		this.debugActiveContextKey = editor.createContextKey("debuggerSessionActive", false);
		// TODO(seb) For reacting to context key changes there is only the following undocumented access. Do we want to
		// go there for buttons/other UI that don't take context keys to react to state changes?
		//
		// editor._contextKeyService.onDidChangeContext(console.log) -> returns output like {key: 'debuggerSessionActive'}
		this.register(this.editor.onMouseMove(this.onMouseMove));
		this.register(this.editor.onMouseDown(this.onMouseDown));

		let protocol: DebugProtocol | undefined;
		this.register(editor.addAction({
			id: "debugger_start_session",
			label: "Start Debugging",
			keybindings: [monaco.KeyCode.F5],
			precondition: "!debuggerSessionActive",
			contextMenuGroupId: contextMenuGroupId,
			contextMenuOrder: 0,
			run: async () => {
				const remoteAddress = debugRemoteAddressInput.getText();
				if (!remoteAddress)
					return;

				protocol = new DebugProtocol(new WebsocketTransport(remoteAddress));
				protocol.transport.onDidTerminate((reason, error) => {
					if (reason === "close") {
						console.log("Transport connection was closed");
					} else {
						console.error("Transport connection was closed unexpectedly", error);
					}
					this.debugActiveContextKey.set(false);
				});
				protocol.runtime.on("executionContextCreated", params => {
					console.log("Debugging session started", params);
				});
				protocol.runtime.on("executionContextDestroyed", params => {
					console.log("Debugging session finished", params);
					protocol?.transport.disconnect();
				});
				protocol.runtime.on("consoleAPICalled", params => {
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
				protocol.debugger.on("scriptParsed", async params => {
					console.log("scriptParsed notification", params);
					const source = await protocol?.debugger.getScriptSource({ scriptId: params.scriptId });
					console.log("script src result", source);
				});
				protocol.debugger.on("paused", params => {
					console.log("paused notification", params);
				});
				await protocol.runtime.enable();
				console.log("Runtime.enable done");
				const enableResult = await protocol.debugger.enable({});
				console.log("Debugger.enable response", enableResult);
				await protocol.debugger.pause(); // pause on first statement
				console.log("Scheduled pause on first statement");
				await protocol.runtime.runIfWaitingForDebugger();
				this.debugActiveContextKey.set(true);
			}
		}));
		this.register(editor.addAction({
			id: "debugger_continue",
			label: "Continue",
			keybindings: [monaco.KeyCode.F5],
			precondition: "debuggerSessionActive",
			contextMenuGroupId: contextMenuGroupId,
			contextMenuOrder: 0,
			run: () => protocol?.debugger.resume({}),
		}));
		this.register(editor.addAction({
			id: "debugger_step_over",
			label: "Step Over",
			keybindings: [monaco.KeyCode.F10],
			precondition: "debuggerSessionActive",
			contextMenuGroupId: contextMenuGroupId,
			contextMenuOrder: 1,
			run: () => protocol?.debugger.stepOver({}),
		}));
		this.register(editor.addAction({
			id: "debugger_stop_session",
			label: "Stop Debugging",
			keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F5],
			precondition: "debuggerSessionActive",
			contextMenuGroupId: contextMenuGroupId,
			contextMenuOrder: 2,
			run: () => protocol?.debugger.resume({ terminateOnResume: true }),
		}));
		this.register(editor.addAction({
			id: "toggle_breakpoint",
			label: "Toggle Breakpoint",
			keybindings: [monaco.KeyCode.F9],
			contextMenuGroupId,
			contextMenuOrder: 3,
			run: () => this.toggleBreakpoint(),
		}));

		const debugOverlay: monaco.editor.IOverlayWidget = {
			getId() {
				return "debugger_overlay_widget";
			},

			getDomNode() {
				// TODO(seb) Hook up all buttons with corresponding actions and react to state changes
				// TODO(seb) Vendor the styles from the find widget classes as styles for the debug widget
				const debugWidget = document.createElement("div");
				debugWidget.className = "monaco-editor editor-widget find-widget visible";
				debugWidget.style.display = "flex";
				debugWidget.style.alignItems = "center";
				const startAndContinueButton = document.createElement("div");
				startAndContinueButton.className = "button codicon codicon-debug-start";
				startAndContinueButton.addEventListener("click", () => editor.trigger("debugger", "debugger_start_session", null));
				debugWidget.appendChild(startAndContinueButton);
				const continueButton = document.createElement("div");
				continueButton.className = "button codicon codicon-debug-continue";
				continueButton.addEventListener("click", () => editor.trigger("debugger", "debugger_continue", null));
				debugWidget.appendChild(continueButton);
				const pauseButton = document.createElement("div");
				pauseButton.className = "button codicon codicon-debug-pause";
				debugWidget.appendChild(pauseButton);
				const stepOverButton = document.createElement("div");
				stepOverButton.className = "button codicon codicon-debug-step-over";
				stepOverButton.addEventListener("click", () => editor.trigger("debugger", "debugger_step_over", null));
				debugWidget.appendChild(stepOverButton);
				const stepIntoButton = document.createElement("div");
				stepIntoButton.className = "button codicon codicon-debug-step-into";
				debugWidget.appendChild(stepIntoButton);
				// TODO(seb) How do we want to handle this in general? Like monaco with aria roles/disabled/classes? Or
				// do we use a button element and do more styling? We don't need any special handling in the click
				// handler because we trigger actions that have preconditions anyway.
				const stepOutButton = document.createElement("div");
				stepOutButton.className = "button codicon codicon-debug-step-out disabled";
				debugWidget.appendChild(stepOutButton);
				const stopButton = document.createElement("div");
				stopButton.className = "button codicon codicon-debug-stop";
				stopButton.addEventListener("click", () => editor.trigger("debugger", "debugger_stop_session", null));
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
