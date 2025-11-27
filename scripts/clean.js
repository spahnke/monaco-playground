import { rmSync } from "fs";

rmSync("test/dist", { recursive: true, force: true });
rmSync("wwwroot", { recursive: true, force: true });