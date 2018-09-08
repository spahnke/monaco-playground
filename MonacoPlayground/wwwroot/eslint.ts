import { AsyncWorker } from "./async-worker.js";
import { Linter, LintDiagnostic, LintSeverity } from "./linter.js";

export class EsLint extends AsyncWorker implements Linter {
	private config: any;

	constructor(config: any) {
		super("worker/eslint.js");
		this.config = config;
	}

	async lint(code: string): Promise<LintDiagnostic[]> {
		const result = await this.process({ code, config: this.config });
		const diagnostics: EsLintDiagnostic[] = result.messages;
		return diagnostics.map(this.transformDiagnostic);
	}

	private transformDiagnostic(diagnostic: EsLintDiagnostic): LintDiagnostic {
		return {
			message: diagnostic.message,
			column: diagnostic.column,
			columnEnd: diagnostic.endColumn,
			line: diagnostic.line,
			lineEnd: diagnostic.endLine,
			severity: diagnostic.severity === 2 ? LintSeverity.error : LintSeverity.warning
		};
	}
}

interface EsLintDiagnostic {
	column: number;
	endColumn?: number;
	endLine?: number;
	line: number;
	message: string;
	nodeType: string;
	ruleId: string;
	severity: number;
}