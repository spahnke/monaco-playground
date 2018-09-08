import { AsyncWorker } from "./async-worker.js";
import { Linter, LintDiagnostic, LintFix } from "./linter.js";

export class EsLint extends AsyncWorker implements Linter {
	private config: any;

	constructor(config: any) {
		super("worker/eslint.js");
		this.config = config;
	}

	async lint(code: string): Promise<LintDiagnostic[]> {
		const result = await this.process({ code, config: this.config });
		const diagnostics: EsLintDiagnostic[] = result.messages;
		return diagnostics.map(x => this.transformDiagnostic(x));
	}

	private transformDiagnostic(diagnostic: EsLintDiagnostic): LintDiagnostic {
		return {
			message: diagnostic.message,
			column: diagnostic.column,
			columnEnd: diagnostic.endColumn,
			line: diagnostic.line,
			lineEnd: diagnostic.endLine,
			severity: diagnostic.severity,
			fix: diagnostic.fix ? this.transformFix(diagnostic.fix) : undefined
		};
	}

	private transformFix(fix: EsLintFix): LintFix {
		return {
			range: {
				start: fix.range[0],
				end: fix.range[1]
			},
			text: fix.text
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
	fix?: EsLintFix;
}

interface EsLintFix {
	range: [number, number];
	text: string;
}