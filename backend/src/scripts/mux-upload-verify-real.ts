/**
 * Mux upload (real) quick test
 *
 * What it does:
 *   - Creates a direct upload via Mux MCP
 *   - PUTs a local sample file to Mux
 *   - Polls assets API until the video is ready
 *
 * Usage:
 *   npm run run:mux:upload:verify
 *
 * Required env:
 *   MUX_TOKEN_ID, MUX_TOKEN_SECRET
 *
 * Optional env:
 *   MUX_SAMPLE_FILE=files/uploads/samples/mux-sample.mp4
 *   MUX_VERIFY_TIMEOUT_MS=300000  MUX_VERIFY_POLL_MS=5000
 */
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

    // Read file
    const fileBuffer = await fs.readFile(filePath);
    const fileSize = fileBuffer.length;

    console.log(`[mux-upload-verify-real] File size: ${fileSize} bytes`);

    // Mux direct upload uses PUT method with the file as body
    console.log('[mux-upload-verify-real] Uploading file content...');
    const copy = new Uint8Array(fileBuffer);
    const fileAB = copy.buffer;
    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': fileSize.toString(),
        },
        body: new Blob([fileAB], { type: 'application/octet-stream' }),
    });

    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text().catch(() => 'Unknown error');
        const err = new Error(`File upload failed: ${uploadResponse.status} ${uploadResponse.statusText}. Response: ${errorText}`);
        console.error('[mux-upload-verify-real] File upload failed:', err.message);
        throw err;
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
    try {
    console.log('🚀 Starting Mux Upload Verification Process...');
    
    const preferredPath = process.env.MUX_SAMPLE_FILE || 'files/uploads/samples/mux-sample.mp4';
    let absPath = resolve(preferredPath);

    // Validate environment
    console.log('🔐 Validating environment variables...');
    const id = process.env.MUX_TOKEN_ID;
    const secret = process.env.MUX_TOKEN_SECRET;
    if (!id || !secret) {
        throw new Error('Missing MUX_TOKEN_ID or MUX_TOKEN_SECRET in environment');
    }
    console.log('✅ Environment variables validated');

    // Validate file exists or fallback to WAV if present
    console.log('📁 Checking for sample file...');
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
            console.log(`⚠️  Preferred file not found: ${absPath}`);
            console.log(`🔄 Falling back to: ${wavPath}`);
            absPath = resolve(wavPath);
        } catch {
            throw new Error(`Sample file not found. Tried: ${absPath} and ${resolve(wavPath)}.`);
        }
    }

    console.log(`✅ Using file: ${absPath}`);

    // 1) Create upload via MCP (real)
    console.log('🔌 Connecting to Mux MCP server...');
    const uploadTools = await uploadClient.getTools();
    console.log('✅ Connected to Mux MCP server');

    // Try to use the direct endpoint first
    console.log('🔍 Looking for upload creation tool...');
    let create = uploadTools['create_video_uploads'];
    if (!create) {
        // Fallback to the dotted notation
        create = uploadTools['video.uploads.create'];
    }

    // If no direct tools, use invoke_api_endpoint
    if (!create) {
        const invokeTool = uploadTools['invoke_api_endpoint'];
        if (!invokeTool) {
            throw new Error('Mux MCP did not expose any upload tools or invoke_api_endpoint.');
        }
        
        // Create a wrapper for the invoke_api_endpoint tool
        create = {
            execute: async ({ context }: { context: any }) => {
                return await invokeTool.execute({ 
                    context: { 
                        endpoint_name: 'create_video_uploads',
                        arguments: context 
                    } 
                });
            }
        };
    }
    console.log('✅ Upload creation tool found');

    console.log('⚙️  Configuring upload parameters...');
    const createArgs: any = {
        cors_origin: process.env.MUX_CORS_ORIGIN || 'https://weather-mcp-kd.streamingportfolio.com'
    };
    
    // Add playback policy configuration
    const playbackPolicy = process.env.MUX_PLAYBACK_POLICY || 'signed';
    console.log(`🔐 Using playback policy: ${playbackPolicy}`);
    
    // Add new_asset_settings with playback policy
    createArgs.new_asset_settings = {
        playback_policies: [playbackPolicy]
    };
    console.log('✅ Upload parameters configured');
    if (process.env.MUX_UPLOAD_TEST === 'true') createArgs.test = true;

    // Add timeout if specified (Mux expects SECONDS, not ms)
    const timeoutEnv = process.env.MUX_CONNECTION_TIMEOUT;
    if (timeoutEnv) {
        const raw = Number(timeoutEnv);
        if (!Number.isNaN(raw) && raw > 0) {
            // If value looks like ms (> 600), convert to seconds
            let seconds = raw > 600 ? Math.ceil(raw / 1000) : raw;
            // Clamp to Mux's required range: 60s - 604800s (1 week)
            seconds = Math.max(60, Math.min(604800, seconds));
            createArgs.timeout = seconds;
        }
    }

    if (process.env.DEBUG) {
        console.log('[mux-upload-verify-real] Create arguments:', JSON.stringify(createArgs, null, 2));
    }

    console.log('📤 Creating upload with Mux...');
    const createRes = await create.execute({ context: createArgs });
    console.log('✅ Upload created successfully');

    // Print response blocks for visibility
    const blocks = Array.isArray(createRes) ? createRes : [createRes];
    console.log('📋 Upload response details:');
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
            const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : payload;
            assetId = assetId || data.asset_id || data.asset?.id || data.assetId;
            uploadId = uploadId || data.upload_id || data.id || data.upload?.id || data.uploadId;
            uploadUrl = uploadUrl || data.url || data.upload?.url || data.uploadUrl;
        } catch {
            // ignore non-JSON text blocks
        }
    }

    // Always print machine-readable lines for downstream tooling/visibility
    console.log(`MUX_UPLOAD_ID=${uploadId ?? ''}`);
    console.log(`MUX_UPLOAD_URL=${uploadUrl ?? ''}`);
    console.log(`MUX_ASSET_ID=${assetId ?? ''}`);

    if (uploadUrl) {
        console.log('📤 Upload URL provided by Mux');
        console.log('📁 Starting file upload to Mux endpoint...');
        console.log(`📄 Uploading file: ${absPath}`);
        
        // Upload the file using Mux's direct upload protocol
        try {
            await uploadFileToMux(uploadUrl, absPath);
            console.log('✅ File uploaded successfully');
            
            // Wait a bit for Mux to process the upload
            console.log('⏳ Waiting for Mux to process the uploaded file...');
            await delay(10000); // Wait 10 seconds for processing to start
            
            // Now try to get the upload info again to get the asset_id
            let retrieve = uploadTools['retrieve_video_uploads'] || uploadTools['video.uploads.get'];
            if (!retrieve) {
                const invokeTool = uploadTools['invoke_api_endpoint'];
                if (invokeTool) {
                    retrieve = {
                        execute: async ({ context }: { context: any }) => {
                            return await invokeTool.execute({ 
                                context: { 
                                    endpoint_name: 'retrieve_video_uploads',
                                    arguments: context 
                                } 
                            });
                        }
                    };
                }
            }
            
            if (retrieve && uploadId) {
                console.log('[mux-upload-verify-real] Retrieving upload info to get asset_id...');
                try {
                    // Retrieve by upload id; prefer UPLOAD_ID key
                    const retrieveRes = await retrieve.execute({
                        context: {
                            UPLOAD_ID: uploadId,
                            upload_id: uploadId,
                            id: uploadId,
                        }
                    });
                    const retrieveBlocks = Array.isArray(retrieveRes) ? retrieveRes : [retrieveRes];
                    
                    for (const block of retrieveBlocks as any[]) {
                        const text = block && typeof block === 'object' && typeof block.text === 'string' ? block.text : undefined;
                        if (!text) continue;
                        try {
                            const payload = JSON.parse(text);
                            console.log('[mux-upload-verify-real] Retrieved upload info:', JSON.stringify(payload, null, 2));
                            // Handle common wrapper shapes: direct, {data:{}}, {upload:{}}
                            const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : payload;
                            const up = (data && typeof data === 'object' && 'upload' in data) ? (data as any).upload : data;
                            assetId = assetId || up.asset_id || up.assetId || up.asset?.id;
                            // Also check status
                            const status = up.status || data.status || payload.status;
                            console.log(`[mux-upload-verify-real] Upload status: ${status}`);
                        } catch {
                            // ignore non-JSON text blocks
                        }
                    }
                } catch (error) {
                    console.warn('[mux-upload-verify-real] Failed to retrieve upload info after file upload:', error);
                }
            }

            // If assetId still missing, poll retrieve_video_uploads until it appears
            if (!assetId && retrieve && uploadId) {
                const pollMsRetrieve = Math.max(2000, parseInt(process.env.MUX_RETRIEVE_POLL_MS || '5000', 10) || 5000);
                const timeoutMsRetrieve = Math.min(10 * 60 * 1000, Math.max(20_000, parseInt(process.env.MUX_RETRIEVE_TIMEOUT_MS || '180000', 10) || 180000));
                console.log(`[mux-upload-verify-real] Polling upload ${uploadId} for asset_id (every ${pollMsRetrieve}ms, timeout ${timeoutMsRetrieve}ms)...`);
                const startRetrieve = Date.now();
                while (!assetId && (Date.now() - startRetrieve) < timeoutMsRetrieve) {
                    try {
                        const r = await retrieve.execute({
                            context: {
                                UPLOAD_ID: uploadId,
                                upload_id: uploadId,
                                id: uploadId,
                            }
                        });
                        const rb = Array.isArray(r) ? r : [r];
                        for (const b of rb as any[]) {
                            const t = b && typeof b === 'object' && typeof b.text === 'string' ? b.text : undefined;
                            if (!t) continue;
                            try {
                                const payload = JSON.parse(t);
                                const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : payload;
                                const up = (data && typeof data === 'object' && 'upload' in data) ? (data as any).upload : data;
                                assetId = assetId || up.asset_id || up.assetId || up.asset?.id;
                                const status = up.status || data.status || payload.status;
                                console.log(`[mux-upload-verify-real] Upload status: ${status} ${assetId ? `(asset_id=${assetId})` : ''}`);
                                if (assetId) break;
                            } catch {}
                        }
                    } catch (e) {
                        console.warn('[mux-upload-verify-real] retrieve_video_uploads poll error:', e instanceof Error ? e.message : String(e));
                    }
                    if (!assetId) {
                        await delay(pollMsRetrieve);
                    }
                }
            }
        } catch (uploadError) {
            console.error('[mux-upload-verify-real] File upload failed:', uploadError);
            return;
        }
    } else {
        console.error('❌ No upload URL provided - cannot upload file');
        throw new Error('No upload URL provided - cannot upload file');
    }

    console.log('📊 Upload Summary:');
    console.log(`   Upload ID: ${uploadId}`);
    console.log(`   Asset ID: ${assetId || 'Not yet available'}`);

    if (!assetId) {
        console.warn('⚠️  No asset_id available after upload. This may be normal if asset creation is still in progress.');
        console.warn('💡 You can run asset verification later using the upload_id or check the Mux dashboard.');
        return;
    }

    // Always output player URL now that we have assetId
    console.log(`🎬 Player URL: https://streamingportfolio.com/player?assetId=${assetId}`);

    // 2) Poll asset status via assets client until ready/errored
    console.log('🔍 Connecting to Mux Assets MCP server...');
    const assetsTools = await assetsClient.getTools();
    console.log('✅ Connected to Mux Assets MCP server');

    // Try multiple possible tool names for getting asset
    console.log('🔍 Looking for asset retrieval tool...');
    let getAsset = assetsTools['get_video_assets'] ||
        assetsTools['retrieve_video_assets'] ||
        assetsTools['video.assets.get'] ||
        assetsTools['video.assets.retrieve'];

    // If no direct tools, use invoke_api_endpoint
    if (!getAsset) {
        const invokeTool = assetsTools['invoke_api_endpoint'];
        if (!invokeTool) {
            throw new Error('Mux MCP did not expose any asset retrieval tool or invoke_api_endpoint.');
        }
        
        getAsset = {
            execute: async ({ context }: { context: any }) => {
                return await invokeTool.execute({ 
                    context: { 
                        endpoint_name: 'retrieve_video_assets',
                        arguments: context 
                    } 
                });
            }
        };
    }
    console.log('✅ Asset retrieval tool found');

    const validStatuses = new Set(['preparing', 'processing', 'ready', 'errored']);
    const pollMs = Math.max(1000, parseInt(process.env.MUX_VERIFY_POLL_MS || '5000', 10) || 5000);
    const timeoutMs = Math.min(30 * 60 * 1000, Math.max(10_000, parseInt(process.env.MUX_VERIFY_TIMEOUT_MS || '300000', 10) || 300000));

    console.log(`⏳ Polling asset ${assetId} until ready...`);
    console.log(`   Poll interval: ${pollMs}ms`);
    console.log(`   Timeout: ${Math.round(timeoutMs / 1000)}s`);

    const start = Date.now();
    let finalStatus: string | undefined;
    let lastPayload: any;
    while (Date.now() - start < timeoutMs) {
        try {
            // Pass the asset ID with multiple key variants for compatibility
            const res = await getAsset.execute({ context: { id: assetId, ASSET_ID: assetId, asset_id: assetId } });
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

    console.log('🎉 Asset processing completed successfully!');

    // Output final, machine-readable summary
    const playbackId = Array.isArray(lastPayload?.playback_ids) && lastPayload.playback_ids.length > 0
        ? (lastPayload.playback_ids[0]?.id as string | undefined)
        : undefined;

    console.log('📋 Final Results:');
    console.log(`   Asset ID: ${assetId}`);
    if (playbackId) {
        console.log(`   Playback ID: ${playbackId}`);
        console.log(`   HLS URL: https://stream.mux.com/${playbackId}.m3u8`);
    } else {
        console.log('   ⚠️  No playback ID found - asset may not have playback URLs');
    }

    console.log('✅ Mux upload and verification succeeded. Asset is ready.');
    if (playbackId) {
        console.log(`🎥 Your video is now available at: https://stream.mux.com/${playbackId}.m3u8`);
    }
    } finally {
        try {
            console.log('🔌 Disconnecting from MCP servers...');
            await Promise.allSettled([
                uploadClient.disconnect(),
                assetsClient.disconnect(),
            ]);
            console.log('✅ Disconnected from MCP servers');
        } catch (error) {
            console.warn('⚠️  Error during disconnect:', error instanceof Error ? error.message : String(error));
        }
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