export class AsyncWorker implements monaco.IDisposable {
	private worker: Worker;
	private id: number;

	constructor(workerPath: string) {
		this.worker = new Worker(workerPath);
		this.id = 0;
	}

	dispose() {
		this.worker.terminate();
	}

	process(data: any): Promise<ProcessResult> {
		return new Promise<ProcessResult>(resolve => {
			const id = ++this.id;
			const handler = (e: MessageEvent) => {
				const result: ProcessResult = e.data;
				if (result.id !== id)
					return;
				this.worker.removeEventListener("message", handler);
				resolve(result);
			}
			this.worker.addEventListener("message", handler);
			this.worker.postMessage({ id, ...data });
		});
	}
}

interface ProcessResult {
	id: number;
	success: boolean;
	data: any;
}