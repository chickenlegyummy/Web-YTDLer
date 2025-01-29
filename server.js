const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.post('/download', (req, res) => {
    const url = req.body.url;

    // Create temporary files for video and audio
    const videoPath = path.join(__dirname, 'downloads', 'video.mp4');
    const audioPath = path.join(__dirname, 'downloads', 'audio.mp4');
    const outputPath = path.join(__dirname, 'downloads', 'output.mp4');

    // Download video
    ytdl(url, { quality: 'highestvideo' })
        .pipe(fs.createWriteStream(videoPath))
        .on('finish', () => {
            // Download audio
            ytdl(url, { quality: '140' }) // '140' is often the best audio quality
                .pipe(fs.createWriteStream(audioPath))
                .on('finish', () => {
                    // Combine video and audio using FFmpeg
                    ffmpeg()
                        .input(videoPath)
                        .input(audioPath)
                        .outputOptions('-c:v copy') // Copy video codec
                        .outputOptions('-c:a aac') // Use AAC audio codec
                        .output(outputPath)
                        .on('end', () => {
                            // Send the combined file to the user
                            res.download(outputPath, (err) => {
                                // Clean up temporary files
                                fs.unlinkSync(videoPath);
                                fs.unlinkSync(audioPath);
                                fs.unlinkSync(outputPath);
                            });
                        })
                        .on('error', (err) => {
                            console.error(err);
                            res.status(500).send('Error combining video and audio');
                        })
                        .run();
                });
        });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});