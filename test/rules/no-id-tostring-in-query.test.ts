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
			errors: 1,
		},
		{
			code: `linq.execute('a x.Id.toString() === "asdf"');`,
			errors: 1,
		},
		{
			code: `linq.execute('a x.iD.toString() === "asdf"');`,
			errors: 1,
		},
		{
			code: `linq.execute('a x.ID.toString() === "asdf"');`,
			errors: 1,
		},
		{
			code: `linq.execute('a x.fooId.toString() === "asdf"');`,
			errors: 1,
		},
		{
			code: `linq.execute('a x.id.toString() === "asdf" asdf x.id.toString() === "qwer"');`,
			errors: 2,
		},
		// template strings
		{
			code: 'linq.execute(`a x.id.toString() === "asdf" asdf`);',
			errors: 1,
			parserOptions: { ecmaVersion: 2015 },
		},
		{
			code: 'linq.execute(`a x.id.toString() === "${text}" asdf`);',
			errors: 1,
			parserOptions: { ecmaVersion: 2015 },
		},
		// concatenated string
		{
			code: `linq.execute(foo + 'a x.id.toString() === "' + foo + '" asdf ' + \`a x.id.toString() !== "\${text}" asdf \` + foo);`,
			errors: 2,
			parserOptions: { ecmaVersion: 2015 },
		},
		// intermediate variable
		{
			code: `
const query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
linq.execute(query);
`.trim(),
			errors: 2,
			parserOptions: { ecmaVersion: 2015 },
		},
		{
			code: `
const query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
const query2 = query;
linq.execute(query2);
`.trim(),
			errors: 2,
			parserOptions: { ecmaVersion: 2015 },
		},
	]
});
