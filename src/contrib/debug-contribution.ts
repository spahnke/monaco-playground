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

interface IListElementRenderer<TElement, TTemplate> {
	createTemplate(container: HTMLElement): TTemplate;
	getAriaLabel?(element: TElement, index: number): string;
	renderElement(element: TElement, index: number, template: TTemplate): void;
	disposeTemplate(template: TTemplate): void;
}

interface AccessibilityOptions {
	ariaLabel?: string;
	ariaLabelledBy?: Element | null;
	ariaRole?: string;
	ariaItemRole?: string;
}

class ListWidget<T> extends Disposable {
	// For accessibility and behavioral (e.g. keyboard interaction) requirements see
	// https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/listbox_role

	readonly listElement: HTMLElement;
	private readonly templates: unknown[] = [];
	private readonly onDidFocusItemEmitter = this.register(new monaco.Emitter<{ index: number; item: T | undefined; }>());
	private readonly onDidSelectItemEmitter = this.register(new monaco.Emitter<{ index: number; item: T | undefined; }>());
	private readonly onClickEmitter = this.register(new monaco.Emitter<PointerEvent>());
	private readonly onKeyDownEmitter = this.register(new monaco.Emitter<KeyboardEvent>());
	private domEvents: monaco.IDisposable;
	/** Never set this outside of focus(index). */
	private focused = -1;
	/** Never set this outside of select(index). */
	private selected = -1;

	constructor(container: HTMLElement, private renderer: IListElementRenderer<T, unknown>, readonly options?: AccessibilityOptions) {
		super();
		this.listElement = document.createElement("div");
		this.listElement.tabIndex = 0;
		this.listElement.role = options?.ariaRole ?? "listbox";
		if (options?.ariaLabelledBy) {
			this.listElement.ariaLabelledByElements = [options.ariaLabelledBy];
		} else {
			this.listElement.ariaLabel = options?.ariaLabel ?? "Listview";
		}
		this.listElement.classList.add("list-widget");
		container.appendChild(this.listElement);
		this.register(toDisposable(() => this.listElement.remove()));
		this.domEvents = this.registerEvents();
	}

	get disabled(): boolean {
		return this.listElement.ariaDisabled === "true";
	}

	set disabled(value: boolean) {
		this.listElement.tabIndex = value ? -1 : 0;
		this.listElement.ariaDisabled = value ? "true" : "false";
		if (value) {
			this.domEvents.dispose();
		} else {
			this.domEvents = this.registerEvents();
		}
	}

	get focusedIndex(): number {
		return this.focused;
	}

	focus(index: number): void {
		const focusedElement = this.listElement.children[this.focused];
		if (focusedElement) {
			this.listElement.ariaActiveDescendantElement = null;
			focusedElement.classList.remove("focused");
		}
		if (index >= 0 && index < this.listElement.children.length) {
			const listItemElement = this.listElement.children[index] as HTMLElement;
			this.listElement.ariaActiveDescendantElement = listItemElement;
			listItemElement.classList.add("focused");
			listItemElement.scrollIntoView({ block: "nearest" });
			this.focused = index;
			if (!this.disabled) {
				this.onDidFocusItemEmitter.fire({ index, item: this.items[index] });
			}
		} else {
			this.focused = -1;
		}
	}

	readonly items: T[] = [];
	readonly onDidFocusItem = this.onDidFocusItemEmitter.event;
	readonly onDidSelectItem = this.onDidSelectItemEmitter.event;
	readonly onClick = this.onClickEmitter.event;
	readonly onKeyDown = this.onKeyDownEmitter.event;

	get selectedIndex(): number {
		return this.selected;
	}

	select(index: number): void {
		const selectedElement = this.listElement.children[this.selected];
		if (selectedElement) {
			selectedElement.ariaSelected = null;
		}
		if (index >= 0 && index < this.listElement.children.length) {
			const listItemElement = this.listElement.children[index] as HTMLElement;
			listItemElement.ariaSelected = "true";
			this.selected = index;
			if (!this.disabled) {
				this.onDidSelectItemEmitter.fire({ index, item: this.items[index] });
			}
		} else {
			this.selected = -1;
		}
	}

