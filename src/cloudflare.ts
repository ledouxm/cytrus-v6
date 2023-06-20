export const parseCloudflareResponse = (e: Buffer, delimiter = "") => {
    delimiter = "--" + delimiter;
    const n: ParsedChunk[] = [];
    let i = 0;
    for (;;) {
        const o = e.indexOf(delimiter, i);
        if (-1 === o) break;
        if (
            ((i = e.indexOf("\n", o)),
            -1 === i && (i = e.length - 1),
            e.slice(o, i).toString().trim() === delimiter + "--")
        )
            break;
        i += 1;
        const s = {
            headers: null as any,
            data: null as any,
            range: undefined as any,
        };
        let a = 0;
        for (; !a; ) {
            const t = e.indexOf("\n", i);
            -1 === t && (a = e.length - 1);
            const n = e.slice(i, t).toString().trim();
            if (((i = t + 1), n)) {
                s.headers || (s.headers = {});
                const e = n.split(":");
                s.headers[e[0]] = e[1] ? e[1].trim() : e[1];
            } else a = 1;
        }
        if (!s.headers) break;
        if (
            ((s.range = parseContentRange(s.headers["Content-Range"])),
            "bytes" !== s.range.unit)
        )
            throw new Error("Unsupported range type : " + s.range.unit);
        (s.range.size = s.range.end - s.range.start + 1),
            (s.data = e.slice(i, i + s.range.size)),
            (i += s.range.size),
            n.push(s);
    }
    return n;
};

export type ParsedChunk = {
    headers: { "Content-Type"?: string; "Content-Range"?: string };
    data: Uint8Array;
    range: { unit: string; start: number; end: number; size: number };
};

function parseContentRange(e: string) {
    var t = e.match(/^(\w+) ((\d+)-(\d+)|\*)\/(\d+|\*)$/);
    if (!t) return null;
    var n = t[1],
        r = t[3],
        i = t[4],
        o = t[5],
        s = {
            unit: n,
            start: null != r ? Number(r) : null,
            end: null != i ? Number(i) : null,
            size: "*" === o ? null : Number(o),
        };
    return null === s.start && null === s.end && null === s.size ? null : s;
}
