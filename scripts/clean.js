// @ts-check
import { rm } from "fs/promises";

// @ts-ignore we can use top-level await
await rmrf("wwwroot/dist", "wwwroot/languages", "wwwroot/lib", "wwwroot/worker");

/**
 * @param {string[]} paths
 */
async function rmrf(...paths) {
	for (const path of paths)
		await rm(path, { recursive: true, force: true });
}