#!/usr/bin/env node

import { rm } from "fs/promises";

await rm("test/dist", { recursive: true, force: true });
await rm("wwwroot", { recursive: true, force: true });