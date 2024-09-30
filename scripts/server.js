#!/usr/bin/env node

import fs from "fs";
import http from "http";
import path from "path";

const params = parseCommandLine();

const mimeTypes = {
	".css" : "text/css",
	".html": "text/html",
	".ico" : "image/x-icon",
	".js"  : "text/javascript",
	".json": "application/json",
	".ttf" : "application/x-font-ttf",
};
const longestMimeTypeLength = Math.max(...Object.values(mimeTypes).map(x => x.length));

const server = http.createServer((req, res) => {
	const url = parseUrl(req.url);
	if (req.method !== "GET" || url === null || url.path.includes("..")) {
		res.statusCode = 400;
		res.end();
		log(req, res);
		return;
	}

	let filePath = path.join(params.contentRoot, url.path);
	if (fs.statSync(filePath, { throwIfNoEntry: false })?.isDirectory()) {
		filePath = path.join(filePath, "/index.html")
	}
	if (!fs.existsSync(filePath)) {
		res.statusCode = 404;
		res.end();
		log(req, res);
		return;
	}

	fs.readFile(filePath, (err, data) => {
		if (err) {
			res.statusCode = 500;
			res.end();
			console.error(err);
			log(req, res);
		} else {
			const ext = path.extname(filePath);
			let mimeType = mimeTypes[ext];
			if (!mimeType) {
				console.warn(`No MIME type registered for ${ext}`);
				mimeType = "text/plain";
			}
			res.statusCode = 200;
			res.setHeader("Content-Type", mimeType)
			res.end(data);
			log(req, res);
		}
	});
}).listen(params.port, "0.0.0.0");
server.on("error", console.error);
server.on("listening", () => {
	/** @type {import("net").AddressInfo} */
	const address = server.address();
	console.log(`Content root: ${params.contentRoot}`);
	console.log("Server listening on:");
	console.log(`- http://localhost:${address.port}`);
	console.log(`- http://${address.address}:${address.port}`);
});

function parseCommandLine() {
	const serverParams = {
		port: 9000,
		contentRoot: process.cwd(),
	};

	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg === "-p") {
			const port = process.argv[++i];
			if (Number.isNaN(Number(port)))
				console.error(`Port must be a number but got ${port}`);
			else
				serverParams.port = Number(port);
		} else if (arg.startsWith("-")) {
			console.error(`Unknown option ${arg}`);
		} else {
			serverParams.contentRoot = path.join(process.cwd(), arg);
		}
	}

	return serverParams;
}

/**
 * @param {string} urlPath
 */
function parseUrl(urlPath) {
	try {
		const parsed = new URL(`http://localhost${urlPath}`);
		return { path: parsed.pathname, search: parsed.searchParams };
	} catch (e) {
		console.error(`Could not parse URL ${urlPath}`);
		return null;
	}
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function log(req, res) {
	const mimeType = `${res.getHeader("Content-Type") ?? ""}`;
	console.log(`${req.method?.padEnd(6)} ${res.statusCode} ${mimeType.padEnd(longestMimeTypeLength)} ${req.url}`);
}