export abstract class AsyncWorker {
	private worker: Worker;
	private id: number;
	private currentOperation: Promise<ProcessResult>;

	constructor(workerPath: string) {
		this.worker = new Worker(workerPath);
		this.id = 0;
		this.currentOperation = null;
	}

	protected process(data: any): Promise<ProcessResult> {
		if (this.currentOperation) {
			return Promise.resolve(<ProcessResult>{
				id: -1,
				success: false,
				data: "Previous process still running"
			});
		}

		this.currentOperation = new Promise<ProcessResult>(resolve => {
			const id = ++this.id;
			const handler = (e: MessageEvent) => {
				const result: ProcessResult = e.data;
				if (result.id !== id)
					return;
				this.worker.removeEventListener("message", handler);
				this.currentOperation = null;
				resolve(result);
			}
			this.worker.addEventListener("message", handler);
			this.worker.postMessage({ id, ...data });
		});
		return this.currentOperation;
	}
}

interface ProcessResult {
	id: number;
	success: boolean;
	data: any;
}