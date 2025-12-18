import { createConnection, BrowserMessageReader, BrowserMessageWriter, TextDocuments, DocumentDiagnosticReportKind, DiagnosticSeverity, Diagnostic, DiagnosticTag, Range, CodeDescription } from "vscode-languageserver/browser.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Linter, Rule } from "eslint";

declare const eslint: {
	Linter: typeof import("eslint").Linter;
};

type EsLintConfig = Linter.Config & {
	/**
	 * Optional paths to additional rule files, either absolute webserver paths, or relative to the worker directory.
	 * - The filename without the extension is the rule ID
	 * - The rule must be compiled as a standalone ES module
	 * - The rule object must be the default export of the module
	 */
	ruleFiles?: string[];
};

type ExtendedRuleLevel = Linter.RuleSeverity | "info" | "hint";

let eslintExtendedConfig: EsLintConfig;
let eslintCompatConfig: EsLintConfig;
let linter: Linter;

const connection = createConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self));
connection.onInitialize(async (params) => {
	// TODO(seb) Do we need to handle errors explicitly using `ResponseError` class? Seems like these event handlers
	// already have exception handling built in?
	eslintExtendedConfig = await fetch("/languages/javascript/eslintrc.json").then(r => r.json());
	// NOTE Using a variable a) avoid TS errors because this module only exists at runtime and b) to prevent any
	// bundler from trying to inline import the file here.
	const eslintScript = "./eslint.js";
	await import(eslintScript);
	linter = new eslint.Linter();
	eslintCompatConfig = await createEsLintCompatibleConfig(eslintExtendedConfig);

	return {
		capabilities: {
			diagnosticProvider: {
				identifier: "eslint",
				interFileDependencies: false,
				workspaceDiagnostics: false,
			}
		},
	};
});

connection.languages.diagnostics.on(params => {
	const textDocument = documents.get(params.textDocument.uri);
	return {
		kind: DocumentDiagnosticReportKind.Full,
		items: computeDiagnostics(textDocument),
	};
});

const documents = new TextDocuments(TextDocument);
documents.listen(connection);
connection.listen();

connection.sendNotification("foo", "bar");

function computeDiagnostics(document: TextDocument | undefined): Diagnostic[] {
	if (document?.languageId !== "javascript") {
		return [];
	}

	const diagnostics: Diagnostic[] = [];
	const lintMessages = linter.verify(document.getText(), eslintCompatConfig);
	for (const lintMessage of lintMessages) {
		diagnostics.push({
			message: lintMessage.message,
			range: toRange(lintMessage),
			source: "eslint",
			severity: toSeverity(lintMessage),
			code: lintMessage.ruleId ?? undefined,
			codeDescription: toCodeDescription(lintMessage), // Congrats this isn't supported by the monaco LSP client yet...
			tags: lintMessage.ruleId === "no-unused-vars" ? [DiagnosticTag.Unnecessary] : []
		});
	}
	return diagnostics;
}

function toRange(lintMessage: Linter.LintMessage): Range {
	return {
		start: {
			line: lintMessage.line - 1,
			character: lintMessage.column - 1,
		},
		end: {
			line: (lintMessage.endLine ?? lintMessage.line) - 1,
			character: (lintMessage.endColumn ?? lintMessage.column) - 1,
		}
	};
}

function toSeverity(diagnostic: Linter.LintMessage): DiagnosticSeverity {
	if (diagnostic.severity === 2)
		return DiagnosticSeverity.Error;
	if (diagnostic.severity === 1 && isInfoOrHint(eslintExtendedConfig, diagnostic, "info"))
		return DiagnosticSeverity.Information;
	if (diagnostic.severity === 1 && isInfoOrHint(eslintExtendedConfig, diagnostic, "hint"))
		return DiagnosticSeverity.Hint;
	return DiagnosticSeverity.Warning;
}

function toCodeDescription(diagnostic: Linter.LintMessage): CodeDescription | undefined {
	if (!diagnostic.ruleId)
		return undefined;
	// Since the change to the new config format ("flat config") we can't get the rule metadata through the linter
	// API anymore, meaning we have to revert back to using a heuristic. The flat config has the advantage that rule
	// IDs of custom rules/rules provided by plugins are of the form "<custom name>/<rule name>" now. This means
	// every rule ID that doesn't contain a "/" has to be a built-in rule that we can point to the official ESLint
	// documentation. Furthermore, the documentation URL ends in the exact rule ID we get from the diagnostic.
	if (diagnostic.ruleId.includes("/"))
		return undefined;
	return { href: `https://eslint.org/docs/latest/rules/${diagnostic.ruleId}` };
}

/**
 * Creates a new config where all "info" and "hint" level severities are replaced by "warn".
 */
async function createEsLintCompatibleConfig(config: EsLintConfig): Promise<EsLintConfig> {
	// For now we keep the ".eslintrc" JSON format for our ESLint config since it is structurally equivalent to the
	// new config format ("flat config"), at least for our purposes. This way we keep the advantage of autocomplete
	// using the JSON schema. Should the Config have better (and easy to setup) autocomplete in the future we may
	// switch. Loading configs in JS format in the worker may prove difficult though.
	const compatConfig = structuredClone(config ?? {});
	// @ts-expect-error the $schema property is part of the JSON definition and has to be deleted in order to pass validation
	delete compatConfig.$schema;
	for (const ruleId in compatConfig.rules) {
		const rule = compatConfig.rules[ruleId];
		if (rule === undefined)
			continue;
		if (Array.isArray(rule) && ((rule[0] as ExtendedRuleLevel) === "info" || (rule[0] as ExtendedRuleLevel) === "hint"))
			rule[0] = "warn";
		if ((rule as ExtendedRuleLevel) === "info" || (rule as ExtendedRuleLevel) === "hint")
			compatConfig.rules[ruleId] = "warn";
	}

	await loadRules(compatConfig);
	delete compatConfig.ruleFiles;

	return compatConfig;
}

/**
 * Checks if a normally "warn" level diagnostic is really an "info" or "hint" level diagnostic.
 */
function isInfoOrHint(config: EsLintConfig, diagnostic: Linter.LintMessage, severity: "info" | "hint"): boolean {
	if (diagnostic.severity !== 1 || diagnostic.ruleId === null)
		return false;
	const rule = config.rules?.[diagnostic.ruleId];
	if (rule === undefined)
		return false;
	if (Array.isArray(rule))
		return (rule[0] as ExtendedRuleLevel) === severity;
	return (rule as ExtendedRuleLevel) === severity;
}

async function loadRules(config: EsLintConfig) {
	if (config.ruleFiles === undefined)
		return;
	if (!Array.isArray(config.ruleFiles)) {
		console.warn(`[ESLint] Config element 'ruleFiles' is not an array. No additional rules loaded.`);
		return;
	}

	if (config.ruleFiles.length > 0) {
		config.plugins ??= {};
		config.plugins.local ??= {};
		config.plugins.local.rules ??= {};
	}

	for (const ruleFile of config.ruleFiles) {
		try {
			const id = /(?<id>[a-z0-9\-_]+)\.js$/i.exec(ruleFile)?.groups?.["id"];
			if (id === undefined)
				throw new Error("Could not extract rule ID from file name.");

			const rule: Rule.RuleModule = (await import(ruleFile)).default;
			if (typeof rule.create !== "function")
				throw new Error(`The rule '${id}' does not define a 'create' method.`);

			config.plugins!.local.rules![id] = rule;
		} catch (e: any) {
			console.warn(`[ESLint] Could not load additional rule module '${ruleFile}': ${e.message}`);
		}
	}
}