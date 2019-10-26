import { addLibrary, ILibrary } from "../../monaco-helper.js";
import { EsLintDiagnostics } from "./eslint-diagnostics.js";
import { esnext } from "./lib.js";
import { TodoDiagnostics } from "./todo-diagnostics.js";
import { SnippetCompletionProvider } from "../snippet-completion-provider.js";
import { JsonSnippetService } from "../json-snippet-service.js";

export function registerJavascriptLanguageExtensions() {
	monaco.languages.onLanguage("javascript", () => {
		// validation settings
		monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
			noSemanticValidation: false,
			noSyntaxValidation: false,
		});

		// compiler options
		monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
			target: monaco.languages.typescript.ScriptTarget.ESNext,
			lib: [],
			alwaysStrict: true,
			checkJs: true,
			allowJs: true,
			allowNonTsExtensions: true, // not documented in the typings but important to get syntax/semantic validation working
		});

		const libraries: ILibrary[] = [
			{
				contents: `
declare class Facts {
	/**
	 * Returns the next fact
	 *
	 * [Online documentation](http://www.google.de)
	 */
	static next(): string;
}`,
				language: "typescript",
				filePath: "test.d.ts"
			},
			{
				contents: esnext,
				language: "typescript",
				filePath: "lib.esnext.d.ts"
			},
		];

		for (const library of libraries)
			addLibrary(library);

		monaco.languages.registerCompletionItemProvider("javascript", new SnippetCompletionProvider(new JsonSnippetService("dist/languages/javascript/snippets.json")));
		monaco.languages.registerCodeActionProvider("javascript", new EsLintDiagnostics("dist/languages/javascript/eslintrc.json"));
		new TodoDiagnostics(); // has side effects
	});
}

export function doAllowTopLevelReturn(editor: monaco.editor.IStandaloneCodeEditor): monaco.IDisposable {
	// there is not option in TypeScript to allow top level return statements
	// so we listen to changes to decorations and filter the marker list
	// (see https://github.com/Microsoft/monaco-editor/issues/1069)
	return editor.onDidChangeModelDecorations(() => {
		const model = editor.getModel();
		if (model === null || model.getModeId() !== "javascript")
			return;

		const owner = model.getModeId();
		const markers = monaco.editor.getModelMarkers({ owner });
		const filteredMarkers = markers.filter(x => x.message !== "A 'return' statement can only be used within a function body.");
		if (filteredMarkers.length !== markers.length)
			monaco.editor.setModelMarkers(model, owner, filteredMarkers);
	});
}