import { Disposable } from "./disposable.js";
import { ISnippetService, Snippet, SnippetCompletionProvider } from "./snippet-completion-provider.js";

export interface ILibrary {
	contents: string;
	language: string;
	filePath: string;
}

export interface ITemplate {
	prefix: string;
	name: string;
	description: string;
	templateText: string;
	sortText?: string;
}

const canceledName = "Canceled";

function isPromiseCanceledError(error: unknown): boolean {
	return error instanceof Error && error.name === canceledName && error.message === canceledName;
}

export function registerPromiseCanceledErrorHandler(): void {
	window.addEventListener("unhandledrejection", event => {
		if (isPromiseCanceledError(event.reason))
			event.preventDefault();
	});
}

export function addLibrary(library: ILibrary): monaco.IDisposable {
	const disposable = new Disposable();

	const uri = monaco.Uri.file(library.filePath);
	let model = monaco.editor.getModel(uri);
	if (!model) {
		model = monaco.editor.createModel(library.contents, library.language, uri);
		disposable.register(model);
	} else {
		model.setValue(library.contents);
	}

	if (library.filePath.endsWith("d.ts")) {
		const content = model.getValue(); // use value of model to make line endings and whitespace consistent between monaco and TypeScript
		disposable.register(monaco.languages.typescript.javascriptDefaults.addExtraLib(content, uri.toString()));
		disposable.register(monaco.languages.typescript.typescriptDefaults.addExtraLib(content, uri.toString()));
	}

	return disposable;
}

export function addTemplates(language: string, templates: ITemplate[]): monaco.IDisposable {
	return monaco.languages.registerCompletionItemProvider(language, new SnippetCompletionProvider(new InMemorySnippetService(templates)));
}

let languageAliasToIdMap: Map<string, string> | undefined;

/**
 * Returns the Monaco language ID of the language with ID, alias, or extension `language`. If none is found `plaintext` is returned.
 */
export function getLanguageId(language: string): string {
	if (languageAliasToIdMap === undefined) {
		languageAliasToIdMap = new Map();
		for (const language of monaco.languages.getLanguages()) {
			const knownAliases = new Set<string>();
			knownAliases.add(language.id);
			if (language.aliases) {
				for (const alias of language.aliases)
					knownAliases.add(alias);
			}
			if (language.extensions) {
				for (const extension of language.extensions)
					knownAliases.add(extension.substring(1)); // remove '.' from extension
			}

			for (const knownAlias of knownAliases) {
				if (languageAliasToIdMap.has(knownAlias)) {
					console.warn(`Language alias '${knownAlias}' already registered for language '${languageAliasToIdMap.get(knownAlias)}'. The alias was not registered for '${language.id}' as this would have overwritten the existing one.`);
					continue;
				}
				languageAliasToIdMap.set(knownAlias, language.id);
			}
		}
	}
	return languageAliasToIdMap.get(language) ?? "plaintext";
}

let languageIdToDisplayNameMap: Map<string, string> | undefined;

/**
 * Returns the display name of a given Monaco `languageId`.
 */
export function getLanguageDisplayName(languageId: string): string {
	if (languageIdToDisplayNameMap === undefined) {
		languageIdToDisplayNameMap = new Map();
		for (const language of monaco.languages.getLanguages()) {
			// by Monaco convention, the first alias of a language is the display language
			const displayLanguage = language.aliases?.[0] ?? language.id;
			languageIdToDisplayNameMap.set(language.id, displayLanguage);
		}
	}
	return languageIdToDisplayNameMap.get(languageId) ?? languageId;
}

/** CAUTION: Internal unofficial API (see tokenisationTextModelPart.ts in vscode) */
const enum BackgroundTokenizationState {
	Uninitialized = 0,
	InProgress = 1,
	Completed = 2,
}

/** CAUTION: Internal unofficial API (see IEncodedLineTokens in monaco.d.ts) */
enum StandardTokenType {
	Other = 0,
	Comment = 1,
	String = 2,
	RegEx = 4
}

export async function waitForTokenization(model: monaco.editor.ITextModel): Promise<void> {
	while (model.tokenization.backgroundTokenizationState !== BackgroundTokenizationState.Completed)
		await delay(500);
}

/** CAUTION: Uses an internal unofficial API to determine if a line is a comment */
export function isComment(model: monaco.editor.ITextModel, line: number): boolean {
	if (model.getLanguageId() === "plaintext")
		return false;

	const lineTokens = model.tokenization.getLineTokens(line);
	const tokenCount = lineTokens.getCount();
	// a commented line either only has one token (the comment) or begins with whitespace followed by a comment, i.e. has at most 2 tokens
	if (tokenCount === 1 && lineTokens.getStandardTokenType(0) === StandardTokenType.Comment)
		return true;
	if (tokenCount === 2 && lineTokens.getStandardTokenType(0) === StandardTokenType.Other && lineTokens.getStandardTokenType(1) === StandardTokenType.Comment) {
		const firstTokenContent = lineTokens.getLineContent().slice(lineTokens.getStartOffset(0), lineTokens.getEndOffset(0));
		if (firstTokenContent.trim() === "")
			return true; // the first token is whitespace
	}
	return false;
}

