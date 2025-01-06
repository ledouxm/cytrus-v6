interface ChunkResponse {
    contentRange: {
        start: number;
        end: number;
        total: number;
    };
    data: Buffer;
}

export function parseResponse(buffer: Buffer): ChunkResponse[] {
    // Convert first few bytes to string to check for multipart boundary
    const previewContent = buffer
        .slice(0, Math.min(buffer.length, 1000))
        .toString();

    // Check if this is a multipart response by looking for the boundary
    if (previewContent.startsWith("--")) {
        return parseMultipartResponse(buffer);
    } else {
        // Handle single response
        // Look for Content-Range in the headers
        const headerEnd = previewContent.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
            // No headers found, assume this is just raw data
            return [
                {
                    contentRange: {
                        start: 0,
                        end: buffer.length - 1,
                        total: buffer.length,
                    },
                    data: buffer,
                },
            ];
        }

        const headers = previewContent.slice(0, headerEnd);
        const rangeMatch = headers.match(
            /Content-Range: bytes (\d+)-(\d+)\/(\d+)/
        );

        if (!rangeMatch) {
            // No Content-Range header, assume this is just raw data
            return [
                {
                    contentRange: {
                        start: 0,
                        end: buffer.length - 1,
                        total: buffer.length,
                    },
                    data: buffer,
                },
            ];
        }

        const [, start, end, total] = rangeMatch;
        // Get the body after headers
        const body = buffer.slice(headerEnd + 4); // +4 for \r\n\r\n

        return [
            {
                contentRange: {
                    start: parseInt(start),
                    end: parseInt(end),
                    total: parseInt(total),
                },
                data: body,
            },
        ];
    }
}

function parseMultipartResponse(buffer: Buffer): ChunkResponse[] {
    // Convert buffer to string for easier processing
    const content = buffer.toString();

    // Split the content by boundary
    const boundary = content.split("\n")[0].trim();
    const parts = content.split(boundary).slice(1, -1); // Remove first empty part and last boundary

    return parts.map((part) => {
        // Split headers and body
        const [headers, ...bodyParts] = part.split("\r\n\r\n");
        const body = bodyParts.join("\r\n\r\n");

        // Parse Content-Range header
        const rangeMatch = headers.match(
            /Content-Range: bytes (\d+)-(\d+)\/(\d+)/
        );
        if (!rangeMatch) {
            throw new Error("Invalid Content-Range header");
        }

        const [, start, end, total] = rangeMatch;

        // Convert body back to Buffer, removing trailing \r\n
        const bodyBuffer = Buffer.from(body.trim(), "binary");

        return {
            contentRange: {
                start: parseInt(start),
                end: parseInt(end),
                total: parseInt(total),
            },
            data: bodyBuffer,
        };
    });
}
