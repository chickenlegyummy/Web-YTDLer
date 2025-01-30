const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3000;
const itags = [133, 134, 135, 136, 137, 138, 298, 299, 264, 266];

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Endpoint to fetch video details
app.post('/fetch-details', async (req, res) => {
    const url = req.body.url;

    try {
        const info = await ytdl.getInfo(url);
        const formats = info.formats.filter(format => itags.includes(format.itag));
        // Remove duplicate formats based on itag
        const uniqueFormats = Array.from(new Map(formats.map(format => [format.itag, format])).values());
        const title = info.videoDetails.title;
        const thumbnail = info.videoDetails.thumbnails[0].url;

        res.json({ title, formats: uniqueFormats, thumbnail });
    } catch (error) {
        console.error('Error fetching video details:', error);
        res.status(500).send('Error fetching video details');
    }
});

app.post('/download', (req, res) => {
    const url = req.body.url;
    const format = req.body.format;
    const quality = req.body.quality;

    console.log(format, quality);

    // Create temporary files for video and audio
    const videoPath = path.join(__dirname, 'downloads', 'video.mp4');
    const audioPath = path.join(__dirname, 'downloads', 'audio.mp4');
    const outputPath = path.join(__dirname, 'downloads', 'output.mp4');
    if (format === 'video') {
        // Download video
        ytdl(url, { filter: format => format.itag == quality })
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
    } 
    else if (format === 'audio') {
        let stream = ytdl(url, {
            quality: 'highestaudio',
          });
        let start = Date.now();
        ffmpeg(stream)
        .audioBitrate(128)
        .save(`${__dirname}/downloads/audio.mp3`)
        .on('progress', p => {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`${p.targetSize}kb downloaded`);
        })  
        .on('end', () => {
            console.log(`\ndone, thanks - ${(Date.now() - start) / 1000}s`);
            res.download(`${__dirname}/downloads/audio.mp3`, (err) => {
                fs.unlinkSync(`${__dirname}/downloads/audio.mp3`);
            });
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});