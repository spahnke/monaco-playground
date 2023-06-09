import { toDisposable } from "../../common/disposable.js";
import { JsonSnippetService } from "../../common/json-snippet-service.js";
import { SnippetCompletionProvider } from "../../common/snippet-completion-provider.js";
import { EsLintDiagnostics, IEsLintWorker } from "./eslint-diagnostics.js";

let eslintDiagnostics: EsLintDiagnostics | null = null;

export function registerJavascriptLanguageExtensions(): void {
	monaco.languages.onLanguage("javascript", () => {
		setCompilerOptions(["esnext"]);
		setDiagnosticOptions();
		monaco.languages.typescript.javascriptDefaults.setInlayHintsOptions({
			includeInlayParameterNameHints: "literals",
			includeInlayEnumMemberValueHints: true
		});

		monaco.languages.registerCompletionItemProvider("javascript", new SnippetCompletionProvider(new JsonSnippetService("languages/javascript/snippets.json")));
		eslintDiagnostics = new EsLintDiagnostics("languages/javascript/eslintrc.json");
		monaco.languages.registerCodeActionProvider("javascript", eslintDiagnostics, { providedCodeActionKinds: EsLintDiagnostics.providedCodeActionKinds });
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
		strict: false,
		useDefineForClassFields: true,
	};
	monaco.languages.typescript.typescriptDefaults.setCompilerOptions(options);
	monaco.languages.typescript.javascriptDefaults.setCompilerOptions(options);
}

function setDiagnosticOptions(codesToIgnore?: number[]): void {
	const options: monaco.languages.typescript.DiagnosticsOptions = {
		noSyntaxValidation: false,
		noSemanticValidation: false,
		noSuggestionDiagnostics: false,
		diagnosticCodesToIgnore: codesToIgnore
	};
	monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(options);
	monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(options);
}

export function restartLanguageServer(): void {
	// One way to force a restart without having an API to do that is to change some options.
	// The worker options are the least invasive settings and we just set them to their previous
	// value which is enough to trigger a worker restart.
	monaco.languages.typescript.typescriptDefaults.setWorkerOptions(monaco.languages.typescript.typescriptDefaults.workerOptions);
	monaco.languages.typescript.javascriptDefaults.setWorkerOptions(monaco.languages.typescript.javascriptDefaults.workerOptions);
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

export async function getEsLintWorker(): Promise<IEsLintWorker | null> {
	if (!eslintDiagnostics)
		return null;
	return eslintDiagnostics.eslintWorker;
}

export async function getJavaScriptWorker(model: monaco.editor.ITextModel): Promise<monaco.languages.typescript.TypeScriptWorker | null> {
	if (model.getLanguageId() !== "javascript")
		return null;
	const worker = await monaco.languages.typescript.getJavaScriptWorker();
	return worker(model.uri);
}