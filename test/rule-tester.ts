import { Linter, Rule, RuleTester as RuleTesterNamespace } from "eslint";
// @ts-ignore Since this file isn't copied on compile we import it from outside the out dir.
import "../../../src/worker/eslint/eslint.js";

import assert from "assert";
import { test, describe } from "node:test";

declare const eslint: {
	Linter: typeof import("eslint").Linter;
};

interface InvalidTestCase extends RuleTesterNamespace.ValidTestCase {
	errors: RuleTesterNamespace.TestCaseError[];
	output?: string | null | undefined;
}

export class RuleTester {
	run(ruleId: string, rule: Rule.RuleModule, testCases: { valid: RuleTesterNamespace.ValidTestCase[]; invalid: InvalidTestCase[]; }) {
		describe(ruleId, () => {
			const linter = new eslint.Linter();
			const config: Linter.Config<Linter.RulesRecord> = {
				rules: {
					[`local/${ruleId}`]: "warn",
				},
				plugins: {
					local: {
						rules: {
							[ruleId]: rule,
						},
					},
				},
			};

			for (const validCase of testCases.valid) {
				test(validCase.code, () => {
					const result = linter.verify(validCase.code, [config]);
					assert.strictEqual(Array.isArray(result), true);
					assert.strictEqual(result.length, 0);
				});
			}
			for (const invalidCase of testCases.invalid) {
				test(invalidCase.code, () => {
					const result = linter.verify(invalidCase.code, [config]);
					assert.strictEqual(Array.isArray(result), true);
					assert.strictEqual(result.length, invalidCase.errors.length);

					const fixSourceCode = (code: string, fix: Rule.Fix): string => {
						let result = code.substring(0, fix.range[0]);
						result += fix.text;
						result += code.substring(fix.range[1]);
						return result;
					};
					for (let i = 0; i < invalidCase.errors.length; i++) {
						const expected = invalidCase.errors[i];
						const actual = result[i];
						assert.strictEqual(actual.column, expected.column);
						assert.strictEqual(actual.endColumn, expected.endColumn);
						assert.strictEqual(actual.messageId, expected.messageId);
						if (expected.line !== undefined) {
							assert.strictEqual(actual.line, expected.line);
						}
						if (expected.endLine !== undefined) {
							assert.strictEqual(actual.endLine, expected.endLine);
						}
						if (expected.message !== undefined) {
							assert.strictEqual(actual.message, expected.message);
						}
						if (Array.isArray(expected.suggestions) && expected.suggestions.length > 0) {
							if (!Array.isArray(actual.suggestions)) {
								assert.fail("Result has no suggestions");
							}
							for (let j = 0; j < expected.suggestions.length; j++) {
								const expectedSuggestion: RuleTesterNamespace.SuggestionOutput = expected.suggestions[j];
								const actualSuggestion: Linter.LintSuggestion = actual.suggestions[j];
								assert.strictEqual(fixSourceCode(invalidCase.code, actualSuggestion.fix), expectedSuggestion.output);
								if (expectedSuggestion.desc !== undefined) {
									assert.strictEqual(actualSuggestion.desc, expectedSuggestion.desc);
								}
								if (expectedSuggestion.messageId !== undefined) {
									assert.strictEqual(actualSuggestion.messageId, expectedSuggestion.messageId);
								}
							}
						}
					}
				});
			}
		});
	}
}