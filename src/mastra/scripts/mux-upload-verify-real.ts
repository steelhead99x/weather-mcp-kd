
import 'dotenv/config';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { muxMcpClient as uploadClient } from '../mcp/mux-upload-client';
import { muxMcpClient as assetsClient } from '../mcp/mux-assets-client';

/**
 * Upload file to Mux direct upload endpoint
 * Mux uses a simplified upload protocol, not full TUS
 */
async function uploadFileToMux(uploadUrl: string, filePath: string): Promise<void> {
    console.log('[mux-upload-verify-real] Uploading file to Mux endpoint...');
    
    try {
        // Read file
        const fileBuffer = await fs.readFile(filePath);
        const fileSize = fileBuffer.length;
        
        console.log(`[mux-upload-verify-real] File size: ${fileSize} bytes`);
        
        // Mux direct upload uses PUT method with the file as body
        console.log('[mux-upload-verify-real] Uploading file content...');
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': fileSize.toString(),
            },
            body: fileBuffer,
        });
        
        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text().catch(() => 'Unknown error');
            const error = new Error(`File upload failed: ${uploadResponse.status} ${uploadResponse.statusText}. Response: ${errorText}`);
            console.error('[mux-upload-verify-real] File upload failed:', error);
            throw error;
        }
        
        console.log('[mux-upload-verify-real] File uploaded successfully');
        
        // Log response details for debugging
        const responseText = await uploadResponse.text().catch(() => '');
        if (responseText) {
            console.log(`[mux-upload-verify-real] Upload response: ${responseText}`);
        }
}

/**
 * Real Mux upload + verify script (no mocks):
 * - Uploads files/uploads/samples/mux-sample.mp4 (or .wav) by default via mux-upload-client
 * - Uploads the actual file to the Mux endpoint
 * - Then verifies the uploaded asset exists and becomes ready via mux-assets-client
 * - Requires MUX_TOKEN_ID and MUX_TOKEN_SECRET
 *
 * Optional env:
 * - MUX_SAMPLE_FILE: override local file to upload
 * - MUX_CONNECTION_TIMEOUT: override connection timeout (ms)
 * - MUX_VERIFY_TIMEOUT_MS: max time to wait for asset ready (default 300000 ms)
 * - MUX_VERIFY_POLL_MS: poll interval (default 5000 ms)
 * - DEBUG: enable verbose logging
 */
