import { strictEqual } from "assert";
import { Disposable } from "../../src/common/disposable.js";

describe("Disposable", function () {
	it("should call dispose for all registered disposables", function () {
		const disposable = new Disposable();
		let disposed = 0;
		disposable.register({
			dispose() {
				disposed++;
			}
		});
		disposable.register({
			dispose() {
				disposed++;
			}
		});
		disposable.dispose();
		strictEqual(disposed, 2);
	});
});