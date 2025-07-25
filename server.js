const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = 3000;
const itags = [133, 134, 135, 136, 137, 138, 298, 299, 264, 266];

// Store active downloads and their progress
const activeDownloads = new Map();

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Progress tracking utility
class ProgressTracker {
    constructor(downloadId) {
        this.downloadId = downloadId;
        this.clients = new Set();
        this.currentStatus = 'Initializing';
        this.currentProgress = 0;
    }

    addClient(res) {
        this.clients.add(res);
        // Send current status to new client
        this.sendProgress(this.currentStatus, this.currentProgress);
    }

    removeClient(res) {
        this.clients.delete(res);
    }

    sendProgress(status, progress) {
        this.currentStatus = status;
        this.currentProgress = progress;
        
        const data = JSON.stringify({ status, progress });
        console.log(`[${this.downloadId}] ${status} - ${progress}%`);
        
        this.clients.forEach(client => {
            try {
                client.write(`data: ${data}\n\n`);
            } catch (error) {
                console.error('Error sending progress to client:', error);
                this.clients.delete(client);
            }
        });
    }

    complete() {
        this.clients.forEach(client => {
            try {
                client.end();
            } catch (error) {
                console.error('Error ending client connection:', error);
            }
        });
        this.clients.clear();
        activeDownloads.delete(this.downloadId);
    }
}

// Enhanced endpoint to fetch video details with better error handling
app.post('/fetch-details', async (req, res) => {
    const url = req.body.url;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Validate YouTube URL
    const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/;
    if (!youtubeRegex.test(url)) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    try {
        console.log(`Fetching details for: ${url}`);
        const info = await ytdl.getInfo(url);
        const formats = info.formats.filter(format => itags.includes(format.itag));
        
        // Remove duplicate formats based on itag and sort by quality
        const uniqueFormats = Array.from(new Map(formats.map(format => [format.itag, format])).values())
            .sort((a, b) => {
                const aHeight = parseInt(a.height) || 0;
                const bHeight = parseInt(b.height) || 0;
                return bHeight - aHeight; // Sort by height descending
            });
        
        const title = info.videoDetails.title.replace(/[^\w\s.-]/g, ''); // Sanitize title
        const thumbnail = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url; // Get highest quality thumbnail

        console.log(`Successfully fetched details for: ${title}`);
        res.json({ title, formats: uniqueFormats, thumbnail });
    } catch (error) {
        console.error('Error fetching video details:', error);
        
        if (error.message.includes('Video unavailable')) {
            res.status(404).json({ error: 'Video not found or unavailable' });
        } else if (error.message.includes('Private video')) {
            res.status(403).json({ error: 'Private video - access denied' });
        } else {
            res.status(500).json({ error: 'Failed to fetch video details' });
        }
    }
});

// Server-Sent Events endpoint for progress tracking
app.get('/download-progress/:downloadId', (req, res) => {
    const downloadId = req.params.downloadId;
    
    // Set up SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    let tracker = activeDownloads.get(downloadId);
    if (!tracker) {
        tracker = new ProgressTracker(downloadId);
        activeDownloads.set(downloadId, tracker);
    }

    tracker.addClient(res);

    // Clean up when client disconnects
    req.on('close', () => {
        tracker.removeClient(res);
    });

    req.on('aborted', () => {
        tracker.removeClient(res);
    });
});

// Enhanced download endpoint with progress tracking and concurrent support
app.post('/download', async (req, res) => {
    const { url, format, quality, downloadId } = req.body;

    if (!url || !format) {
        return res.status(400).json({ error: 'URL and format are required' });
    }

    const id = downloadId || uuidv4();
    let tracker = activeDownloads.get(id);
    
    if (!tracker) {
        tracker = new ProgressTracker(id);
        activeDownloads.set(id, tracker);
    }

    console.log(`\n[${id}] Starting download - Format: ${format}, Quality: ${quality}`);

    try {
        // Get video info for sanitized filename
        tracker.sendProgress('Fetching video information...', 5);
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^\w\s.-]/g, '');
        
        if (format === 'video') {
            await downloadVideo(url, quality, title, id, tracker, res);
        } else if (format === 'audio') {
            await downloadAudio(url, title, id, tracker, res);
        } else {
            throw new Error('Invalid format specified');
        }

        tracker.complete();
    } catch (error) {
        console.error(`[${id}] Download error:`, error);
        tracker.sendProgress(`Error: ${error.message}`, 0);
        
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
        
        tracker.complete();
    }
});