/** CAUTION: Uses an internal unofficial API to determine if the range is in a comment.*/
export function isInComment(model: monaco.editor.ITextModel, range: monaco.IRange): boolean {
	if (model.getLanguageId() === "plaintext")
		return false;

	if (monaco.Range.spansMultipleLines(range))
		throw new Error("Ranges over multiple lines are not supported");

	const line = range.startLineNumber;
	const lineTokens = model.tokenization.getLineTokens(line);
	let tokenType = StandardTokenType.Other;
	for (let i = 0; i < lineTokens.getCount(); i++) {
		const tokenRange: monaco.IRange = { startLineNumber: line, startColumn: lineTokens.getStartOffset(i) + 1, endLineNumber: line, endColumn: lineTokens.getEndOffset(i) + 1 };
		if (monaco.Range.containsRange(tokenRange, range)) {
			tokenType = lineTokens.getStandardTokenType(i);
			break;
		}
	}
	return tokenType === StandardTokenType.Comment;
}

type Keybinding = { command: string; keybinding?: string, when?: string; };

/**
 * CAUTION: Uses an internal API to get a list of all keybindings sorted by command/action name.
 */
export function getKeybindings(editor: monaco.editor.IStandaloneCodeEditor): Keybinding[] {

	const keybindings = editor._standaloneKeybindingService._getResolver()._keybindings.map(x => (<Keybinding>{
		command: x.command,
		keybinding: x.resolvedKeybinding.getAriaLabel(),
		when: x.when?.serialize()
	}));

	// add actions without default keybinding
	for (const action of Object.values(editor._actions)) {
		if (keybindings.some(x => x.command === action.id))
			continue;
		keybindings.push({
			command: action.id,
			when: action._precondition?.serialize()
		});
	}

	return keybindings.sort((a, z) => a.command.localeCompare(z.command));
}

/**
 * Patches existing keybindings, i.e. remove problematic ones, and add/change default ones.
 */
export function patchKeybindings(): monaco.IDisposable {
	const disposable = new Disposable();
	disposable.register(patchKeybinding("editor.action.addSelectionToNextFindMatch", monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.Period, "editorFocus")); // default is Ctrl+D
	disposable.register(patchKeybinding("editor.action.fontZoomIn", monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal)); // no default
	disposable.register(patchKeybinding("editor.action.fontZoomOut", monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus)); // no default
	disposable.register(patchKeybinding("editor.action.fontZoomReset", monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0)); // no default
	disposable.register(patchKeybinding("editor.action.marker.nextInFiles")); // default F8 (jumps between files/models which is not desirable)
	disposable.register(patchKeybinding("editor.action.marker.prevInFiles")); // default Shift+F8 (jumps between files/models which is not desirable)
	disposable.register(patchKeybinding("editor.action.autoFix", monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.Enter, "editorTextFocus && !editorReadonly && supportedCodeAction =~ /(\\s|^)quickfix\\b/")); // default is Shift+Alt+.
	disposable.register(patchKeybinding("editor.action.quickFix", monaco.KeyMod.Alt | monaco.KeyCode.Enter, "editorHasCodeActionsProvider && editorTextFocus && !editorReadonly")); // default is Ctrl+.
	disposable.register(patchKeybinding("editor.action.quickOutline", monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO, "editorFocus && editorHasDocumentSymbolProvider")); // default is Ctrl+Shift+O
	disposable.register(patchKeybinding("editor.action.rename", monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR), "editorHasRenameProvider && editorTextFocus && !editorReadonly")); // default is F2
	return disposable;
}

/**
 * Patches a keybinding of an existing action with ID `id` by removing the existing one, and optionally adding a `newKeybinding` with (optional) `when` clause.
 *
 * If you change an existing keybinding to a new one you should set the original `when` clause of the action. This can be found by dumping all keybindings using
 * `getKeybindings()`.
 */
export function patchKeybinding(id: string, newKeybinding?: number, when?: string): monaco.IDisposable {
	// remove existing one; keybinding by prefixing the command id with '-'
	const undoRemoveKeybinding = monaco.editor.addKeybindingRule({ command: `-${id}`, keybinding: 0 });
	let undoPatchKeybinding: monaco.IDisposable | undefined;
	if (newKeybinding)
		undoPatchKeybinding = monaco.editor.addKeybindingRule({ command: id, keybinding: newKeybinding, when });

	// register undo operations in reverse order
	const disposable = new Disposable();
	if (undoPatchKeybinding)
		disposable.register(undoPatchKeybinding);
	disposable.register(undoRemoveKeybinding);
	return disposable;
}

export function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

class InMemorySnippetService implements ISnippetService {
	constructor(private readonly templates: ITemplate[]) {
	}

	async getSnippets(): Promise<Snippet[]> {
		return this.templates.map(this.asSnippet);
	}

	private asSnippet(template: ITemplate): Snippet {
		return new Snippet(template.name, template.prefix, template.templateText, template.description, template.name, template.prefix, template.sortText);
	}
}