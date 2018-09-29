var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var NoIdToStringInQuery = /** @class */ (function () {
    function NoIdToStringInQuery() {
    }
    NoIdToStringInQuery.register = function (linter) {
        linter.defineRule("no-id-tostring-in-query", new NoIdToStringInQuery());
    };
    NoIdToStringInQuery.prototype.create = function (context) {
        var _this = this;
        return {
            CallExpression: function (node) {
                var callExpression = node;
                if (!_this.isQuery(callExpression))
                    return;
                var argument = callExpression.arguments[0];
                if (argument.type === "Literal")
                    _this.handleStringLiteral(context, argument);
                else if (argument.type === "BinaryExpression")
                    _this.handleStringConcatenation(context, argument);
            }
        };
    };
    NoIdToStringInQuery.prototype.isQuery = function (callExpression) {
        if (callExpression.callee.type !== "MemberExpression")
            return false;
        var memberExpression = callExpression.callee;
        if (memberExpression.object.type !== "Identifier" || memberExpression.property.type !== "Identifier")
            return false;
        var object = memberExpression.object;
        var method = memberExpression.property;
        if (object.name !== "linq" || method.name !== "execute" && method.name !== "executeWritable" || callExpression.arguments.length === 0)
            return false;
        return true;
    };
    NoIdToStringInQuery.prototype.handleStringLiteral = function (context, literal) {
        if (typeof literal.value !== "string")
            return;
        var regex = /id\.toString\(\)/gi;
        var match = regex.exec(literal.value);
        while (match !== null) {
            context.report(this.getDiagnostic(literal, this.computeLocationInsideLiteral(literal, match)));
            match = regex.exec(literal.value);
        }
    };
    NoIdToStringInQuery.prototype.handleStringConcatenation = function (context, expression) {
        if (expression.left.type === "Literal")
            this.handleStringLiteral(context, expression.left);
        if (expression.right.type === "Literal")
            this.handleStringLiteral(context, expression.right);
        // the `+` ooperator is left associative so check for BinaryExpression on the LHS
        if (expression.left.type === "BinaryExpression")
            this.handleStringConcatenation(context, expression.left);
    };
    NoIdToStringInQuery.prototype.computeLocationInsideLiteral = function (literal, match) {
        if (!literal.loc)
            return undefined;
        var location = {
            start: __assign({}, literal.loc.start),
            end: __assign({}, literal.loc.end),
        };
        var offset = match.index + 1; // literal starts with `"` so we need to add 1
        var columnStart = location.start.column + offset;
        location.start.column = columnStart;
        location.end.column = columnStart + match[0].length;
        return location;
    };
    NoIdToStringInQuery.prototype.getDiagnostic = function (node, loc) {
        return {
            message: "Possible conversion of `uniqueidentifier` to `string`. This could impact performance.",
            node: node,
            loc: loc
        };
    };
    return NoIdToStringInQuery;
}());
