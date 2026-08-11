import { Disposable, toDisposable } from "../common/disposable.js";
import { isComment } from "../common/monaco-utils.js";
import { WebsocketTransport } from "../debug/debug-protocol.js";
import { DebugSession } from "../debug/debug-session.js";
import { CodeEditor } from "../code-editor.js";
import { CodeEditorTextInput } from "../code-editor-text-input.js";

const contextMenuGroupId = "8_debug";

class DebugWidget extends Disposable implements monaco.editor.IOverlayWidget {
	private readonly domNode: HTMLElement;
	private readonly startButton: HTMLElement;
	private readonly continueButton: HTMLElement;
	private readonly pauseButton: HTMLElement;
	private readonly stepOverButton: HTMLElement;
	private readonly stepIntoButton: HTMLElement;
	private readonly stepOutButton: HTMLElement;
	private readonly stopButton: HTMLElement;

	constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
		super();
		// TODO(seb) Vendor the styles from the find widget classes as styles for the debug widget
		this.domNode                  = document.createElement("div");
		this.domNode.className        = "monaco-editor editor-widget find-widget";
		this.domNode.style.display    = "flex";
		this.domNode.style.alignItems = "center";
		this.startButton              = this.createAndAddButton("Start Debugging (F5)", "debug-start", "debugger_start_session", true);
		this.continueButton           = this.createAndAddButton("Continue (F5)", "debug-continue", "debugger_continue", false, false);
		this.pauseButton              = this.createAndAddButton("Pause (F6)", "debug-pause", "debugger_pause");
		this.stepOverButton           = this.createAndAddButton("Step Over (F10)", "debug-step-over", "debugger_step_over");
		this.stepIntoButton           = this.createAndAddButton("Step Into (F11)", "debug-step-into", "debugger_step_into");
		this.stepOutButton            = this.createAndAddButton("Step Out (Shift+F11)", "debug-step-out", "debugger_step_out");
		this.stopButton               = this.createAndAddButton("Stop (Shift+F5)", "debug-stop", "debugger_stop_session");
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

	updateState(debuggerSessionActive: boolean, debuggerSessionPaused: boolean): void {
		this.setButtonVisible(this.startButton,    !debuggerSessionActive);
		this.setButtonEnabled(this.startButton,    !debuggerSessionActive);
		this.setButtonVisible(this.continueButton, debuggerSessionActive);
		this.setButtonEnabled(this.continueButton, debuggerSessionActive && debuggerSessionPaused);
		this.setButtonEnabled(this.pauseButton,    debuggerSessionActive && !debuggerSessionPaused);
		this.setButtonEnabled(this.stepOverButton, debuggerSessionActive && debuggerSessionPaused);
		this.setButtonEnabled(this.stepIntoButton, debuggerSessionActive && debuggerSessionPaused);
		this.setButtonEnabled(this.stepOutButton,  debuggerSessionActive && debuggerSessionPaused);
		this.setButtonEnabled(this.stopButton,     debuggerSessionActive);
	}

