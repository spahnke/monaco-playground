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

export function addLibrary(library: ILibrary): monaco.IDisposable[] {
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

	return disposables;
}

export function addTemplates(language: string, templates: ITemplate[]): monaco.IDisposable {
	return monaco.languages.registerCompletionItemProvider(language, new SnippetCompletionProvider(new InMemorySnippetService(templates)));
}

export function usuallyProducesCharacter(keyCode: monaco.KeyCode): boolean {
	if (keyCode >= monaco.KeyCode.KEY_0 && keyCode <= monaco.KeyCode.KEY_9) {
		return true;
	}
	if (keyCode >= monaco.KeyCode.NUMPAD_0 && keyCode <= monaco.KeyCode.NUMPAD_9) {
		return true;
	}
	if (keyCode >= monaco.KeyCode.KEY_A && keyCode <= monaco.KeyCode.KEY_Z) {
		return true;
	}
	switch (keyCode) {
		// case monaco.KeyCode.Tab:
		case monaco.KeyCode.Enter:
		case monaco.KeyCode.Space:
		case monaco.KeyCode.Delete:
		case monaco.KeyCode.US_SEMICOLON:
		case monaco.KeyCode.US_EQUAL:
		case monaco.KeyCode.US_COMMA:
		case monaco.KeyCode.US_MINUS:
		case monaco.KeyCode.US_DOT:
		case monaco.KeyCode.US_SLASH:
		case monaco.KeyCode.US_BACKTICK:
		case monaco.KeyCode.US_OPEN_SQUARE_BRACKET:
		case monaco.KeyCode.US_BACKSLASH:
		case monaco.KeyCode.US_CLOSE_SQUARE_BRACKET:
		case monaco.KeyCode.US_QUOTE:
		case monaco.KeyCode.OEM_8:
		case monaco.KeyCode.OEM_102:
			return true;
	}
	return false;
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
export async function isInComment(model: monaco.editor.ITextModel, range: monaco.IRange) {
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

/**
 * CAUTION: Uses an internal API to get a list of all keybindings sorted by command/action name.
 */
export function getKeybindings(editor: monaco.editor.IStandaloneCodeEditor) {
	type Keybinding = { command: string; keybinding?: string, when?: string };

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