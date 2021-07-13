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

export function addLibrary(library: ILibrary): monaco.IDisposable {
	const disposables: monaco.IDisposable[] = [];

	const uri = monaco.Uri.file(library.filePath);
	let model = monaco.editor.getModel(uri);
	if (!model) {
		model = monaco.editor.createModel(library.contents, library.language, uri);
		disposables.push(model);
	} else {
		model.setValue(library.contents);
	}

	if (library.filePath.endsWith("d.ts")) {
		const content = model.getValue(); // use value of model to make line endings and whitespace consistent between monaco and TypeScript
		disposables.push(monaco.languages.typescript.javascriptDefaults.addExtraLib(content, uri.toString()));
		disposables.push(monaco.languages.typescript.typescriptDefaults.addExtraLib(content, uri.toString()));
	}

	return {
		dispose: () => disposables.forEach(x => x.dispose())
	};
}

export function addTemplates(language: string, templates: ITemplate[]): monaco.IDisposable {
	return monaco.languages.registerCompletionItemProvider(language, new SnippetCompletionProvider(new InMemorySnippetService(templates)));
}

/** CAUTION: Internal unofficial API */
export const enum EditorOpenContext {

	/**
	 * Default: the editor is opening via a programmatic call
	 * to the editor service API.
	 */
	API,

	/**
	 * Indicates that a user action triggered the opening, e.g.
	 * via mouse or keyboard use.
	 */
	USER
}

/** CAUTION: Internal unofficial API (see IEncodedLineTokens in monaco.d.ts) */
enum StandardTokenType {
	Other = 0,
	Comment = 1,
	String = 2,
	RegEx = 4
}

/** CAUTION: Uses an internal unofficial API to determine if a line is a comment */
export function isComment(model: monaco.editor.ITextModel, line: number): boolean {
	const lineTokens = model.getLineTokens(line);
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

/** CAUTION: Uses an internal unofficial API to determine if the range is in a comment. Tries to wait until tokenization is complete. */
export async function isInComment(model: monaco.editor.ITextModel, range: monaco.IRange): Promise<boolean> {
	if (model.getModeId() === "plaintext")
		return false;

	if (monaco.Range.spansMultipleLines(range))
		throw new Error("Ranges over multiple lines are not supported");

	while (model._tokenization._tokenizationSupport === null) {
		// tokenization of model not completed if _tokenizationSupport is null -> delay (this is a heuristic and may not be 100% accurate)
		await delay(500);
	}

	const line = range.startLineNumber;
	const lineTokens = model.getLineTokens(line);
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
 * CAUTION: Uses an internal API.
 */
export function patchKeybinding(editor: monaco.editor.IStandaloneCodeEditor, id: string, newKeyBinding?: number, when?: monaco.platform.IContextKeyExpr): void {
	// remove existing one; no official API yet
	// the '-' before the commandId removes the binding
	// as of >=0.21.0 we need to supply a dummy command handler to not get errors (because of the fix for https://github.com/microsoft/monaco-editor/issues/1857)
	editor._standaloneKeybindingService.addDynamicKeybinding(`-${id}`, undefined, () => { });
	if (newKeyBinding) {
		const action = editor.getAction(id);
		editor._standaloneKeybindingService.addDynamicKeybinding(id, newKeyBinding, () => action.run(), when);
	}
}

function delay(ms: number): Promise<void> {
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