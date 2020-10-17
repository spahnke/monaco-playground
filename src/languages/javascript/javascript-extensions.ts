import { noop } from "../../common/disposable.js";
import { JsonSnippetService } from "../../common/json-snippet-service.js";
import { SnippetCompletionProvider } from "../../common/snippet-completion-provider.js";
import { EsLintDiagnostics } from "./eslint-diagnostics.js";

export function registerJavascriptLanguageExtensions() {
	monaco.languages.onLanguage("javascript", () => {
		setCompilerOptions(["esnext"]);
		setDiagnosticOptions();

		monaco.languages.registerCompletionItemProvider("javascript", new SnippetCompletionProvider(new JsonSnippetService("languages/javascript/snippets.json")));
		monaco.languages.registerCodeActionProvider("javascript", new EsLintDiagnostics("languages/javascript/eslintrc.json"));
	});
}

function setCompilerOptions(libs: string[]): void {
	const options: monaco.languages.typescript.CompilerOptions = {
		target: monaco.languages.typescript.ScriptTarget.ESNext,
		lib: libs,
		alwaysStrict: true,
		checkJs: true,
		allowJs: true,
		allowNonTsExtensions: true, // not documented in the typings but important to get syntax/semantic validation working
		strict: localStorage.getItem("monaco-strict") !== null,
	};
	monaco.languages.typescript.typescriptDefaults.setCompilerOptions(options);
	monaco.languages.typescript.javascriptDefaults.setCompilerOptions(options);
}

function setDiagnosticOptions(codesToIgnore?: number[]): void {
	const options: monaco.languages.typescript.DiagnosticsOptions = {
		noSyntaxValidation: false,
		noSemanticValidation: localStorage.getItem("monaco-no-semantic") !== null,
		noSuggestionDiagnostics: localStorage.getItem("monaco-no-suggestion") !== null,
		diagnosticCodesToIgnore: codesToIgnore
	};
	monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(options);
	monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(options);
}

export function allowTopLevelReturn(): monaco.IDisposable {
	const oldCodesToIgnore = monaco.languages.typescript.javascriptDefaults.getDiagnosticsOptions().diagnosticCodesToIgnore;
	setDiagnosticOptions([/*top-level return*/ 1108]);
	return {
		dispose() { setDiagnosticOptions(oldCodesToIgnore); }
	};
}

export function enableJavaScriptBrowserCompletion(): monaco.IDisposable {
	const oldLibs = monaco.languages.typescript.javascriptDefaults.getCompilerOptions().lib;
	// if this is undefined we already have browser completion because we use the standard settings
	if (oldLibs) {
		setCompilerOptions([...oldLibs, "dom"]);
		return {
			dispose() { setCompilerOptions(oldLibs); }
		};
	}
	return noop;
}

export async function getJavaScriptWorker(model: monaco.editor.ITextModel): Promise<monaco.languages.typescript.TypeScriptWorker | null> {
	if (model.getModeId() !== "javascript")
		return null;
	const worker = await monaco.languages.typescript.getJavaScriptWorker();
	return worker(model.uri);
}