import { RuleTester } from "eslint";
import rule from "../../src/rules/no-id-tostring-in-query.js";

rule.create = rule.create.bind(rule);

const ruleTester = new RuleTester();
ruleTester.run("no-id-tostring-in-query", rule, {
	valid: [
		{
			code: `linq.execute("asdf");`,
		},
		{
			code: "linq.execute(`asdf`);",
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
		{
			code: `linq.execute('a x.foo.toString() === "asdf"');`,
		},
		{
			code: 'linq.execute(`a x.foo.toString() === "asdf"`);',
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
	],
	invalid: [
		// single quotes
		{
			code: `linq.execute('a x.id.toString() === "asdf"');`,
			errors: [{ messageId: "possibleConversion", column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.id === new Guid("asdf")');`, messageId: "convertToGuid" }] }],
		},
		{
			code: `linq.execute('a x.Id.toString() === "asdf"');`,
			errors: [{ column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.Id === new Guid("asdf")');` }] }],
		},
		{
			code: `linq.execute('a x.iD.toString() === "asdf"');`,
			errors: [{ column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.iD === new Guid("asdf")');` }] }],
		},
		{
			code: `linq.execute('a x.ID.toString() === "asdf"');`,
			errors: [{ column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.ID === new Guid("asdf")');` }] }],
		},
		{
			code: `linq.execute('a x.fooId.toString() === "asdf"');`,
			errors: [{ column: 19, endColumn: 46, type: "Literal", suggestions: [{ output: `linq.execute('a x.fooId === new Guid("asdf")');` }] }],
		},
		{
			code: `linq.execute('a x.id.toString() === "asdf" asdf x.id.toString() === "qwer"');`,
			errors: [
				{ column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.id === new Guid("asdf") asdf x.id.toString() === "qwer"');` }] },
				{ column: 51, endColumn: 75, type: "Literal", suggestions: [{ output: `linq.execute('a x.id.toString() === "asdf" asdf x.id === new Guid("qwer")');` }] },
			],
		},
		// template strings
		{
			code: 'linq.execute(`a x.id.toString() === "asdf" asdf`);',
			errors: [{ column: 19, endColumn: 43, type: "TemplateLiteral", suggestions: [{ output: 'linq.execute(`a x.id === new Guid("asdf") asdf`);' }] }],
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
		{
			code: 'linq.execute(`a x.id.toString() === "${text}" asdf`);',
			errors: [{ column: 19, endColumn: 46, type: "TemplateLiteral", suggestions: [{ output: 'linq.execute(`a x.id === new Guid("${text}") asdf`);' }] }],
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
		// concatenated string
		{
			code: `linq.execute(foo + 'a x.id.toString() === "' + foo + '" asdf ' + \`a x.id.toString() !== "\${text}" asdf \` + foo);`,
			errors: [
				{ column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{ column: 71, endColumn: 98, type: "TemplateLiteral", suggestions: [{ output: `linq.execute(foo + 'a x.id.toString() === "' + foo + '" asdf ' + \`a x.id !== new Guid("\${text}") asdf \` + foo);` }] },
			],
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
		// intermediate variable
		{
			code: `
const query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
linq.execute(query);
`.trim(),
			errors: [
				{ line: 1, column: 26, endColumn: 45, type: "Literal", suggestions: [] },
				{
					line: 1, column: 60, endColumn: 87, type: "TemplateLiteral",
					suggestions: [
						{
							output: `
const query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
linq.execute(query);
`.trim()
						}
					]
				},
			],
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
		{
			code: `
var query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
linq.execute(query);
`.trim(),
			errors: [
				{ line: 1, column: 24, endColumn: 43, type: "Literal", suggestions: [] },
				{
					line: 1, column: 58, endColumn: 85, type: "TemplateLiteral",
					suggestions: [
						{
							output: `
var query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
linq.execute(query);
`.trim()
						}
					]
				},
			],
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
		{
			code: `
const query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
const query2 = query;
linq.execute(query2);
`.trim(),
			errors: [
				{ line: 1, column: 26, endColumn: 45, type: "Literal", suggestions: [] },
				{
					line: 1, column: 60, endColumn: 87, type: "TemplateLiteral",
					suggestions: [
						{
							output: `
const query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
const query2 = query;
linq.execute(query2);
`.trim()
						}
					]
				},
			],
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
		{
			code: `
/* let/const in block */
{
	let query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
	linq.execute(query);
}`.trim(),
			errors: [
				{ line: 3, column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{
					line: 3, column: 59, endColumn: 86, type: "TemplateLiteral",
					suggestions: [
						{
							output: `
/* let/const in block */
{
	let query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
	linq.execute(query);
}`.trim()
						}
					]
				},
			],
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
		{
			code: `
/* let/const in nested block */
{
	let query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
	{
		linq.execute(query);
	}
}`.trim(),
			errors: [
				{ line: 3, column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{
					line: 3, column: 59, endColumn: 86, type: "TemplateLiteral",
					suggestions: [
						{
							output: `
/* let/const in nested block */
{
	let query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
	{
		linq.execute(query);
	}
}`.trim()
						}
					]
				},
			],
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
		{
			code: `
/* var in block */
{
	var query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
	linq.execute(query);
}`.trim(),
			errors: [
				{ line: 3, column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{
					line: 3, column: 59, endColumn: 86, type: "TemplateLiteral",
					suggestions: [
						{
							output: `
/* var in block */
{
	var query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
	linq.execute(query);
}`.trim()
						}
					]
				},
			],
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
		{
			code: `
/* var in nested block */
{
	var query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
	{
		linq.execute(query);
	}
}`.trim(),
			errors: [
				{ line: 3, column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{
					line: 3, column: 59, endColumn: 86, type: "TemplateLiteral",
					suggestions: [
						{
							output: `
/* var in nested block */
{
	var query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
	{
		linq.execute(query);
	}
}`.trim()
						}
					]
				},
			],
			// @ts-expect-error - ignore error until the types package is renewed
			languageOptions: { ecmaVersion: 2015 },
		},
	]
});