// Video download function with progress tracking
async function downloadVideo(url, quality, title, downloadId, tracker, res) {
    return new Promise((resolve, reject) => {
        const videoPath = path.join(__dirname, 'downloads', `${downloadId}_video.mp4`);
        const audioPath = path.join(__dirname, 'downloads', `${downloadId}_audio.mp4`);
        const outputPath = path.join(__dirname, 'downloads', `${downloadId}_output.mp4`);

        let videoDownloaded = false;
        let audioDownloaded = false;

        // Download video stream
        tracker.sendProgress('Downloading video stream...', 10);
        
        const videoStream = ytdl(url, { filter: format => format.itag == quality });
        const videoFile = fs.createWriteStream(videoPath);

        videoStream.pipe(videoFile);

        videoStream.on('progress', (chunkLength, downloaded, total) => {
            const percent = Math.floor((downloaded / total) * 40); // 40% for video
            tracker.sendProgress('Downloading video stream...', 10 + percent);
        });

        videoFile.on('finish', () => {
            console.log(`[${downloadId}] Video stream downloaded`);
            videoDownloaded = true;
            if (audioDownloaded) {
                combineStreams();
            }
        });

        videoStream.on('error', (error) => {
            console.error(`[${downloadId}] Video download error:`, error);
            cleanup();
            reject(new Error('Failed to download video stream'));
        });

        // Download audio stream
        tracker.sendProgress('Downloading audio stream...', 50);
        
        const audioStream = ytdl(url, { quality: '140' }); // Best audio quality
        const audioFile = fs.createWriteStream(audioPath);

        audioStream.pipe(audioFile);

        audioStream.on('progress', (chunkLength, downloaded, total) => {
            const percent = Math.floor((downloaded / total) * 40); // 40% for audio
            tracker.sendProgress('Downloading audio stream...', 50 + percent);
        });

        audioFile.on('finish', () => {
            console.log(`[${downloadId}] Audio stream downloaded`);
            audioDownloaded = true;
            if (videoDownloaded) {
                combineStreams();
            }
        });

        audioStream.on('error', (error) => {
            console.error(`[${downloadId}] Audio download error:`, error);
            cleanup();
            reject(new Error('Failed to download audio stream'));
        });

        function combineStreams() {
            tracker.sendProgress('Combining video and audio...', 90);
            console.log(`[${downloadId}] Combining streams with FFmpeg`);

            ffmpeg()
                .input(videoPath)
                .input(audioPath)
                .outputOptions('-c:v copy')
                .outputOptions('-c:a aac')
                .outputOptions('-movflags faststart') // Optimize for web playback
                .output(outputPath)
                .on('progress', (progress) => {
                    const percent = Math.floor(90 + (progress.percent || 0) * 0.1);
                    tracker.sendProgress('Combining video and audio...', Math.min(percent, 99));
                })
                .on('end', () => {
                    console.log(`[${downloadId}] Combination complete`);
                    tracker.sendProgress('Download completed!', 100);
                    
                    // Send file to client
                    const filename = `${title}.mp4`;
                    res.download(outputPath, filename, (err) => {
                        if (err) {
                            console.error(`[${downloadId}] File send error:`, err);
                        }
                        cleanup();
                        resolve();
                    });
                })
                .on('error', (error) => {
                    console.error(`[${downloadId}] FFmpeg error:`, error);
                    cleanup();
                    reject(new Error('Failed to combine video and audio'));
                })
                .run();
        }

        function cleanup() {
            [videoPath, audioPath, outputPath].forEach(filePath => {
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (error) {
                        console.error(`[${downloadId}] Cleanup error for ${filePath}:`, error);
                    }
                }
            });
        }
    });
}

// Audio download function with progress tracking
async function downloadAudio(url, title, downloadId, tracker, res) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(__dirname, 'downloads', `${downloadId}_audio.mp3`);
        
        tracker.sendProgress('Downloading audio...', 10);
        console.log(`[${downloadId}] Starting audio download`);

        const stream = ytdl(url, { quality: 'highestaudio' });
        const startTime = Date.now();

        const command = ffmpeg(stream)
            .audioBitrate(128)
            .format('mp3')
            .save(outputPath);

        command.on('progress', (progress) => {
            const percent = Math.floor((progress.percent || 0));
            tracker.sendProgress('Processing audio...', Math.min(percent, 95));
            
            if (progress.targetSize) {
                const elapsed = (Date.now() - startTime) / 1000;
                console.log(`[${downloadId}] ${progress.targetSize}kb processed in ${elapsed.toFixed(1)}s`);
            }
        });

        command.on('end', () => {
            const elapsed = (Date.now() - startTime) / 1000;
            console.log(`[${downloadId}] Audio processing complete - ${elapsed.toFixed(1)}s`);
            tracker.sendProgress('Download completed!', 100);

            const filename = `${title}.mp3`;
            res.download(outputPath, filename, (err) => {
                if (err) {
                    console.error(`[${downloadId}] File send error:`, err);
                }
                
                // Cleanup
                if (fs.existsSync(outputPath)) {
                    try {
                        fs.unlinkSync(outputPath);
                    } catch (error) {
                        console.error(`[${downloadId}] Cleanup error:`, error);
                    }
                }
                resolve();
            });
        });

        command.on('error', (error) => {
            console.error(`[${downloadId}] Audio processing error:`, error);
            
            // Cleanup on error
            if (fs.existsSync(outputPath)) {
                try {
                    fs.unlinkSync(outputPath);
                } catch (cleanupError) {
                    console.error(`[${downloadId}] Cleanup error:`, cleanupError);
                }
            }
            
            reject(new Error('Failed to process audio'));
        });
    });
}

app.listen(port, () => {
    console.log('='.repeat(60));
    console.log('🚀 YTDLer Server Started Successfully!');
    console.log('='.repeat(60));
    console.log(`📍 Server running at: http://localhost:${port}`);
    console.log(`📁 Downloads folder: ${downloadsDir}`);
    console.log(`🎯 Supported formats: Video (MP4), Audio (MP3)`);
    console.log(`⚡ Concurrent downloads: Enabled`);
    console.log(`📊 Progress tracking: Real-time`);
    console.log('='.repeat(60));
    console.log('Ready to process YouTube downloads! 🎉\n');
});