	splice(start: number, deleteCount: number, items: T[] = []): void {
		// TODO(seb) This is the easy implementation where we rerender everything. Can we write it in a more efficient
		// way that only changes the items that need to be changed?
		this.items.splice(start, deleteCount, ...items);
		while (this.listElement.children.length < this.items.length) {
			this.createListItem();
		}
		for (let i = 0; i < this.items.length; i++) {
			const listItemElement = this.listElement.children[i] as HTMLElement;
			const template = this.templates[i];
			listItemElement.style.display = "";
			if (this.renderer.getAriaLabel) {
				listItemElement.ariaLabel = this.renderer.getAriaLabel(this.items[i], i);
			}
			this.renderer.renderElement(this.items[i], i, template);
		}
		for (let i = this.items.length; i < this.listElement.children.length; i++) {
			const listItemElement = this.listElement.children[i] as HTMLElement;
			listItemElement.style.display = "none";
			listItemElement.ariaLabel = null;
		}
		// TODO(seb) Adjust selected and current index accordingly when they fall out of bounds, or, in the case of a
		// tree, were inside a now collapsed element.
	}

	override dispose(): void {
		this.domEvents.dispose();
		super.dispose();
	}

	private createListItem(): void {
		const listItemElement = document.createElement("div");
		listItemElement.role = this.options?.ariaItemRole ?? "option";
		listItemElement.classList.add("list-widget-item");
		listItemElement.dataset.index = String(this.listElement.childElementCount);
		const template = this.renderer.createTemplate(listItemElement);
		this.templates.push(template);
		this.listElement.appendChild(listItemElement);
		console.assert(this.templates.length === this.listElement.childElementCount);
	}

	private registerEvents(): monaco.IDisposable {
		const focusEvent = (e: FocusEvent) => {
			if (this.focused === -1 && this.listElement.children.length > 0) {
				// If nothing is focused yet focus the currently selected element if one exists, otherwise focus the
				// first element.
				this.focus(this.selected !== -1 ? this.selected : 0);
			} else {
				this.focus(this.focused);
			}
		};
		const clickEvent = (e: PointerEvent) => {
			let listItemElement: HTMLElement | undefined;
			let target = e.target as HTMLElement | null;
			while (target && target !== this.listElement) {
				if (target.classList.contains("list-widget-item")) {
					listItemElement = target as HTMLElement;
					break;
				}
				target = target.parentElement;
			}
			if (listItemElement) {
				console.assert(listItemElement.classList.contains("list-widget-item"));
				const index = Number(listItemElement.dataset.index);
				this.select(index);
				this.focus(index);
			}
			this.onClickEmitter.fire(e);
		};
		const keyboardEvent = (e: KeyboardEvent) => {
			switch (e.code) {
				case "Space":
				case "Enter": {
					this.select(this.focused);
					e.preventDefault();
				} break;
				case "ArrowUp": {
					this.focus(Math.max(0, this.focused - 1));
					e.preventDefault();
				} break;
				case "ArrowDown": {
					this.focus(Math.min(this.focused + 1, this.listElement.children.length - 1));
					e.preventDefault();
				} break;
				case "Home": {
					this.focus(0);
					e.preventDefault();
				} break;
				case "End": {
					this.focus(this.listElement.children.length - 1);
					e.preventDefault();
				} break;
			}
			this.onKeyDownEmitter.fire(e);
		};
		this.listElement.addEventListener("focus", focusEvent);
		this.listElement.addEventListener("click", clickEvent);
		this.listElement.addEventListener("keydown", keyboardEvent);
		return toDisposable(() => {
			this.listElement.removeEventListener("focus", focusEvent);
			this.listElement.removeEventListener("click", clickEvent);
			this.listElement.removeEventListener("keydown", keyboardEvent);
		});
	}
}

interface TreeNode<T> {
	level: number;
	open: boolean;
	data: T;
	children: TreeNode<T>[];
}

interface TreeNodeTemplate {
	listElement: HTMLElement;
	span: HTMLSpanElement;
	chevron: HTMLSpanElement;
	innerTemplate: unknown;
}

class TreeWidget<T> extends Disposable {
	// For accessibility and behavioral (e.g. keyboard interaction) requirements see
	// https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/tree_role

	private readonly listWidget: ListWidget<TreeNode<T>>;
	private readonly onDidExpandItemEmitter = this.register(new monaco.Emitter<TreeNode<T> | undefined>());

