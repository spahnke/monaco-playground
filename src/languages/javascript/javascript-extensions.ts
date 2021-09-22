import { toDisposable } from "../../common/disposable.js";
import { JsonSnippetService } from "../../common/json-snippet-service.js";
import { SnippetCompletionProvider } from "../../common/snippet-completion-provider.js";
import { eslintEnabled, semanticDiagnosticsEnabled, strictDiagnosticsEnabled, suggestionDiagnosticsEnabled } from "../../feature-flags.js";
import { EsLintDiagnostics } from "./eslint-diagnostics.js";

export function registerJavascriptLanguageExtensions(): void {
	monaco.languages.onLanguage("javascript", () => {
		setCompilerOptions(["esnext"]);
		setDiagnosticOptions();

		monaco.languages.registerCompletionItemProvider("javascript", new SnippetCompletionProvider(new JsonSnippetService("languages/javascript/snippets.json")));
		if (eslintEnabled)
			monaco.languages.registerCodeActionProvider("javascript", new EsLintDiagnostics("languages/javascript/eslintrc.json"), { providedCodeActionKinds: EsLintDiagnostics.providedCodeActionKinds });
	});
}

function setCompilerOptions(libs?: string[]): void {
	const options: monaco.languages.typescript.CompilerOptions = {
		target: monaco.languages.typescript.ScriptTarget.ESNext,
		lib: libs,
		alwaysStrict: true,
		checkJs: true,
		allowJs: true,
		allowNonTsExtensions: true, // not documented in the typings but important to get syntax/semantic validation working
		strict: strictDiagnosticsEnabled,
	};
	monaco.languages.typescript.typescriptDefaults.setCompilerOptions(options);
	monaco.languages.typescript.javascriptDefaults.setCompilerOptions(options);
}

function setDiagnosticOptions(codesToIgnore?: number[]): void {
	const options: monaco.languages.typescript.DiagnosticsOptions = {
		noSyntaxValidation: false,
		noSemanticValidation: !semanticDiagnosticsEnabled,
		noSuggestionDiagnostics: !suggestionDiagnosticsEnabled,
		diagnosticCodesToIgnore: codesToIgnore
	};
	monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(options);
	monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(options);
}

export function allowTopLevelReturn(): monaco.IDisposable {
	const oldCodesToIgnore = monaco.languages.typescript.javascriptDefaults.getDiagnosticsOptions().diagnosticCodesToIgnore;
	setDiagnosticOptions([...oldCodesToIgnore ?? [], /*top-level return*/ 1108]);
	return toDisposable(() => setDiagnosticOptions(oldCodesToIgnore));
}

export function enableJavaScriptBrowserCompletion(): monaco.IDisposable {
	const oldLibs = monaco.languages.typescript.javascriptDefaults.getCompilerOptions().lib;
	setCompilerOptions([...oldLibs ?? [], "dom"]);
	return toDisposable(() => setCompilerOptions(oldLibs));
}

export async function getJavaScriptWorker(model: monaco.editor.ITextModel): Promise<monaco.languages.typescript.TypeScriptWorker | null> {
	if (model.getModeId() !== "javascript")
		return null;
	const worker = await monaco.languages.typescript.getJavaScriptWorker();
	return worker(model.uri);
}