async function main() {
    const preferredPath = process.env.MUX_SAMPLE_FILE || 'files/uploads/samples/mux-sample.mp4';
    let absPath = resolve(preferredPath);

    // Validate environment
    const id = process.env.MUX_TOKEN_ID;
    const secret = process.env.MUX_TOKEN_SECRET;
    if (!id || !secret) {
        throw new Error('Missing MUX_TOKEN_ID or MUX_TOKEN_SECRET in environment');
    }

    // Validate file exists or fallback to WAV if present
    let exists = true;
    try {
        await fs.access(absPath);
    } catch {
        exists = false;
    }

    if (!exists) {
        const wavPath = 'files/uploads/samples/mux-sample.wav';
        try {
            await fs.access(wavPath);
            console.warn(`[mux-upload-verify-real] WARNING: Preferred file not found: ${absPath}. Falling back to ${wavPath}. Set MUX_SAMPLE_FILE to override.`);
            absPath = resolve(wavPath);
        } catch {
            throw new Error(`Sample file not found. Tried: ${absPath} and ${resolve(wavPath)}.`);
        }
    }

    console.log('[mux-upload-verify-real] Using file:', absPath);

    // 1) Create upload via MCP (real)
    const uploadTools = await uploadClient.getTools();

    // Try to use the direct endpoint first
    let create = uploadTools['create_video_uploads'];
    if (!create) {
        // Fallback to the dotted notation
        create = uploadTools['video.uploads.create'];
    }

    if (!create) {
        throw new Error('Mux MCP did not expose tool create_video_uploads or video.uploads.create.');
    }

    console.log('[mux-upload-verify-real] Creating upload via MCP...');
    const createArgs: any = {
        cors_origin: process.env.MUX_CORS_ORIGIN || 'http://localhost',
        new_asset_settings: {
            playback_policies: ['public'],
        },
    };
    if (process.env.MUX_UPLOAD_TEST === 'true') createArgs.test = true;

    // Add timeout if specified (align with MUX_CONNECTION_TIMEOUT used by clients)
    const timeoutEnv = process.env.MUX_CONNECTION_TIMEOUT;
    if (timeoutEnv && Number(timeoutEnv) > 0) {
        createArgs.timeout = Number(timeoutEnv);
    }

    if (process.env.DEBUG) {
        console.log('[mux-upload-verify-real] Create arguments:', JSON.stringify(createArgs, null, 2));
    }

    const createRes = await create.execute({ context: createArgs });

    // Print response blocks for visibility
    const blocks = Array.isArray(createRes) ? createRes : [createRes];
    console.log('[mux-upload-verify-real] upload.create response blocks:');
    for (const block of blocks) {
        try {
            const text = (block && typeof block === 'object' && 'text' in block) ? (block as any).text : String(block);
            console.log('  >', text);
        } catch {
            console.log('  >', block);
        }
    }

    // Extract JSON from any text blocks if possible (collect best-effort ids)
    let assetId: string | undefined = undefined;
    let uploadId: string | undefined = undefined;
    let uploadUrl: string | undefined = undefined;
    
    for (const block of blocks as any[]) {
        const text = block && typeof block === 'object' && typeof block.text === 'string' ? block.text as string : undefined;
        if (!text) continue;
        try {
            const payload = JSON.parse(text);
            assetId = assetId || payload.asset_id || payload.asset?.id;
            uploadId = uploadId || payload.upload_id || payload.id || payload.upload?.id;
            uploadUrl = uploadUrl || payload.url || payload.upload?.url;
        } catch {
            // ignore non-JSON text blocks
        }
    }

    // Always print machine-readable lines for downstream tooling/visibility
    console.log(`MUX_UPLOAD_ID=${uploadId ?? ''}`);
    console.log(`MUX_UPLOAD_URL=${uploadUrl ?? ''}`);
    console.log(`MUX_ASSET_ID=${assetId ?? ''}`);

    if (uploadUrl) {
        console.log('[mux-upload-verify-real] upload_url provided by Mux:', uploadUrl);
        console.log('[mux-upload-verify-real] Starting file upload to Mux endpoint...');
        
        // Upload the file using Mux's direct upload protocol
        try {
            await uploadFileToMux(uploadUrl, absPath);
            
            // Wait a bit for Mux to process the upload
            console.log('[mux-upload-verify-real] Waiting for Mux to process the uploaded file...');
            await delay(10000); // Wait 10 seconds for processing to start
            
            // Now try to get the upload info again to get the asset_id
            const retrieve = uploadTools['retrieve_video_uploads'] || uploadTools['video.uploads.get'];
            if (retrieve && uploadId) {
                console.log('[mux-upload-verify-real] Retrieving upload info to get asset_id...');
                try {
                    const retrieveRes = await retrieve.execute({ context: { id: uploadId } });
                    const retrieveBlocks = Array.isArray(retrieveRes) ? retrieveRes : [retrieveRes];
                    
                    for (const block of retrieveBlocks as any[]) {
                        const text = block && typeof block === 'object' && typeof block.text === 'string' ? block.text : undefined;
                        if (!text) continue;
                        try {
                            const payload = JSON.parse(text);
                            console.log('[mux-upload-verify-real] Retrieved upload info:', JSON.stringify(payload, null, 2));
                            assetId = assetId || payload.asset_id || payload.asset?.id;
                            
                            // Also check status
                            const status = payload.status;
                            console.log(`[mux-upload-verify-real] Upload status: ${status}`);
                        } catch {
                            // ignore non-JSON text blocks
                        }
                    }
                } catch (error) {
                    console.warn('[mux-upload-verify-real] Failed to retrieve upload info after file upload:', error);
                }
            }
        } catch (uploadError) {
            console.error('[mux-upload-verify-real] File upload failed:', uploadError);
            return;
        }
    } else {
        console.warn('[mux-upload-verify-real] No upload URL provided - cannot upload file');
    }

    // Update the machine-readable asset ID line
    console.log(`MUX_ASSET_ID=${assetId ?? ''}`);

    if (!assetId) {
        console.warn('[mux-upload-verify-real] No asset_id available after upload. This may be normal if asset creation is still in progress.');
        console.warn('[mux-upload-verify-real] You can run asset verification later using the upload_id or check the Mux dashboard.');
        return;
    }

    // 2) Poll asset status via assets client until ready/errored
    const assetsTools = await assetsClient.getTools();

    // Try multiple possible tool names for getting asset
    let getAsset = assetsTools['get_video_assets'] ||
        assetsTools['retrieve_video_assets'] ||
        assetsTools['video.assets.get'] ||
        assetsTools['video.assets.retrieve'];

    if (!getAsset) {
        throw new Error('Mux MCP did not expose any asset retrieval tool (get_video_assets, retrieve_video_assets, video.assets.get, or video.assets.retrieve).');
    }

    const validStatuses = new Set(['preparing', 'processing', 'ready', 'errored']);
    const pollMs = Math.max(1000, parseInt(process.env.MUX_VERIFY_POLL_MS || '5000', 10) || 5000);
    const timeoutMs = Math.min(30 * 60 * 1000, Math.max(10_000, parseInt(process.env.MUX_VERIFY_TIMEOUT_MS || '300000', 10) || 300000));

    console.log(`[mux-upload-verify-real] Polling asset ${assetId} until ready (every ${pollMs}ms, timeout ${timeoutMs}ms)...`);

    const start = Date.now();
    let finalStatus: string | undefined;
    let lastPayload: any;
    while (Date.now() - start < timeoutMs) {
        try {
            // Pass the asset ID directly as the expected parameter
            const res = await getAsset.execute({ context: { id: assetId } });
            const text = Array.isArray(res) ? (res[0] as any)?.text ?? '' : String(res ?? '');
            try {
                lastPayload = JSON.parse(text);
            } catch {
                lastPayload = { raw: text };
            }
            const status = lastPayload?.status as string | undefined;

            if (status) {
                if (!validStatuses.has(status)) {
                    console.warn(`[mux-upload-verify-real] Unexpected asset status: ${status}`);
                } else {
                    console.log(`[mux-upload-verify-real] asset status: ${status}`);
                }
                if (status === 'ready' || status === 'errored') {
                    finalStatus = status;
                    break;
                }
            } else {
                console.log('[mux-upload-verify-real] asset status missing in response, continuing to poll...');
                if (process.env.DEBUG) {
                    console.log('[mux-upload-verify-real] Raw response:', text.slice(0, 200));
                }
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.warn('[mux-upload-verify-real] Error fetching asset, will retry:', errorMsg);
            if (process.env.DEBUG) {
                console.log('[mux-upload-verify-real] Full error:', e);
            }
        }

        await delay(pollMs);
    }

    if (!finalStatus) {
        throw new Error('Verification timed out before reaching a terminal status');
    }
    if (finalStatus !== 'ready') {
        throw new Error(`Asset did not reach ready state (final: ${finalStatus}). Last payload: ${JSON.stringify(lastPayload)}`);
    }

    // Output final, machine-readable summary
    const playbackId = Array.isArray(lastPayload?.playback_ids) && lastPayload.playback_ids.length > 0
        ? (lastPayload.playback_ids[0]?.id as string | undefined)
        : undefined;

    console.log(`MUX_ASSET_ID=${assetId}`);
    if (playbackId) console.log(`MUX_PLAYBACK_ID=${playbackId}`);

    console.log('✅ Mux upload and verification succeeded. Asset is ready.');
    if (playbackId) {
        console.log(`🎥 Your video is now available at: https://stream.mux.com/${playbackId}.m3u8`);
    }
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isDirectRun) {
    main().catch((err) => {
        console.error('❌ mux-upload-verify-real failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
    });
}