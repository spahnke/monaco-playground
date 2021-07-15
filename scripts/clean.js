import { rm } from "fs/promises";

await rm("wwwroot", { recursive: true, force: true });