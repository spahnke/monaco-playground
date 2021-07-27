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
			parserOptions: { ecmaVersion: 2015 },
		},
		{
			code: `linq.execute('a x.foo.toString() === "asdf"');`,
		},
		{
			code: 'linq.execute(`a x.foo.toString() === "asdf"`);',
			parserOptions: { ecmaVersion: 2015 },
		},
	],
	invalid: [
		// single quotes
		{
			code: `linq.execute('a x.id.toString() === "asdf"');`,
			errors: [{ message: "Possible conversion of `uniqueidentifier` to `string`. This could impact performance.", column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.id === new Guid("asdf")');`, desc: "Convert `string` to `Guid` instead" }] }],
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
		// TODO should we report column 19 here or do we keep the current behavior of 22 because we start at the 'Id' part?
		{
			code: `linq.execute('a x.fooId.toString() === "asdf"');`,
			errors: [{ column: 22, endColumn: 46, type: "Literal", suggestions: [{ output: `linq.execute('a x.fooId === new Guid("asdf")');` }] }],
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
			parserOptions: { ecmaVersion: 2015 },
		},
		{
			code: 'linq.execute(`a x.id.toString() === "${text}" asdf`);',
			errors: [{ column: 19, endColumn: 46, type: "TemplateLiteral", suggestions: [{ output: 'linq.execute(`a x.id === new Guid("${text}") asdf`);' }] }],
			parserOptions: { ecmaVersion: 2015 },
		},
		// concatenated string
		{
			code: `linq.execute(foo + 'a x.id.toString() === "' + foo + '" asdf ' + \`a x.id.toString() !== "\${text}" asdf \` + foo);`,
			errors: [
				{ column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{ column: 71, endColumn: 98, type: "TemplateLiteral", suggestions: [{ output: `linq.execute(foo + 'a x.id.toString() === "' + foo + '" asdf ' + \`a x.id !== new Guid("\${text}") asdf \` + foo);` }] },
			],
			parserOptions: { ecmaVersion: 2015 },
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
			parserOptions: { ecmaVersion: 2015 },
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
			parserOptions: { ecmaVersion: 2015 },
		},
	]
});