	constructor(container: HTMLElement, renderer: IListElementRenderer<T, unknown>, options?: AccessibilityOptions) {
		super();
		this.listWidget = this.register(new ListWidget(container, new class implements IListElementRenderer<TreeNode<T>, TreeNodeTemplate> {
			createTemplate(container: HTMLElement): TreeNodeTemplate {
				const span = document.createElement("span");
				span.classList.add("tree-widget-node");
				container.appendChild(span);
				const chevron = document.createElement("span");
				chevron.classList.add("codicon");
				chevron.ariaHidden = "true";
				span.appendChild(chevron);
				const innerTemplate = renderer.createTemplate(span);
				return { listElement: container, span, chevron, innerTemplate };
			}

			getAriaLabel = !renderer.getAriaLabel ? undefined : (element: TreeNode<T>, index: number): string => {
				return renderer.getAriaLabel!(element.data, index);
			};

			renderElement(element: TreeNode<T>, index: number, template: TreeNodeTemplate): void {
				renderer.renderElement(element.data, index, template.innerTemplate);
				template.listElement.ariaExpanded = null;
				template.listElement.ariaLevel = String(element.level + 1);
				template.span.style.marginLeft = `${element.level * 1}rem`;
				template.chevron.classList.remove("codicon-chevron-right", "codicon-chevron-down");
				if (element.children.length > 0) {
					template.listElement.ariaExpanded = element.open ? "true" : "false";
					template.chevron.classList.add(element.open ? "codicon-chevron-down" : "codicon-chevron-right");
				}
			}

			disposeTemplate(template: TreeNodeTemplate): void {
				renderer.disposeTemplate(template.innerTemplate);
				template.span.remove();
			}
		}, {
			ariaLabel: "Treeview",
			ariaRole: "tree",
			ariaItemRole: "treeitem",
			...options,
		}));
		this.register(this.listWidget.onClick(e => {
			const treeNode = this.listWidget.items[this.listWidget.focusedIndex];
			if (treeNode && treeNode.children.length > 0) {
				if (treeNode.open) {
					this.collapseNode(treeNode, this.listWidget.focusedIndex);
				} else {
					this.expandNode(treeNode, this.listWidget.focusedIndex);
				}
			}
		}));
		this.register(this.listWidget.onKeyDown(e => {
			switch (e.code) {
				case "Enter": {
					const treeNode = this.listWidget.items[this.listWidget.focusedIndex];
					if (treeNode && treeNode.children.length > 0) {
						if (treeNode.open) {
							this.collapseNode(treeNode, this.listWidget.focusedIndex);
						} else {
							this.expandNode(treeNode, this.listWidget.focusedIndex);
						}
					}
					e.preventDefault();
				} break;
				case "ArrowLeft": {
					const treeNode = this.listWidget.items[this.listWidget.focusedIndex];
					if (treeNode) {
						if (treeNode.children.length > 0 && treeNode.open) {
							// When focus is on an open node, closes the node.
							this.collapseNode(treeNode, this.listWidget.focusedIndex);
						} else {
							// When focus is on a child node that is also either an end node or a closed node, moves focus to its parent node.
							const focusedListItemElement = this.listWidget.listElement.children[this.listWidget.focusedIndex];
							console.assert(Boolean(focusedListItemElement), "Couldn't find the list item of a focused index");
							let parent = focusedListItemElement as HTMLElement | null;
							while (parent && Number(parent.ariaLevel) >= Number(focusedListItemElement.ariaLevel)) {
								parent = parent.previousElementSibling as HTMLElement | null;
							}
							if (parent) {
								this.listWidget.focus(Number(parent.dataset.index));
							}
							// When focus is on a closed tree, does nothing.
						}
					}
					e.preventDefault();
				} break;
				case "ArrowRight": {
					const treeNode = this.listWidget.items[this.listWidget.focusedIndex];
					if (treeNode) {
						if (treeNode.children.length > 0) {
							if (!treeNode.open) {
								// When focus is on a closed node, opens the node; focus does not move.
								this.expandNode(treeNode, this.listWidget.focusedIndex);
							} else {
								// When focus is on an open node, moves focus to the first child node.
								this.listWidget.focus(this.listWidget.focusedIndex + 1);
							}
						}
						// When focus is on an end node (a tree item with no children), does nothing.
					}
					e.preventDefault();
				} break;
			}
		}));
	}

	get disabled(): boolean { return this.listWidget.disabled; }
	set disabled(value: boolean) { this.listWidget.disabled = value; }

	readonly onDidExpandItem = this.onDidExpandItemEmitter.event;
	get onDidFocusItem() { return this.listWidget.onDidFocusItem; }
	get onDidSelectItem() { return this.listWidget.onDidSelectItem; }

	render(root: TreeNode<T> | undefined): void {
		this.listWidget.splice(0, this.listWidget.items.length, this.getSubtreeListNodes(root));
	}