	private createAndAddButton(label: string, icon: string, action: string, enabled = false, visible = true): HTMLElement {
		const button     = document.createElement("div");
		button.title     = label;
		button.ariaLabel = label;
		button.role      = "button";
		button.className = `button codicon codicon-${icon}`;
		this.setButtonEnabled(button, enabled);
		this.setButtonVisible(button, visible);
		button.addEventListener("click", () => {
			this.editor.trigger("debugger", action, null);
			this.editor.focus();
		});
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

// NOTE(seb) Inspired by the VSCode internal List widget in src/vs/base/browser/ui/list/listWidget.ts minus the
// virtualization because we just use unvirtualized DOM elements and only one renderer.

interface IListElementRenderer<TElement, TTemplate> {
	createTemplate(container: HTMLElement): TTemplate;
	renderElement(element: TElement, index: number, template: TTemplate): void;
	disposeTemplate(template: TTemplate): void;
}

class ListWidget<T> implements monaco.IDisposable {
	private readonly selectElement: HTMLSelectElement;
	private readonly templates: unknown[] = [];
	private readonly onDidSelectItemEmitter = new monaco.Emitter<{ index: number; item: T | undefined; }>();

	constructor(private container: HTMLElement, private renderer: IListElementRenderer<T, unknown>) {
		this.selectElement = document.createElement("select");
		this.selectElement.size = 2; // make it into a listbox instead of a dropdown
		this.selectElement.disabled = true;
		this.selectElement.classList.add("custom-select");
		container.appendChild(this.selectElement);

		const handleSelection = (e: Event) => {
			let optionElement: HTMLOptionElement | undefined;
			let target = e.target as HTMLElement | null;
			while (target && target !== this.selectElement) {
				if (target.tagName === "OPTION") {
					optionElement = target as HTMLOptionElement;
					break;
				}
				target = target.parentElement;
			}
			if (optionElement) {
				const index = Number(optionElement.dataset.index);
				if (this.selectElement.selectedIndex === index) {
					// prevent deselection of selected elements and trigger change event on them instead
					e.preventDefault();
					e.stopPropagation();
					this.selectElement.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
				}
			}
		};
		this.selectElement.addEventListener("click", handleSelection);
		this.selectElement.addEventListener("keydown", e => {
			if (e.code === "Space" || e.code === "Enter") {
				handleSelection(e);
			}
		});
		this.selectElement.addEventListener("change", e => this.onDidSelectItemEmitter.fire({ index: this.selectedIndex, item: this.selectedItem }));
	}

	get disabled(): boolean { return this.selectElement.disabled; }
	set disabled(value: boolean) { this.selectElement.disabled = value; }

	readonly items: T[] = [];
	readonly onDidSelectItem = this.onDidSelectItemEmitter.event;

	get selectedIndex(): number { return this.selectElement.selectedIndex; }
	set selectedIndex(value: number) { this.selectElement.selectedIndex = value; }

	get selectedItem(): T | undefined {
		return this.selectedIndex >= 0 ? this.items[this.selectedIndex] : undefined;
	}

	render(items: T[] = []): void {
		while (this.selectElement.children.length < items.length) {
			this.createOptionElement();
		}
		for (let i = 0; i < items.length; i++) {
			const optionElement = this.selectElement.children[i] as HTMLOptionElement;
			const template = this.templates[i];
			optionElement.style.display = "";
			this.renderer.renderElement(items[i], i, template);
		}
		for (let i = items.length; i < this.selectElement.children.length; i++) {
			(this.selectElement.children[i] as HTMLOptionElement).style.display = "none";
		}
		this.items.splice(0, this.items.length, ...items);
	}

	dispose(): void {
		this.selectElement.remove();
		this.onDidSelectItemEmitter.dispose();
	}

	private createOptionElement(): void {
		const optionElement = document.createElement("option");
		optionElement.dataset.index = String(this.selectElement.childElementCount);
		const template = this.renderer.createTemplate(optionElement);
		this.templates.push(template);
		this.selectElement.appendChild(optionElement);
		console.assert(this.templates.length === this.selectElement.childElementCount);
	}
}

class CallframeRenderer implements IListElementRenderer<string, HTMLSpanElement> {
	createTemplate(container: HTMLElement): HTMLSpanElement {
		const span = document.createElement("span");
		span.style.fontSize = "smaller";
		container.appendChild(span);
		return span;
	}

	renderElement(element: string, index: number, template: HTMLSpanElement): void {
		template.innerText = element;
		template.title = element;
	}

	disposeTemplate(template: HTMLSpanElement): void {
		template.remove();
	}
}

class ScriptRenderer implements IListElementRenderer<monaco.Uri, HTMLSpanElement> {
	createTemplate(container: HTMLElement): HTMLSpanElement {
		const span = document.createElement("span");
		span.style.fontSize = "smaller";
		container.appendChild(span);
		return span;
	}

	renderElement(element: monaco.Uri, index: number, template: HTMLSpanElement): void {
		template.innerText = element.path;
		template.title = element.path;
	}

	disposeTemplate(template: HTMLSpanElement): void {
		template.remove();
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
	/** Dispose to restore original state after debugging. */
	private originalEditorState?: monaco.IDisposable;

	constructor(private readonly editor: CodeEditor, debugRemoteAddressInput: CodeEditorTextInput, callframeListElementContainer: HTMLElement, scriptListElementContainer: HTMLElement) {
		super();
		this.breakpointPreviewDecorations = editor.monacoEditor.createDecorationsCollection();
		this.currentDebugLineDecorations = editor.monacoEditor.createDecorationsCollection();
		this.enableGlyphMargin();
		this.register(this.editor.monacoEditor.onMouseMove(this.onMouseMove));
		this.register(this.editor.monacoEditor.onMouseDown(this.onMouseDown));

		const isValidRemoteAddress = (maybeUrl: string): boolean => {
			const url = monaco.Uri.parse(maybeUrl);
			return (url.scheme === "ws" || url.scheme === "wss") && typeof url.authority === "string" && url.authority.trim() !== "";
		};

		const debugWidget = this.register(new DebugWidget(editor.monacoEditor));
		debugWidget.setVisible(isValidRemoteAddress(debugRemoteAddressInput.getText()));
		this.register(debugRemoteAddressInput.onDidChangeText(maybeUrl => debugWidget.setVisible(isValidRemoteAddress(maybeUrl))));
		editor.monacoEditor.addOverlayWidget(debugWidget);
		this.register(toDisposable(() => editor.monacoEditor.removeOverlayWidget(debugWidget)));

		const callframeListWidget = new ListWidget<string>(callframeListElementContainer, new CallframeRenderer());
		const scriptListWidget = new ListWidget<monaco.Uri>(scriptListElementContainer, new ScriptRenderer());

		const debugActiveContextKey = editor.monacoEditor.createContextKey<boolean>("debuggerSessionActive", false);
		const debugPausedContextKey = editor.monacoEditor.createContextKey<boolean>("debuggerSessionPaused", false);
		let currentResolveAndDisplaySourceLineOperation: monaco.CancellationTokenSource | undefined;
		this.register(this.debugSession.onDidChangeActiveState(active => {
			if (active) {
				const originalModel = editor.monacoEditor.getModel();
				const originalViewState = editor.monacoEditor.saveViewState();
				const originalReadonly = editor.isReadonly();
				this.originalEditorState = toDisposable(() => {
					this.removeDebugLine();
					editor.monacoEditor.setModel(originalModel);
					editor.monacoEditor.restoreViewState(originalViewState);
					editor.setReadonly(originalReadonly);
				});
				editor.setReadonly(true);
			} else {
				this.originalEditorState?.dispose();
				this.originalEditorState = undefined;
			}
			debugActiveContextKey.set(active);
			debugRemoteAddressInput.setDisabled(active);
			debugWidget.updateState(active, debugPausedContextKey.get() ?? false);
			callframeListWidget.disabled = !active;
			scriptListWidget.disabled = !active;
			if (!active) {
				callframeListWidget.render([]);
				scriptListWidget.render([]);
			}
		}));
		this.register(this.debugSession.onDidChangePausedState(async (paused) => {
			currentResolveAndDisplaySourceLineOperation?.cancel();
			currentResolveAndDisplaySourceLineOperation = undefined;
			debugPausedContextKey.set(paused);
			debugWidget.updateState(debugActiveContextKey.get() ?? false, paused);
			// TODO(seb) Disable the two lists when not paused, and maybe even "clear" the callstack list, but only
			// after a timeout to not impose new flickering
			if (paused) {
				currentResolveAndDisplaySourceLineOperation = new monaco.CancellationTokenSource();
				const cancellationToken = currentResolveAndDisplaySourceLineOperation.token;
				const { model, line } = await this.debugSession.getModelAndLineByStackframeIndex(0);
				if (!cancellationToken.isCancellationRequested) {
					editor.monacoEditor.setModel(model);
					this.displayCurrentlyDebuggedLine({
						startLineNumber: line,
						endLineNumber: line,
						startColumn: model.getLineFirstNonWhitespaceColumn(line),
						endColumn: model.getLineLastNonWhitespaceColumn(line),
					});
				}

				const callframes = this.debugSession.getCallframes();
				callframeListWidget.render(callframes);
				callframeListWidget.selectedIndex = callframes.length > 0 ? 0 : -1;

				let currentScriptIndex = -1;
				const scriptUris = this.debugSession.getScriptUris();
				scriptListWidget.render(scriptUris);
				for (let i = 0; i < scriptUris.length; i++) {
					if (scriptUris[i].toString() === editor.monacoEditor.getModel()?.uri.toString()) {
						currentScriptIndex = i;
					}
				}
				// TODO(seb) We  need to do the same thing when selecting the callframe to keep this in sync.
				scriptListWidget.selectedIndex = currentScriptIndex;
			} else {
				this.removeDebugLine();
			}
		}));
		this.register(callframeListWidget.onDidSelectItem(async e => {
			if (e.index !== -1) {
				// TODO(seb) Do we need to guard this with a cancellation token too? Probably yes?
				const { model, line } = await this.debugSession.getModelAndLineByStackframeIndex(e.index);
				editor.monacoEditor.setModel(model);
				// TODO(seb) Use different highlighting styles for actual current line where we paused, and lines in other callframes.
				this.displayCurrentlyDebuggedLine({
					startLineNumber: line,
					endLineNumber: line,
					startColumn: model.getLineFirstNonWhitespaceColumn(line),
					endColumn: model.getLineLastNonWhitespaceColumn(line),
				});
			}
		}));
		this.register(scriptListWidget.onDidSelectItem(async e => {
			if (e.item) {
				const model = await this.debugSession.getModelByUri(e.item);
				editor.monacoEditor.setModel(model);
			}
		}));
		this.register(editor.monacoEditor.addAction({
			id: "debugger_start_session",
			label: "Start Debugging",
			keybindings: [monaco.KeyCode.F5],
			precondition: "!debuggerSessionActive",
			run: () => {
				const remoteAddress = debugRemoteAddressInput.getText();
				if (isValidRemoteAddress(remoteAddress)) {
					this.debugSession.connect(new WebsocketTransport(remoteAddress));
				}
			}
		}));
		this.register(editor.monacoEditor.addAction({
			id: "debugger_continue",
			label: "Continue",
			keybindings: [monaco.KeyCode.F5],
			precondition: "debuggerSessionActive && debuggerSessionPaused",
			run: () => this.debugSession.continue(),
		}));
		this.register(editor.monacoEditor.addAction({
			id: "debugger_pause",
			label: "Pause",
			keybindings: [monaco.KeyCode.F6],
			precondition: "debuggerSessionActive && !debuggerSessionPaused",
			run: () => this.debugSession.pause(),
		}));
		this.register(editor.monacoEditor.addAction({
			id: "debugger_step_over",
			label: "Step Over",
			keybindings: [monaco.KeyCode.F10],
			precondition: "debuggerSessionActive && debuggerSessionPaused",
			run: () => this.debugSession.stepOver(),
		}));
		this.register(editor.monacoEditor.addAction({
			id: "debugger_step_into",
			label: "Step Into",
			keybindings: [monaco.KeyCode.F11],
			precondition: "debuggerSessionActive && debuggerSessionPaused",
			run: () => this.debugSession.stepInto(),
		}));
		this.register(editor.monacoEditor.addAction({
			id: "debugger_step_out",
			label: "Step Out",
			keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F11],
			precondition: "debuggerSessionActive && debuggerSessionPaused",
			run: () => this.debugSession.stepOut(),
		}));
		this.register(editor.monacoEditor.addAction({
			id: "debugger_stop_session",
			label: "Stop Debugging",
			keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F5],
			precondition: "debuggerSessionActive",
			run: () => this.debugSession.stop(),
		}));
		this.register(editor.monacoEditor.addAction({
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
		this.editor.monacoEditor.revealRangeInCenterIfOutsideViewport(debugPosition);
	}

	private removeDebugLine(): void {
		this.currentDebugLineDecorations.clear();
	}

	private enableGlyphMargin() {
		const previousGlyphMarginSetting = this.editor.monacoEditor.getOptions().get(monaco.editor.EditorOption.glyphMargin);
		this.register(toDisposable(() => this.editor.monacoEditor.updateOptions({ glyphMargin: previousGlyphMarginSetting })));
		this.editor.monacoEditor.updateOptions({ glyphMargin: true });
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
		line ??= this.editor.monacoEditor.getPosition()?.lineNumber;
		if (line === undefined)
			return;

		const currentBreakpointDecoration = this.getBreakpointDecoration(line);
		if (currentBreakpointDecoration === undefined) {
			this.hideBreakpointPreview();
			this.addBreakpoint(line);
			// TODO(seb) Temp hack into existing code, this needs to be done entirely differently
			this.debugSession.setBreakpoint(this.editor.monacoEditor.getModel()!.uri, line, "add");
		} else {
			this.removeBreakpoint(currentBreakpointDecoration);
			this.debugSession.setBreakpoint(this.editor.monacoEditor.getModel()!.uri, line, "remove");
		}
	}

	private addBreakpoint(line: number): void {
		const model = this.editor.monacoEditor.getModel();
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
		const newDecoration = this.editor.monacoEditor.getLineDecorations(line)!.find(x => x.id === decorationId)!;
		this.breakpointDecorations.set(decorationId, newDecoration);
	}

	private removeBreakpoint(breakpointDecoration: monaco.editor.IModelDecoration): void {
		const model = this.editor.monacoEditor.getModel();
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
		const lineDecorations = this.editor.monacoEditor.getLineDecorations(line);
		return lineDecorations?.find(x => this.breakpointDecorations.has(x.id));
	}

	private getDebugLineDecoration(line: number): monaco.editor.IModelDecoration | undefined {
		const lineDecorations = this.editor.monacoEditor.getLineDecorations(line);
		return lineDecorations?.find(x => this.currentDebugLineDecorations.has(x));
	}
}
