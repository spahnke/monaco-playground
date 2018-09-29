import { Linter, Rule } from "./node_modules/@types/eslint/index";
import { BinaryExpression, CallExpression, Identifier, Literal, MemberExpression, Node, SourceLocation } from "./node_modules/@types/estree/index";

class NoIdToStringInQuery implements Rule.RuleModule {
	static register(linter: Linter) {
		linter.defineRule("no-id-tostring-in-query", new NoIdToStringInQuery());
	}

	create(context: Rule.RuleContext): Rule.RuleListener {
		return {
			CallExpression: (node: Node) => {
				const callExpression = node as CallExpression;
				if (!this.isQuery(callExpression))
					return;

				const argument = callExpression.arguments[0];
				if (argument.type === "Literal")
					this.handleStringLiteral(context, argument as Literal);
				else if (argument.type === "BinaryExpression")
					this.handleStringConcatenation(context, argument as BinaryExpression);
			}
		};
	}

	private isQuery(callExpression: CallExpression): boolean {
		if (callExpression.callee.type !== "MemberExpression" || callExpression.arguments.length === 0)
			return false;

		const memberExpression = callExpression.callee as MemberExpression;
		if (memberExpression.object.type !== "Identifier" || memberExpression.property.type !== "Identifier")
			return false;

		const object = memberExpression.object as Identifier;
		const property = memberExpression.property as Identifier;
		if (object.name !== "linq" || property.name !== "execute" && property.name !== "executeWritable")
			return false;

		return true;
	}

	private handleStringLiteral(context: Rule.RuleContext, literal: Literal) {
		if (typeof literal.value !== "string")
			return;

		const regex = /id\.toString\(\)/gi;
		let match = regex.exec(literal.value);
		while (match !== null) {
			context.report(this.getDiagnostic(literal, this.computeLocationInsideLiteral(literal, match)));
			match = regex.exec(literal.value);
		}
	}

	private handleStringConcatenation(context: Rule.RuleContext, expression: BinaryExpression) {
		if (expression.left.type === "Literal")
			this.handleStringLiteral(context, expression.left);
		if (expression.left.type === "BinaryExpression")
			this.handleStringConcatenation(context, expression.left);
		if (expression.right.type === "Literal")
			this.handleStringLiteral(context, expression.right);
	}

	private computeLocationInsideLiteral(literal: Literal, match: RegExpExecArray): SourceLocation | undefined {
		if (!literal.loc)
			return undefined;

		const location: SourceLocation = {
			start: { ...literal.loc.start },
			end: { ...literal.loc.end },
		};

		const offset = match.index + 1; // literal starts with `"` so we need to add 1
		const columnStart = location.start.column + offset;
		location.start.column = columnStart;
		location.end.column = columnStart + match[0].length;

		return location;
	}

	private getDiagnostic(node: Node, loc?: SourceLocation): Rule.ReportDescriptor {
		return {
			message: "Possible conversion of `uniqueidentifier` to `string`. This could impact performance.",
			node,
			loc
		};
	}
}