	private collapseNode(node: TreeNode<T>, index: number): void {
		if (node.children.length > 0 && node.open) {
			const subtreeList = this.getSubtreeListNodes(node);
			node.open = false;
			this.listWidget.splice(index, subtreeList.length, [node]);
		}
	}

	private expandNode(node: TreeNode<T>, index: number): void {
		if (node.children.length > 0 && !node.open) {
			node.open = true;
			const subtreeList = this.getSubtreeListNodes(node);
			this.listWidget.splice(index, 1, subtreeList);
			this.onDidExpandItemEmitter.fire(node);
		}
	}

	/** Returns a flat list of all nodes in the subtree including the passed `node`. */
	private getSubtreeListNodes(node: TreeNode<T> | undefined): TreeNode<T>[] {
		const list: TreeNode<T>[] = [];
		if (node) {
			const stack: TreeNode<T>[] = [node];
			while (stack.length > 0) {
				const currentNode = stack.pop()!;
				list.push(currentNode);
				if (currentNode.children.length > 0 && currentNode.open) {
					for (let i = currentNode.children.length - 1; i >= 0; i--) {
						stack.push(currentNode.children[i]);
					}
				}
			}
		}
		return list;
	}
}

class CallframeRenderer implements IListElementRenderer<string, HTMLSpanElement> {
	createTemplate(container: HTMLElement): HTMLSpanElement {
		const span = document.createElement("span");
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

class VariableRenderer implements IListElementRenderer<string, HTMLSpanElement> {
	createTemplate(container: HTMLElement): HTMLSpanElement {
		const span = document.createElement("span");
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

	constructor(private readonly editor: CodeEditor, debugRemoteAddressInput: CodeEditorTextInput, callframeListContainer: HTMLElement, variableTreeContainer: HTMLElement, scriptListContainer: HTMLElement) {
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

		const callframeListWidget = new ListWidget<string>(callframeListContainer, new CallframeRenderer(), { ariaLabelledBy: callframeListContainer.firstElementChild });
		const variableTreeWidget = new TreeWidget<string>(variableTreeContainer, new VariableRenderer(), { ariaLabelledBy: variableTreeContainer.firstElementChild });
		const scriptListWidget = new ListWidget<monaco.Uri>(scriptListContainer, new ScriptRenderer(), { ariaLabelledBy: scriptListContainer.firstElementChild });

		callframeListWidget.disabled = true;
		scriptListWidget.disabled = true;
		variableTreeWidget.render({
			level: 0,
			open: true,
			data: "root",
			children: [
				{
					level: 1,
					open: false,
					data: "child1",
					children: [],
				},
				{
					level: 1,
					open: true,
					data: "child2",
					children: [
						{
							level: 2,
							open: false,
							data: "child1",
							children: [],
						},
						{
							level: 2,
							open: false,
							data: "child2",
							children: [],
						},
						{
							level: 2,
							open: false,
							data: "child3",
							children: [
								{
									level: 3,
									open: true,
									data: "child1",
									children: [
										{
											level: 4,
											open: false,
											data: "child1",
											children: [],
										},
										{
											level: 4,
											open: false,
											data: "child2 with a very long name that most certainly is wider than the tree widget",
											children: [],
										},
										{
											level: 4,
											open: false,
											data: "child3",
											children: [],
										},
									],
								},
								{
									level: 3,
									open: false,
									data: "child2",
									children: [],
								},
								{
									level: 3,
									open: false,
									data: "child3",
									children: [],
								},
							],
						},
					],
				},
				{
					level: 1,
					open: false,
					data: "child3",
					children: [],
				},
			],
		});

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
				callframeListWidget.splice(0, callframeListWidget.items.length);
				scriptListWidget.splice(0, scriptListWidget.items.length);
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
				callframeListWidget.splice(0, callframeListWidget.items.length, callframes);
				callframeListWidget.select(callframes.length > 0 ? 0 : -1);
				callframeListWidget.focus(callframes.length > 0 ? 0 : -1);

				let currentScriptIndex = -1;
				const scriptUris = this.debugSession.getScriptUris();
				scriptListWidget.splice(0, scriptListWidget.items.length, scriptUris);
				for (let i = 0; i < scriptUris.length; i++) {
					if (scriptUris[i].toString() === editor.monacoEditor.getModel()?.uri.toString()) {
						currentScriptIndex = i;
					}
				}
				// TODO(seb) We  need to do the same thing when selecting the callframe to keep this in sync.
				scriptListWidget.select(currentScriptIndex);
				scriptListWidget.focus(currentScriptIndex);
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
