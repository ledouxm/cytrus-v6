import { AxiosResponse } from "axios";
import crypto from "crypto";
import { ByteBuffer } from "flatbuffers";
import { promises as fs } from "fs";
import { minimatch } from "minimatch";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { fetchBundle, removeDelimiters } from "../src/api";
import { Bundle, Manifest, Fragment } from "../src/flatbuffers/schema";
import { createFoldersRecursively, getStringFromHashArray } from "../src/utils";
const cache = {
    manifest: null as Manifest | null,
};

describe(
    "Download",
    () => {
        beforeAll(async () => {
            const manifestBin = await fs.readFile("./output/manifest.bin");
            const buffer = new ByteBuffer(manifestBin as any);

            cache.manifest = Manifest.getRootAsManifest(buffer);
        });

        it("should filter fragments", async () => {});
    },
    {
        timeout: 60000,
    }
);
